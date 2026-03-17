import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';

// Configuration
import { CONFIG, validateConfig } from './config/index.js';

// Services
import ollamaService from './services/ollama.js';
import database from './services/database.js';
import { initializeCharacters } from './controllers/characterController.js';
import { selectMessages } from './services/contextWindow.js';
import { processPostChat } from './services/postChatProcessor.js';
import { searchMessages, detectRecallTriggers } from './services/memorySearch.js';
import { getRelevantGlobalMemories } from './services/globalMemory.js';
import { searchWeb, formatSearchResults, shouldSearch } from './services/webSearch.js';

// Routes
import sessionsRouter from './routes/sessions.js';
import charactersRouter from './routes/characters.js';
import templatesRouter from './routes/templates.js';
import memoryRouter from './routes/memory.js';

// Middleware
import {
  securityHeaders,
  corsConfig,
  requestSizeMonitor,
  securityLogger,
  sanitizeInputs,
  csrfProtect,
  generateCsrfToken
} from './middleware/security.js';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler.js';
import { validate, chatSchema, modelPullSchema } from './middleware/validation.js';

const app = express();
const PORT = CONFIG.PORT;

// Validate configuration on startup
validateConfig();

// ===== SECURITY MIDDLEWARE =====

// Security headers (Helmet)
app.use(securityHeaders);

// CORS with strict configuration
app.use(cors(corsConfig));

// Cookie parser (for session management)
app.use(cookieParser());

// Session management
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: CONFIG.isProduction, // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  },
  name: 'oread.sid' // Custom session name
}));

// Request size validation and monitoring
app.use(requestSizeMonitor);

// Body parser with size limit
app.use(express.json({ limit: CONFIG.MAX_UPLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: CONFIG.MAX_UPLOAD_SIZE }));

// Input sanitization
app.use(sanitizeInputs);

// Security logging
app.use(securityLogger);

// CSRF protection for state-changing requests
app.use(csrfProtect);

// ===== SERVICES INITIALIZATION =====

async function initializeServices() {
  try {
    console.log('🔌 Initializing services...');

    // Initialize database
    await database.initialize();

    // Initialize character system
    initializeCharacters();

    console.log('✅ All services initialized');
    console.log(`🔒 Security: Auth=${CONFIG.ENABLE_AUTH ? 'ENABLED' : 'DISABLED (dev mode)'}`);
    return true;
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
    throw error;
  }
}

// ===== API ROUTES =====

// CSRF token endpoint — frontend calls this once on load, then sends token as X-CSRF-Token header
app.get('/api/csrf-token', (req, res) => {
  const token = generateCsrfToken(req);
  res.json({ success: true, csrfToken: token });
});

