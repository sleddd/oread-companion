import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';

// Configuration
import { CONFIG, validateConfig } from './config/index.js';

// Services
import ollamaService from './services/ollama.js';
import mcpClient from './services/mcpClient.js';
import database from './services/database.js';
import langchainRAG from './services/langchainRAG.js';
import extractionAgent from './services/extractionAgent.js';
import { initializeCharacters } from './controllers/characterController.js';

// Routes
import sessionsRouter from './routes/sessions.js';
import memoryRouter from './routes/memory.js';
import charactersRouter from './routes/characters.js';
import templatesRouter from './routes/templates.js';

// Middleware
import {
  generalLimiter,
  strictLimiter,
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

// General rate limiting for all API routes
app.use('/api', generalLimiter);

// CSRF protection for state-changing requests
app.use(csrfProtect);

// ===== SERVICES INITIALIZATION =====

async function initializeServices() {
  try {
    console.log('🔌 Initializing services...');

    // Initialize database
    await database.initialize();

    // Initialize MCP clients
    await mcpClient.initialize();

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
app.use('/api/memory', memoryRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/templates', templatesRouter);

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

  // Check MCP
  health.services.mcp = mcpClient.clients ? 'ok' : 'not_initialized';

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
app.post('/api/models/pull', strictLimiter, validate(modelPullSchema), asyncHandler(async (req, res) => {
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

// Chat endpoint with streaming response and RAG support
app.post('/api/chat', strictLimiter, validate(chatSchema), asyncHandler(async (req, res) => {
  const { model, messages, systemPrompt, temperature, topP, maxTokens, sessionId, settings } = req.body;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let messagesToSend = messages;
  let ragUsed = false;

  try {
    // Check if we should use RAG
    if (sessionId && settings) {
      const shouldUseRAG = await langchainRAG.shouldUseRAG(sessionId, settings);

      if (shouldUseRAG) {
        console.log('🧠 Using RAG for context retrieval');

        // Get last user message
        const userMessage = messages[messages.length - 1]?.content || '';

        // Get RAG context
        const ragResult = await langchainRAG.queryWithRAG(sessionId, userMessage, settings, model);

        // Use only recent messages from RAG
        const recentMessages = await langchainRAG.getRecentMessages(sessionId, 20);
        messagesToSend = recentMessages.map(m => ({
          role: m.role,
          content: m.content
        }));

        ragUsed = true;
        console.log(`✅ RAG: ${ragResult.recentMessageCount} recent + ${ragResult.vectorResultCount} retrieved`);
      }
    }

    // Build options object
    const options = {
      systemPrompt: systemPrompt || undefined,
      temperature: temperature !== undefined ? temperature : undefined,
      topP: topP !== undefined ? topP : undefined,
      maxTokens: maxTokens !== undefined ? maxTokens : undefined
    };

    // Log received parameters (sanitized)
    if (CONFIG.isDevelopment) {
      console.log('💬 Chat Request:');
      console.log('Model:', model);
      console.log('Messages:', messagesToSend.length, ragUsed ? '(RAG)' : '(Full)');
      console.log('Temperature:', temperature, 'Top P:', topP);
    }

    // Save user message before streaming so it's persisted regardless of what follows
    let userMsgId = null;
    if (sessionId) {
      const userMsg = messages[messages.length - 1];
      userMsgId = await saveMessageToSession(sessionId, userMsg);
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
    let assistantMsgId = null;
    if (sessionId) {
      const assistantMsg = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date().toISOString()
      };
      assistantMsgId = await saveMessageToSession(sessionId, assistantMsg);
      console.log('✅ Messages saved to session');
    }

    res.end();

    // Background tasks: embeddings and extraction are not critical-path, fine as fire-and-forget
    if (sessionId && settings?.general?.memory) {
      const userMsg = messages[messages.length - 1];
      const assistantMsg = { role: 'assistant', content: assistantResponse };

      langchainRAG.addDocuments(sessionId, [
        { ...userMsg, id: userMsgId },
        { ...assistantMsg, id: assistantMsgId }
      ]).catch(err => console.error('Embedding error:', err));

      if (settings?.mode === 'roleplay') {
        extractionAgent.shouldRunAnalysis(sessionId).then(async shouldAnalyze => {
          if (shouldAnalyze) {
            console.log('🔍 Running extraction analysis...');
            const result = await extractionAgent.analyzeConversation(sessionId, settings);
            if (result.proposed_updates.length > 0) {
              console.log(`💡 Found ${result.proposed_updates.length} suggested updates`);
              await saveExtractionResults(sessionId, result.proposed_updates);
            }
          }
        }).catch(err => console.error('Extraction error:', err));
      }
    }
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

async function saveExtractionResults(sessionId, proposedUpdates) {
  try {
    await mcpClient.executeSQLite(
      `UPDATE messages
       SET extracted_data = ?,
           extraction_status = 'pending'
       WHERE session_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [JSON.stringify(proposedUpdates), sessionId]
    );
  } catch (error) {
    console.error('Save extraction results error:', error);
    throw error;
  }
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
        await mcpClient.close();
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
      console.log(`   - /api/memory/*`);
      console.log(`   - /api/characters/*`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
