/**
 * Chat endpoint with session support
 */
import { Router } from 'express';
import { chatRequestSchema } from '../schemas/chatSchemas.js';
import { getSessionManager } from '../core/sessionManager.js';
import { InputSanitizer } from '../utils/sanitizer.js';
import crypto from 'crypto';

const router = Router();

// Helper to get or generate session ID
function getSessionId(req) {
    // Check for session ID in body, header, or generate new one
    return req.body.sessionId ||
           req.headers['x-session-id'] ||
           crypto.randomUUID();
}

// Standard synchronous chat endpoint with session support
router.post('/chat', async (req, res) => {
    try {
        // Validate request
        const parseResult = chatRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                error: 'Validation Error',
                details: parseResult.error.errors
            });
        }
        const { message } = parseResult.data;

        // Get or generate session ID
        const sessionId = getSessionId(req);

        // Get character name from request (optional - for per-session character)
        const characterName = req.body.characterName || null;

        // Get request ID for race condition prevention
        const requestId = req.body.requestId || null;

        // Sanitize input
        const sanitizedMessage = InputSanitizer.sanitizeChatMessage(message);

        // Get encryption key from session
        const encryptionKey = req.session?.encryptionKey || null;

        // Get session-specific chatbot instance with character
        const sessionManager = getSessionManager();
        const chatbot = await sessionManager.getChatbot(sessionId, characterName, encryptionKey);

        // Track request ID for race condition detection
        sessionManager.trackRequestId(sessionId, requestId);

        // Check if this character needs a starter (first time being used)
        const activeCharacterName = chatbot.getActiveCharacterName();
        const needsStarter = sessionManager.needsStarter(activeCharacterName);

        // Process message with session and user info for memory persistence
        const result = await chatbot.processMessage(sanitizedMessage, sessionId, 'default');

        // Return response with session ID, active character, request ID, and starter flag
        res.json({
            sessionId: sessionId,
            characterName: activeCharacterName,
            requestId: requestId,  // Echo back request ID for validation
            needsStarter: needsStarter,  // Tell frontend if starter should be requested
            response: result.response,
            emotion: result.metadata.emotion,
            sentiment: result.metadata.sentiment,
            metadata: result.metadata
        });
    }
    catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'An error occurred processing your message'
        });
    }
});

// Streaming chat endpoint with session support using Server-Sent Events (SSE)
// This allows the UI to remain responsive while AI generates response
router.post('/chat/stream', async (req, res) => {
    try {
        // Validate request
        const parseResult = chatRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({
                error: 'Validation Error',
                details: parseResult.error.errors
            });
        }
        const { message } = parseResult.data;

        // Get or generate session ID
        const sessionId = getSessionId(req);

        // Get character name from request (optional - for per-session character)
        const characterName = req.body.characterName || null;

        // Get request ID for race condition prevention
        const requestId = req.body.requestId || null;

        const sanitizedMessage = InputSanitizer.sanitizeChatMessage(message);

        // Get encryption key from session
        const encryptionKey = req.session?.encryptionKey || null;

        // Set headers for Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send initial event to confirm connection with session ID and request ID
        res.write('event: connected\n');
        res.write(`data: ${JSON.stringify({status: "connected", sessionId: sessionId, requestId: requestId})}\n\n`);

        // Get session-specific chatbot instance with character
        const sessionManager = getSessionManager();
        const chatbot = await sessionManager.getChatbot(sessionId, characterName, encryptionKey);

        // Track request ID for race condition detection
        sessionManager.trackRequestId(sessionId, requestId);

        // Process message asynchronously with session and user info
        const result = await chatbot.processMessage(sanitizedMessage, sessionId, 'default');

        // Send the complete response as an event
        res.write('event: message\n');
        res.write(`data: ${JSON.stringify({
            sessionId: sessionId,
            requestId: requestId,  // Echo back request ID
            response: result.response,
            emotion: result.metadata.emotion,
            sentiment: result.metadata.sentiment,
            metadata: result.metadata
        })}\n\n`);

        // Send completion event
        res.write('event: done\n');
        res.write('data: {"status":"complete"}\n\n');

        res.end();
    }
    catch (error) {
        console.error('Streaming chat error:', error);
        // Send error event
        res.write('event: error\n');
        res.write(`data: ${JSON.stringify({
            error: 'Internal Server Error',
            message: error.message || 'An error occurred processing your message'
        })}\n\n`);
        res.end();
    }
});