app.use('/api/sessions', sessionsRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/memory', memoryRouter);

// ===== HEALTH CHECK =====

app.get('/api/health', asyncHandler(async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Check Ollama
  try {
    await ollamaService.checkHealth();
    health.services.ollama = 'ok';
  } catch (error) {
    health.services.ollama = 'error';
    health.status = 'degraded';
  }

  // Check database
  try {
    await database.get('SELECT 1');
    health.services.database = 'ok';
  } catch (error) {
    health.services.database = 'error';
    health.status = 'error';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
}));

// ===== MODEL MANAGEMENT =====

// List available models
app.get('/api/models', asyncHandler(async (req, res) => {
  const result = await ollamaService.listModels();
  res.json(result);
}));

// Pull/download a model with SSE for progress updates
app.post('/api/models/pull', validate(modelPullSchema), asyncHandler(async (req, res) => {
  const { modelName } = req.body;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await ollamaService.pullModel(modelName);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ status: 'success', completed: true })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ status: 'error', error: CONFIG.isDevelopment ? error.message : 'Download failed' })}\n\n`);
    res.end();
  }
}));

// ===== CHAT ENDPOINT =====

// Chat endpoint with streaming response
app.post('/api/chat', validate(chatSchema), asyncHandler(async (req, res) => {
  const { model, messages, systemPrompt, temperature, topP, frequencyPenalty, maxTokens, sessionId, settings } = req.body;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Build options object
    const options = {
      systemPrompt: systemPrompt || undefined,
      temperature: temperature !== undefined ? temperature : undefined,
      topP: topP !== undefined ? topP : undefined,
      frequencyPenalty: frequencyPenalty !== undefined ? frequencyPenalty : undefined,
      maxTokens: maxTokens !== undefined ? maxTokens : undefined
    };

    // Log received parameters (sanitized)
    if (CONFIG.isDevelopment) {
      console.log('💬 Chat Request:');
      console.log('Model:', model);
      console.log('Messages:', messages.length);
      console.log('Temperature:', temperature, 'Top P:', topP);
    }

    // Save user message before streaming so it's persisted regardless of what follows
    let userMessageId = null;
    if (sessionId) {
      const userMsg = messages[messages.length - 1];
      userMessageId = await saveMessageToSession(sessionId, userMsg);
      // Emit user message ID so client can support pinning
      res.write(`data: ${JSON.stringify({ meta: 'user_saved', messageId: userMessageId })}\n\n`);
    }

    // Determine messages to send: use context window if we have a session
    let messagesToSend = messages;
    let finalSystemPrompt = systemPrompt;

    if (sessionId) {
      try {
        // Load all messages from DB with pinned flags
        const dbMessages = await database.all(
          `SELECT role, content, pinned FROM messages WHERE session_id = ? ORDER BY timestamp ASC`,
          [sessionId]
        );

        // Load session context data
        const session = await database.get(
          `SELECT story_notes, extracted_facts, rolling_summary, world_state, character_stances FROM sessions WHERE id = ?`,
          [sessionId]
        );

        const storyNotes = session?.story_notes || '';
        const rollingSummary = session?.rolling_summary || '';
        let worldStateData = {};
        try { worldStateData = JSON.parse(session?.world_state || '{}'); } catch (e) { /* invalid JSON */ }
        let extractedFactsData = [];
        try { extractedFactsData = JSON.parse(session?.extracted_facts || '[]'); } catch (e) { /* invalid JSON */ }
        let characterStancesData = {};
        try { characterStancesData = JSON.parse(session?.character_stances || '{}'); } catch (e) { /* invalid JSON */ }

        const contextBudget = settings?.general?.contextBudget || 4096;

        // Check for recall triggers in user message
        const userContent = messages[messages.length - 1]?.content || '';
        let recalledMessages = [];
        const { needsRecall, searchTerms } = detectRecallTriggers(userContent);
        if (needsRecall) {
          for (const term of searchTerms) {
            const results = await searchMessages(sessionId, term, { limit: 3 });
            recalledMessages.push(...results);
          }
          // Deduplicate by content
          const seen = new Set();
          recalledMessages = recalledMessages.filter(m => {
            const key = m.content.substring(0, 100);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }

        // Load cross-session global memory if enabled
        let globalContext = null;
        const crossSessionEnabled = settings?.general?.crossSessionMemory !== false;
        if (crossSessionEnabled) {
          const characterName = settings?.roleplay?.character?.name;
          const userName = settings?.userPersona?.name;
          if (characterName && userName) {
            try {
              const { memories, relationship } = await getRelevantGlobalMemories(
                characterName, userName, userContent, { limit: 10 }
              );
              if (relationship || memories.length > 0) {
                globalContext = { memories, relationship, userName };
              }
            } catch (err) {
              console.error('Global memory load error:', err);
            }
          }
        }

        // Web search if enabled
        let webSearchBlock = '';
        if (settings?.general?.webSearch && settings?.general?.braveApiKey && shouldSearch(userContent)) {
          try {
            if (CONFIG.isDevelopment) {
              console.log(`🔍 Web search: "${userContent.substring(0, 80)}"`);
            }
            const results = await searchWeb(userContent, settings.general.braveApiKey);
            webSearchBlock = formatSearchResults(results);
            if (CONFIG.isDevelopment) {
              console.log(`🔍 Web search: ${results.sources?.length || 0} sources, ${results.context?.length || 0} chars context`);
            }
          } catch (err) {
            console.warn('Web search error:', err.message);
          }
        } else if (CONFIG.isDevelopment && settings?.general?.webSearch && shouldSearch(userContent)) {
          console.log('🔍 Web search enabled but no API key configured');
        }

        const { messages: windowedMessages, contextBlock } = selectMessages({
          messages: dbMessages.map(m => ({ role: m.role, content: m.content, pinned: !!m.pinned })),
          systemPrompt: systemPrompt || '',
          storyNotes,
          extractedFacts: extractedFactsData,
          contextBudget,
          rollingSummary,
          worldState: worldStateData,
          characterStances: characterStancesData,
          recalledMessages,
          globalContext,
          mode: settings?.mode
        });

        messagesToSend = windowedMessages;

        // Append context block + web search to system prompt
        const fullContext = [contextBlock, webSearchBlock].filter(Boolean).join('\n\n');
        if (fullContext) {
          finalSystemPrompt = (systemPrompt || '') + '\n\n' + fullContext;
          options.systemPrompt = finalSystemPrompt;
        }

        if (CONFIG.isDevelopment) {
          console.log(`📦 Context window: ${dbMessages.length} total → ${windowedMessages.length} selected (budget: ${contextBudget})`);
        }
      } catch (err) {
        console.error('Context window error, falling back to raw messages:', err);
        // Fall back to original messages
      }
    }

    const stream = await ollamaService.chat(model, messagesToSend, options);

    let assistantResponse = '';

    for await (const chunk of stream) {
      if (chunk.message?.content) {
        assistantResponse += chunk.message.content;
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // Save assistant message before ending the response so the DB is consistent
    // before the client considers the turn complete
    let assistantMessageId = null;
    if (sessionId) {
      const assistantMsg = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date().toISOString()
      };
      assistantMessageId = await saveMessageToSession(sessionId, assistantMsg);
      console.log('✅ Messages saved to session');

      // Emit assistant message ID
      res.write(`data: ${JSON.stringify({ meta: 'assistant_saved', messageId: assistantMessageId })}\n\n`);

      // Post-chat processing: fact extraction, summarization, world state
      processPostChat({
        sessionId,
        userContent: messages[messages.length - 1]?.content || '',
        assistantResponse,
        model,
        settings,
        isDevelopment: CONFIG.isDevelopment
      });
    }

    res.end();
  } catch (error) {
    const errorMsg = CONFIG.isDevelopment ? error.message : 'Chat request failed';
    res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
    res.end();
  }
}));

// ===== HELPER FUNCTIONS =====

async function saveMessageToSession(sessionId, message) {
  const { v4: uuidv4 } = await import('uuid');
  const messageId = uuidv4();
  const timestamp = message.timestamp || new Date().toISOString();

  await database.transaction(async () => {
    await database.run(
      `INSERT INTO messages (id, session_id, role, content, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [messageId, sessionId, message.role, message.content, timestamp]
    );

    await database.run(
      `UPDATE sessions
       SET message_count = message_count + 1,
           last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [sessionId]
    );
  });

  return messageId;
}

// ===== ERROR HANDLING =====

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ===== GRACEFUL SHUTDOWN =====

let server;

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');

      try {
        await database.close();
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ===== SERVER STARTUP =====

async function startServer() {
  try {
    await initializeServices();

    server = app.listen(PORT, () => {
      console.log(`🚀 Oread Chat Backend running on http://localhost:${PORT}`);
      console.log(`🔒 Environment: ${CONFIG.NODE_ENV}`);
      console.log(`🔐 Security Features:`);
      console.log(`   - Rate Limiting: ENABLED`);
      console.log(`   - CORS: ${CONFIG.ALLOWED_ORIGINS.join(', ')}`);
      console.log(`   - Security Headers: ENABLED (Helmet)`);
      console.log(`   - Input Validation: ENABLED`);
      console.log(`   - Path Traversal Protection: ENABLED`);
      console.log(`   - SQL Injection Protection: ENABLED`);
      console.log(`   - File Upload Validation: ENABLED`);
      console.log(`📡 API endpoints:`);
      console.log(`   - GET  /api/health`);
      console.log(`   - GET  /api/models`);
      console.log(`   - POST /api/models/pull`);
      console.log(`   - POST /api/chat`);
   
      console.log(`   - /api/sessions/*`);
      console.log(`   - /api/characters/*`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
