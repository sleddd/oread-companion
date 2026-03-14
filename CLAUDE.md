# Claude Developer Documentation

> **Purpose**: Complete context for AI assistants to understand and continue development on this project.

## Project Overview

**Name**: Oread Chat Interface
**Type**: Full-stack web application
**Purpose**: Local AI chat interface integrating with Ollama for model management, streaming chat, roleplay, memory, and character systems
**Design**: Dark theme with Montserrat font and teal accent (#4db8a8)

---

## Technology Stack

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **AI Integration**: Ollama (`ollama` npm package)
- **Communication**: REST API + Server-Sent Events (SSE)
- **Memory**: Ollama `nomic-embed-text` embeddings + FAISS vector index per session
- **Database**: SQLite with WAL mode (`sqlite` + `sqlite3`)
- **Security**: Helmet, express-rate-limit, Joi, CSRF tokens, express-session

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Language**: JavaScript (JSX)
- **Styling**: SCSS (global.scss + component `.module.scss` files)
- **State Management**: Zustand
- **Design**: Oread dark theme — Montserrat, teal (#4db8a8), #1a1a1a backgrounds

---

## File Structure

```
/chat
├── config/
│   └── index.js                     # Env config, validation, CONFIG export
│
├── server.js                        # Express entry point, core routes, graceful shutdown
│
├── routes/
│   ├── templates.js                 # GET /active, PUT /active, DELETE /active, GET /, GET /:id
│   ├── sessions.js                  # Session CRUD + message endpoints
│   ├── memory.js                    # Embed/search/status endpoints
│   └── characters.js                # Character file management endpoints
│
├── controllers/
│   ├── templateController.js        # Default templates (read-only) + active settings CRUD
│   └── characterController.js       # Character file I/O with path traversal protection
│
├── services/
│   ├── ollama.js                    # listModels(), pullModel(), chat()
│   ├── database.js                  # SQLite init, WAL mode, schema creation
│   ├── embeddingService.js          # shouldUseRAG(), queryWithRAG(), addDocuments(), searchVectors()
│   ├── vectorSearch.js              # FAISS index per session — search(), addDocuments(), getDocumentCount()
│   └── extractionAgent.js           # analyzeConversation(), shouldRunAnalysis()
│
├── middleware/
│   ├── security.js                  # generalLimiter, strictLimiter, securityHeaders,
│   │                                #   corsConfig, requestSizeMonitor, securityLogger,
│   │                                #   sanitizeInputs, csrfProtect, generateCsrfToken
│   ├── validation.js                # Joi schemas + validate(), validateUUID()
│   └── errorHandler.js              # asyncHandler(), errorHandler, notFoundHandler
│
├── mcp-servers/
│   └── settings-tools-server.js     # Custom MCP server (standalone, not used by main app)
│
├── __tests__/                       # Vitest + Supertest test suite
│   ├── services/database.test.js
│   ├── services/vectorSearch.test.js
│   ├── routes/memory.test.js
│   ├── routes/settings.test.js      # Tests templates router active routes
│   ├── middleware/validation.test.js
│   ├── middleware/errorHandler.test.js
│   └── controllers/characterController.test.js
│
├── data/
│   ├── chat.db                      # SQLite (sessions, messages)
│   ├── vectors/                     # FAISS index files (one directory per session)
│   ├── characters/
│   │   ├── defaults/                # Built-in character JSON files
│   │   └── [user characters]        # User-created/copied character files
│   └── templates/
│       ├── active.json              # Active settings (written by templateController)
│       └── defaults/                # 9 preset template JSON files (read-only)
│
├── CLAUDE.md                        # This file
├── README.md                        # User documentation
├── SECURITY.md                      # Security configuration guide
└── package.json                     # Backend dependencies

client/
├── src/
│   ├── App.jsx                      # Root: initializes store, renders Header + page
│   ├── main.jsx                     # React bootstrap
│   │
│   ├── store/
│   │   └── useStore.js              # Zustand store
│   │
│   ├── pages/
│   │   ├── ChatPage.jsx             # Chat view with sidebar and session management
│   │   └── Settings.jsx             # Tabbed settings page
│   │
│   ├── components/
│   │   ├── ui/                      # 8 primitives: Button, TextField, TextArea,
│   │   │                            #   Dropdown, MultiSelect, ProgressBar, TagInput, ImageUpload
│   │   ├── chat/                    # ChatBubble, ChatInput, ChatInterface,
│   │   │                            #   MessageHistoryViewer, AutoUpdateSuggestions, MessageList(legacy)
│   │   ├── layout/                  # Header, Sidebar
│   │   ├── model/                   # ModelSelector, ModelDownloader
│   │   ├── session/                 # SessionManager
│   │   └── settings/                # TemplateSelector, ModeSelector, CollapsibleSection,
│   │                                #   WorldSettingsPanel, NarrativeSettingsPanel,
│   │                                #   CharacterEditor, CharacterList,
│   │                                #   UtilitySettingsPanel, UserPersonaPanel,
│   │                                #   GeneralSettingsPanel
│   │
│   ├── utils/
│   │   ├── apiClient.js             # apiFetch() — wraps fetch with CSRF token injection
│   │   ├── settingsAPI.js           # loadSettings(), saveSettings(), deleteSettings()
│   │   │                            #   → calls /api/templates/active (GET/PUT/DELETE)
│   │   ├── sessionAPI.js            # Session + message API calls
│   │   ├── characterAPI.js          # Character file API calls
│   │   ├── characterConverter.js    # Character file ↔ settings format conversion
│   │   ├── promptBuilder.js         # buildSystemPrompt(), detectModeToggle()
│   │   ├── imageProcessor.js        # Avatar resize to 512×512, base64 conversion
│   │   ├── settingsImportExport.js  # exportSettings(), importSettings(), copySettingsToClipboard()
│   │   └── settingsValidation.js    # validateSettings(), sanitizeSettings()
│   │
│   ├── data/
│   │   ├── defaultSettings.js       # DEFAULT_SETTINGS structure
│   │   └── templates.js             # loadTemplates() → GET /api/templates
│   │
│   └── styles/
│       ├── global.scss              # SCSS variables, global styles
│       └── [component].module.scss  # Component-scoped styles
│
├── vite.config.js                   # Proxy: /api → http://localhost:3001
├── package.json
└── index.html
```

---

## API Endpoints

### Core (server.js)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/csrf-token` | Issue CSRF token (stored in session, returned as JSON) |
| GET | `/api/health` | Check Ollama + SQLite status |
| GET | `/api/models` | List available Ollama models |
| POST | `/api/models/pull` | Download model — SSE stream |
| POST | `/api/chat` | Streaming chat with optional semantic memory — SSE stream |

### Templates (`routes/templates.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates/active` | Get active settings |
| PUT | `/api/templates/active` | Save active settings |
| DELETE | `/api/templates/active` | Reset to blank settings |
| GET | `/api/templates` | List all preset templates |
| GET | `/api/templates/:id` | Get a single preset template |

> **Note**: `/active` routes are registered before `/:id` to prevent "active" being matched as a template ID.

### Sessions (`routes/sessions.js`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | Create session |
| GET | `/api/sessions` | List sessions (paginated) |
| GET | `/api/sessions/:id` | Get session |
| PUT | `/api/sessions/:id` | Update session (name, archived) |
| DELETE | `/api/sessions/:id` | Delete session |
| POST | `/api/sessions/:id/messages` | Add message |
| GET | `/api/sessions/:id/messages` | Get messages (paginated) |

### Memory (`routes/memory.js`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/memory/embed` | Create embeddings (background) |
| POST | `/api/memory/search` | Semantic search |
| GET | `/api/memory/status/:sessionId` | Embedding status |

### Characters (`routes/characters.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/characters` | List user characters |
| GET | `/api/characters/defaults/all` | List default characters |
| GET | `/api/characters/defaults/:id` | Get default character |
| POST | `/api/characters/copy/:id` | Copy default → user folder |
| PUT | `/api/characters/:id/reset` | Reset to default |
| GET | `/api/characters/:id` | Get character |
| POST | `/api/characters/:id` | Save character |
| DELETE | `/api/characters/:id` | Delete character |

---

## Settings Architecture

Settings are a special template called "active", stored at `data/templates/active.json`.

**Structure of active.json**:
```json
{
  "id": "active",
  "name": "Active Settings",
  "category": "roleplay | utility",
  "settings": {
    "mode": "roleplay | normal",
    "roleplay": {
      "world": { "settingLore", "openingScene", "narratorVoice", "pacing", "hardRules", "turnLogic" },
      "characterMode": "single | multi",
      "singleCharacterRef": "character-id",
      "multipleCharacterRefs": []
    },
    "utility": {
      "assistantIdentity": { "persona", "communicationStyle" },
      "guardrails": { "negativeConstraints", "formattingPreferences" }
    },
    "userPersona": { "name", "bio", "skills", "profession", "tastes", "linguisticFilters", "boundaries" },
    "general": { "selectedModel", "webSearch", "chatSearch", "memory", "temperature", "topP", "maxTokens" },
    "meta": { "templateId", "lastModified", "version" }
  }
}
```

**Save flow**:
```
setSettings(newSettings) in Zustand
  ├─ Immediate → localStorage['ollama-chat-settings']
  └─ 1s debounce → PUT /api/templates/active → data/templates/active.json
```

**Load flow** (on app start):
```
initialize()
  ├─ loadSettings()
  │   ├─ localStorage (instant display)
  │   └─ GET /api/templates/active (authoritative — overwrites localStorage)
  └─ loadTemplates() → GET /api/templates → set({ templates })
```

---

## Database Schema

### sessions
```sql
id TEXT PRIMARY KEY, name TEXT, character_name TEXT, character_mode TEXT,
mode TEXT, settings_snapshot TEXT, created_at, updated_at,
message_count INTEGER DEFAULT 0, last_message_at, archived INTEGER DEFAULT 0, metadata TEXT
```

### messages
```sql
id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT,
timestamp TEXT, model TEXT, system_prompt_hash TEXT, token_count INTEGER,
embedded INTEGER DEFAULT 0, embedding_id TEXT, extracted_data TEXT, extraction_status TEXT
```

---

## Zustand Store (`useStore.js`)

State is organized into sections. Key ones:

| Section | Key State | Key Actions |
|---------|-----------|-------------|
| Settings | `settings`, `isSavingSettings`, `lastSaved` | `setSettings()`, `loadSettings()` |
| Chat | `messages`, `isSending`, `activeMode` | `sendMessage()`, `clearMessages()` |
| Models | `models`, `selectedModel`, `isDownloading`, `downloadProgress` | `fetchModels()`, `downloadModel()`, `setSelectedModel()` |
| Connection | `ollamaStatus` | `checkHealth()` |
| UI | `currentPage` | `setCurrentPage()` |
| Sessions | `currentSessionId`, `chatSessions`, `sessionsLoading` | `createSession()`, `loadSessions()`, `selectSession()`, `deleteSession()` |
| History | `messageHistory`, `historyLoading`, `historyHasMore` | `loadMessageHistory()` |
| Extraction | `extractedSuggestions`, `extractionLoading` | `analyzeForUpdates()`, `applyExtractedUpdates()` |
| Characters | loaded character data | `loadCharactersForPrompt()` |
| Init | `initialized` | `initialize()` |

**Important patterns**:
- Always use selectors: `useStore((state) => state.property)` — not `useStore().property`
- `setSettings()` auto-saves; don't call save separately
- `sendMessage()` handles the full chat flow including SSE streaming

---

## Chat Message Flow

```
sendMessage(content, model) in Zustand
  ↓
Add user message to state
Build system prompt from settings (promptBuilder.js)
Load characters if needed (characterAPI + characterConverter)
  ↓
POST /api/chat { model, messages, systemPrompt, temperature, topP, maxTokens, sessionId, settings }
  ↓
Backend: session > 50 messages + memory enabled?
  ├─ YES → embeddingService: recent 20 + top 5 semantic (FAISS)
  └─ NO  → full message history
  ↓
ollamaService.chat() → SSE stream
Frontend appends tokens to assistant message in real-time
  ↓
Save user + assistant messages to SQLite (before res.end())
res.end()
  ↓
Background (fire-and-forget):
  ├─ embeddingService.addDocuments() → nomic-embed-text → FAISS index
  └─ If roleplay: extractionAgent.shouldRunAnalysis() every 5 msgs
      → analyzeConversation() → store proposed_updates in messages table
```

---

## Security

| Feature | Implementation |
|---------|----------------|
| CSRF protection | Synchronizer token pattern — `GET /api/csrf-token` → `X-CSRF-Token` header |
| Rate limiting | 100 req/15min general; 10 req/min for chat and model pull |
| Input validation | Joi schemas on all mutating endpoints |
| Security headers | Helmet (CSP, HSTS, frameguard, noSniff) |
| Input sanitization | Null bytes + control characters stripped from query params |
| Path traversal | Character + template file access validated with `path.resolve()` |
| Session cookies | HttpOnly, SameSite=strict, 24hr expiry |
| Error messages | Stack traces hidden in production |
| Request size | Monitored; 10MB hard limit |

CSRF is bypassed in development when `ENABLE_AUTH=false` (default). Safe methods (GET, HEAD, OPTIONS) and `/api/health` are always exempt.

---

## Environment Config (`config/index.js`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment |
| `PORT` | `3001` | Backend port |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama service URL |
| `OLLAMA_CHAT_MODEL` | `llama2` | Default chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `SESSION_SECRET` | auto-generated | Express session secret |
| `ENABLE_AUTH` | `false` | Authentication guard |
| `ENABLE_CSRF` | `true` | CSRF protection |
| `CORS_ORIGINS` | `localhost:5173,localhost:3000` | Allowed origins |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15min) | Rate limit window |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_CHAT_MAX` | `10` | Max chat requests per minute |
| `MAX_UPLOAD_SIZE` | `2mb` | Body parser limit |

---

## Frontend Utilities

### `promptBuilder.js`
- `buildSystemPrompt(settings, activeMode)` — generates complete system prompt from settings
- `detectModeToggle(content)` — detects `/chat` or `/play` commands → returns `'normal' | 'roleplay' | null`

### `settingsAPI.js`
All functions call `/api/templates/active`:
- `loadSettings()` → GET → `{ success, settings }`
- `saveSettings(settings)` → PUT → `{ success }`
- `deleteSettings()` → DELETE → `{ success, settings }`

### `characterAPI.js`
- `getCharacter(id)`, `saveCharacter(id, data)`, `deleteCharacter(id)`
- `copyDefaultCharacterToUser(id)` — copies from defaults to user folder

---

## Common Development Tasks

### Add a new API endpoint
1. Add route handler in the appropriate `routes/*.js` file
2. Add controller function in `controllers/*.js` if complex
3. Add Joi schema to `middleware/validation.js` and apply `validate(schema)` middleware
4. Register in `server.js` if a new router

### Add a new setting field
1. Add to `DEFAULT_SETTINGS` in `client/src/data/defaultSettings.js`
2. Add to `BLANK_SETTINGS` in `controllers/templateController.js`
3. Add to `settingsSchema` in `middleware/validation.js` (or it will be stripped on save)
4. Add UI in the appropriate settings panel component
5. Add to `promptBuilder.js` if it affects the system prompt

### Add a new template
Create a JSON file in `data/templates/defaults/` with this structure:
```json
{
  "id": "template-id",
  "name": "Display Name",
  "category": "roleplay | utility",
  "description": "Brief description shown in UI",
  "settings": { ... }
}
```

### Add a new UI component
- Reusable primitive → `client/src/components/ui/`
- Chat-related → `client/src/components/chat/`
- Settings panel → `client/src/components/settings/`
- Follow existing pattern: named export, SCSS module for styles

---

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Test files mock dependencies (controllers, services) and test route-level behavior using `supertest`. The `__tests__/routes/settings.test.js` file tests the templates router `/active` routes.

---

## Running the App

```bash
# Backend (port 3001)
npm start
# or with auto-reload:
npm run dev

# Frontend (port 5173)
cd client && npm run dev
```

Ollama must be running: `ollama serve`

---

## Ports

| Service | Port |
|---------|------|
| Backend | 3001 |
| Frontend (Vite dev) | 5173 |
| Ollama | 11434 |

Vite proxies all `/api/*` requests to `localhost:3001` in development.

---

## Gotchas

1. **`/api/templates/active` must be registered before `/:id`** — otherwise "active" is captured as a template ID
2. **Zustand selectors** — always `useStore((s) => s.x)`, never destructure the whole store
3. **`validate()` uses `stripUnknown: true`** — any new setting fields must be added to `settingsSchema` or they'll be silently removed on save
4. **`TextField.onChange`** receives the value directly, not the event
5. **`characterMode`** is `'single'` or `'multi'` (not `'multiple'`) throughout the codebase
6. **Settings are stored as a template** — `GET /api/templates/active` returns `{ success, settings }`, not the full template wrapper
7. **Active template `character_name`** in sessions refers to `singleCharacterRef` (character file ID), not an inline name
8. **SSE parsing** — always check `line.startsWith('data: ')` before parsing
9. **WAL mode** — SQLite WAL files (`.db-shm`, `.db-wal`) are normal; don't delete them while the app is running

---

## Dependencies

### Backend
```json
{
  "@langchain/community": "^1.1.23",
  "@langchain/core": "^1.1.32",
  "@langchain/ollama": "^1.2.6",
  "@modelcontextprotocol/sdk": "^1.27.1",
  "cookie-parser": "^1.4.7",
  "cors": "^2.8.5",
  "dotenv": "^16.6.1",
  "express": "^4.18.2",
  "express-rate-limit": "^8.3.1",
  "express-session": "^1.19.0",
  "helmet": "^8.1.0",
  "joi": "^18.0.2",
  "langchain": "^1.2.31",
  "ollama": "^0.6.3",
  "sqlite": "^5.1.1",
  "sqlite3": "^5.0.2",
  "uuid": "^13.0.0"
}
```

### Frontend
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "zustand": "^5.0.11"
}
```

---

**Last Updated**: 2026-03-13
**Version**: 3.3.0