// Clear session history
router.post('/chat/clear', async (req, res) => {
    try {
        const sessionId = getSessionId(req);
        const sessionManager = getSessionManager();
        sessionManager.clearSession(sessionId);

        res.json({
            success: true,
            sessionId: sessionId,
            message: 'Session history cleared'
        });
    } catch (error) {
        console.error('Clear session error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Could not clear session'
        });
    }
});

// Sanitize session history (remove system prompts)
router.post('/chat/sanitize', async (req, res) => {
    try {
        const sessionId = getSessionId(req);
        const sessionManager = getSessionManager();
        const chatbot = await sessionManager.getChatbot(sessionId);

        chatbot.sanitizeHistory();

        res.json({
            success: true,
            sessionId: sessionId,
            message: 'Session history sanitized (system prompts removed)'
        });
    } catch (error) {
        console.error('Sanitize session error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Could not sanitize session'
        });
    }
});

// Cancel pending inference request
router.post('/chat/cancel', async (req, res) => {
    try {
        const sessionId = req.body.sessionId || getSessionId(req);
        const requestId = req.body.requestId;

        if (!requestId) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'requestId is required'
            });
        }

        // Get inference client
        const inferenceClient = getInferenceClient();

        // Attempt to cancel the inference request
        try {
            await inferenceClient.cancelRequest(sessionId, requestId);
        } catch (cancelError) {
            // Don't fail the endpoint if cancellation fails
            // The request might already be complete
        }

        res.json({
            success: true,
            message: 'Cancellation signal sent',
            sessionId: sessionId,
            requestId: requestId
        });
    } catch (error) {
        console.error('Cancel request error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Could not cancel request'
        });
    }
});

// Delete session completely
router.delete('/chat/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionManager = getSessionManager();
        sessionManager.deleteSession(sessionId);

        res.json({
            success: true,
            message: 'Session deleted'
        });
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Could not delete session'
        });
    }
});

// Get session stats (for debugging/admin)
router.get('/chat/sessions/stats', async (req, res) => {
    try {
        const sessionManager = getSessionManager();
        const stats = sessionManager.getStats();

        res.json(stats);
    } catch (error) {
        console.error('Session stats error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Could not get session stats'
        });
    }
});

