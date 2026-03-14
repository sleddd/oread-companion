# Architecture

Technical reference for the Oread chat application. For a general overview, see the [main README](../README.md).

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js (ES Modules) |
| API framework | Express.js |
| AI / LLM | Ollama (`ollama` npm package) |
| Embeddings | Ollama `nomic-embed-text` + FAISS |
| Database | SQLite (WAL mode) via `sqlite` + `sqlite3` |
| Security | Helmet, express-rate-limit, Joi, CSRF tokens |
| Frontend framework | React 19 |
| Build tool | Vite |
| State management | Zustand |
| Styling | SCSS modules |
| Testing | Vitest + Supertest |

---

## Project Structure

```
/chat
├── config/index.js              # Environment config & validation
├── server.js                    # Express app, core endpoints
│
├── routes/
│   ├── templates.js             # Template + active settings endpoints
│   ├── sessions.js              # Session CRUD + messages
│   ├── memory.js                # Embedding endpoints
│   └── characters.js            # Character file management
│
├── controllers/
│   ├── templateController.js    # Default + user templates, active settings CRUD
│   └── characterController.js   # Character file I/O
│
├── services/
│   ├── ollama.js                # Ollama API wrapper
│   ├── database.js              # SQLite + WAL mode setup
│   ├── embeddingService.js      # Embeddings + semantic search (FAISS)
│   ├── vectorSearch.js          # FAISS vector index per session
│   └── extractionAgent.js       # Character detail extraction
│
├── middleware/
│   ├── security.js              # Rate limiting, CSRF, Helmet, sanitization
│   ├── validation.js            # Joi schemas for all endpoints
│   └── errorHandler.js          # Async error wrapper, 404, global handler
│
├── data/
│   ├── chat.db                  # SQLite (sessions, messages)
│   ├── vectors/                 # FAISS index files per session
│   ├── characters/defaults/     # Built-in character templates
│   └── templates/
│       ├── active.json          # Active settings (written by app)
│       ├── defaults/            # 9 preset templates
│       └── user/                # User-created worlds (gitignored)
│
├── __tests__/                   # Vitest + Supertest test suite
│
└── client/                      # React frontend
    └── src/
        ├── App.jsx
        ├── store/useStore.js    # Zustand store
        ├── pages/               # ChatPage, Settings
        ├── components/          # ui, chat, settings, session, layout, model
        ├── utils/               # API clients, promptBuilder, templateAPI, etc.
        └── data/                # defaultSettings, templates helper
```

---

## Data Flow

### Chat Message

```
User types message
  ↓
Frontend (Zustand store) → POST /api/chat
  ↓
Backend: session > 50 messages + memory enabled?
  ├─ YES → hybrid context: recent 20 + top 5 semantic matches (FAISS)
  └─ NO  → full history from client
  ↓
Stream response via SSE
  ↓
Save messages to SQLite (before res.end())
  ↓
Background (non-blocking):
  ├─ Generate embeddings → FAISS index (data/vectors/:sessionId/)
  └─ Roleplay + every 5 msgs → run extraction agent → store suggestions
```

### Settings

```
User changes setting
  ↓
setSettings() in Zustand
  ├─ Immediate → localStorage
  └─ 1s debounce → PUT /api/templates/active → data/templates/active.json
```

Settings are a special "active" template. On load, localStorage provides instant display while the backend `GET /api/templates/active` is authoritative and overwrites on arrival.

---

## Component Tree

```
App.jsx
├── Header
├── ChatPage
│   ├── Sidebar (avatar, SessionManager, track selector)
│   ├── ChatInterface
│   │   ├── MessageHistoryViewer (infinite scroll)
│   │   └── ChatInput
│   └── AutoUpdateSuggestions (extraction modal)
└── Settings (tabbed)
    ├── TemplateSelector
    ├── ModeSelector
    ├── WorldSettingsPanel + NarrativeSettingsPanel
    ├── CharacterEditor + CharacterList
    ├── UtilitySettingsPanel
    ├── UserPersonaPanel
    ├── GeneralSettingsPanel
    ├── ModelSelector + ModelDownloader
    └── SessionManager
```

---

## Database Schema

### Tables

**sessions**
| Column | Description |
|--------|-------------|
| id | Primary key |
| name | Session display name |
| character_name | Active character |
| mode | `normal` or `roleplay` |
| settings_snapshot | Template state at session creation |
| message_count | Total messages |
| archived | Boolean |

**messages**
| Column | Description |
|--------|-------------|
| id | Primary key |
| session_id | Foreign key → sessions |
| role | `user` or `assistant` |
| content | Message text |
| timestamp | ISO timestamp |
| embedded | Whether embedding exists |
| extracted_data | Extraction agent output |

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (Ollama, DB) |
| GET | `/api/models` | List available models |
| POST | `/api/models/pull` | Download model (SSE stream) |
| POST | `/api/chat` | Chat with streaming (SSE stream) |
| GET | `/api/csrf-token` | Get CSRF token |
| GET/PUT/DELETE | `/api/templates/active` | Load / save / reset settings |
| GET | `/api/templates` | List all templates (defaults + user worlds) |
| GET | `/api/templates/:id` | Get a single template |
| POST | `/api/templates/user` | Save current settings as a user world |
| DELETE | `/api/templates/user/:id` | Delete a user world |
| POST/GET/PUT/DELETE | `/api/sessions` | Session management |
| POST/GET | `/api/sessions/:id/messages` | Session messages |
| POST | `/api/memory/embed` | Create embeddings (background) |
| POST | `/api/memory/search` | Semantic search |
| GET | `/api/memory/status/:id` | Embedding status |
| GET/POST/DELETE | `/api/characters/:id` | User character CRUD |
| GET | `/api/characters/defaults/all` | List default characters |
| POST | `/api/characters/copy/:id` | Copy default character to user |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Backend port |
| `OLLAMA_URL` | localhost:11434 | Ollama server URL |
| `OLLAMA_CHAT_MODEL` | llama2 | Default chat model |
| `OLLAMA_EMBED_MODEL` | nomic-embed-text | Embedding model |
| `SESSION_SECRET` | auto-generated | Express session secret |
| `OREAD_ENCRYPTION_PASSPHRASE` | auto-generated | Encryption key (required in prod) |
| `ENABLE_AUTH` | false | Enable authentication |
| `ENABLE_CSRF` | true | Enable CSRF protection |
| `CORS_ORIGINS` | localhost:5173,localhost:3000 | Allowed CORS origins |

---

## Version History

### v3.4.0 (2026-03-14) — Save as World
- User-created world templates: save current settings as a named world, browse alongside defaults, delete
- `GET /api/templates` returns merged default + user templates with `isUserTemplate` flag
- "Choose Your World" UI with grouped dropdown (My Worlds above Templates)
- "Save as World" action bar below settings tabs
- User worlds stored in `data/templates/user/` (gitignored)

### v3.3.0 (2026-03-13) — Memory & dependency cleanup
- Replaced `langchainRAG.js` with leaner `embeddingService.js`
- Removed unused `mcpClient.js` and MCP architecture
- Removed `data/personality-system/` trait JSON files
- FAISS vector store retained for semantic search

### v3.2.0 (2026-03-13) — Settings → Templates consolidation
- Settings storage unified under `data/templates/active.json`
- `/api/settings` removed; settings now served via `/api/templates/active`
- Removed unused services: `sessionSecurity.js`, `personalitySystem.js`
- Removed unused middleware: `auth.js`, `authLimiter`

### v3.1.0 (2026-03-12) — SQLite + FAISS Vector Storage
- FAISS vector index per session for semantic search
- WAL mode for concurrent SQLite access

### v3.0.0 (2026-03-11) — Memory System
- Session-scoped semantic memory with auto-extraction
- Infinite scroll message history

### v2.1.0 (2026-03-11) — Oread Design System
- Dark theme, Montserrat font, teal accent

### v2.0.0 (2026-03-11) — Settings & Templates
- Zustand state management, template system, character management

### v1.0.0 (2026-03-11) — Initial Release