// Get conversation starter for a character
router.get('/chat/starter', async (req, res) => {
    try {
        // Get session ID and character name from query params
        const sessionId = req.query.sessionId || crypto.randomUUID();
        const characterName = req.query.characterName || null;
        const forceRegenerate = req.query.force === 'true';  // Allow forced regeneration

        // Get encryption key from session
        const encryptionKey = req.session?.encryptionKey || null;

        // Get session-specific chatbot instance with character
        const sessionManager = getSessionManager();
        const chatbot = await sessionManager.getChatbot(sessionId, characterName, encryptionKey);

        // Check if this character needs a starter (skip check if forced regeneration)
        const activeCharacterName = chatbot.getActiveCharacterName();
        if (!forceRegenerate && !sessionManager.needsStarter(activeCharacterName)) {
            // Character already has a starter in another tab - skip it
            return res.json({
                sessionId: sessionId,
                characterName: activeCharacterName,
                starter: null,  // Null indicates no starter needed
                skipStarter: true
            });
        }

        // SIMPLIFIED starter prompt - the inference service already has time context and character instructions
        const starterPrompt = `[System: Generate a brief, natural conversation starter as your character.

REQUIREMENTS:
- Acknowledge the current time of day appropriately (morning/afternoon/evening/night)
- Be engaging, authentic, and in-character
- For romantic companions: create warmth and physical presence
- For platonic companions: bring up an interesting topic
- Use user's interests/preferences if available
- Be specific and detailed, not generic
- Do NOT just say "hello" or "how are you"

Generate your conversation starter now:]`;

        // CRITICAL: Pass skipHistory=true to prevent adding the system prompt to conversation history
        // This prevents the massive starter prompt from being included in every subsequent message
        const result = await chatbot.processMessage(starterPrompt, sessionId, 'default', true);

        // Clean up response - remove any stray closing brackets that leaked from system prompt
        let cleanedResponse = result.response;

        // Remove the entire system prompt if it leaked into the response
        if (cleanedResponse.includes('[System:')) {
            const systemPromptStart = cleanedResponse.indexOf('[System:');
            if (systemPromptStart !== -1) {
                // Only take content before the system prompt leak
                cleanedResponse = cleanedResponse.substring(0, systemPromptStart).trim();
            }
        }

        // If response is empty or still contains system instructions, return a fallback
        if (!cleanedResponse || cleanedResponse.includes('REQUIREMENTS') || cleanedResponse.length < 10) {
            // Simple generic fallback
            cleanedResponse = `Hello! I'm ${activeCharacterName}. How are you doing today?`;
        }

        if (cleanedResponse.endsWith(']')) {
            cleanedResponse = cleanedResponse.slice(0, -1).trim();
        }
        // Also remove any trailing ] that might appear before final punctuation
        cleanedResponse = cleanedResponse.replace(/\s*\]\s*([.!?]*)$/, '$1');

        // Mark this character as having shown a starter
        sessionManager.markStarterShown(activeCharacterName);

        // Return response with session ID
        res.json({
            sessionId: sessionId,
            characterName: activeCharacterName,
            starter: cleanedResponse
        });
    } catch (error) {
        console.error('Conversation starter error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Could not generate conversation starter'
        });
    }
});

// Delete ALL conversations
router.delete('/conversations/delete-all', async (req, res) => {
    try {
        const sessionManager = getSessionManager();
        const sessionCount = sessionManager.sessions.size;

        // Clear all sessions
        sessionManager.sessions.clear();
        sessionManager.lastActivity.clear();
        sessionManager.charactersWithStarters.clear();

        res.json({
            success: true,
            deleted_count: sessionCount,
            message: 'All conversation history has been permanently deleted'
        });
    } catch (error) {
        console.error('Error deleting all conversations:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Failed to delete conversations'
        });
    }
});

// Delete conversations for a specific character
router.delete('/conversations/delete-character/:characterName', async (req, res) => {
    try {
        const { characterName } = req.params;
        const sessionManager = getSessionManager();

        let deletedCount = 0;

        // Iterate through all sessions and delete those with matching character
        for (const [sessionId, chatbot] of sessionManager.sessions.entries()) {
            try {
                const activeCharacter = chatbot.getActiveCharacterName();
                if (activeCharacter === characterName) {
                    sessionManager.sessions.delete(sessionId);
                    sessionManager.lastActivity.delete(sessionId);
                    deletedCount++;
                }
            } catch (error) {
                console.warn(`Error checking session ${sessionId}:`, error.message);
            }
        }

        // Remove character from starters list
        sessionManager.charactersWithStarters.delete(characterName);

        res.json({
            success: true,
            deleted_count: deletedCount,
            character: characterName,
            message: `All conversations with ${characterName} have been permanently deleted`
        });
    } catch (error) {
        console.error('Error deleting character conversations:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message || 'Failed to delete character conversations'
        });
    }
});

export default router;
//# sourceMappingURL=chat.js.map