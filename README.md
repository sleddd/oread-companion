# Oread Chat Interface

A modern, full-stack chat interface for local Ollama models with advanced memory, character roleplay, and session management. Built with Node.js, Express, React, Vite, LangChain, and SQLite.

> **Note**: This app is in active development. It is fully functional but not yet exhaustively bug-tested. Use at your own risk.

---

## Features

### 💬 Chat
- Real-time token-by-token streaming responses
- Session-based conversations with independent histories
- Automatic RAG activation for long conversations (>50 messages)
- Mode toggle commands: `/chat` (utility) and `/play` (roleplay)

### 🧠 Memory & RAG
- All messages persisted to SQLite
- Semantic search using Ollama `nomic-embed-text` embeddings stored as SQLite BLOBs
- Sliding window of 100 vectors for efficient in-memory cosine similarity search
- Hybrid context: recent 20 messages + top 5 semantically matched from history

### 🎭 Roleplay & Characters
- Single or multi-character roleplay modes
- Character files with identity, personality, backstory, appearance, and voice
- Auto-extraction: AI analyzes every 5 messages and suggests character detail updates (requires your approval)
- Avatar image upload (auto-resized to 512×512px)
- World building: lore, opening scene, narrator voice, pacing, hard rules

### ⚙️ Settings & Templates
- 9 preset templates (roleplay and utility) loaded from `data/templates/defaults/`
- Active settings stored as `data/templates/active.json`
- Auto-save: localStorage (instant) + backend API (1s debounce)
- Import/export settings as JSON

### 🎨 Design
- Oread dark theme — Montserrat font, teal accent (#4db8a8), dark backgrounds (#1a1a1a)
- Teal/dark chat bubbles, pill-shaped input, character avatar sidebar
- Collapsible settings sections, infinite scroll message history

### 📦 Model Management
- List, download, and switch Ollama models
- HuggingFace GGUF support (`hf.co/username/model`)
- Real-time SSE download progress

---

## Prerequisites

1. **Node.js v18+**
2. **Ollama** — [https://ollama.com](https://ollama.com)
   ```bash
   ollama serve
   ```
3. **Embedding model** (required for memory/RAG):
   ```bash
   ollama pull nomic-embed-text
   ```

---

## Installation

```bash
# Backend
npm install

# Frontend
cd client && npm install && cd ..
```

---

## Running

```bash
# Terminal 1 — Backend (http://localhost:3001)
npm start

# Terminal 2 — Frontend (http://localhost:5173)
cd client && npm run dev
```

Open **http://localhost:5173**

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (Ollama, DB, MCP) |
| GET | `/api/models` | List available models |
| POST | `/api/models/pull` | Download model (SSE stream) |
| POST | `/api/chat` | Chat with streaming + RAG (SSE stream) |
| GET | `/api/csrf-token` | Get CSRF token |
| GET/PUT/DELETE | `/api/templates/active` | Load / save / reset settings |
| GET | `/api/templates` | List all preset templates |
| GET | `/api/templates/:id` | Get a single preset template |
| POST/GET/PUT/DELETE | `/api/sessions` | Session management |
| POST/GET | `/api/sessions/:id/messages` | Session messages |
| POST | `/api/memory/embed` | Create embeddings (background) |
| POST | `/api/memory/search` | Semantic search |
| GET | `/api/memory/status/:id` | Embedding status |
| GET/POST/DELETE | `/api/characters/:id` | User character CRUD |
| GET | `/api/characters/defaults/all` | List default characters |
| POST | `/api/characters/copy/:id` | Copy default character to user |

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
│   ├── memory.js                # RAG/embedding endpoints
│   └── characters.js            # Character file management
│
├── controllers/
│   ├── templateController.js    # Default templates + active settings CRUD
│   └── characterController.js   # Character file I/O
│
├── services/
│   ├── ollama.js                # Ollama API wrapper
│   ├── database.js              # SQLite + WAL mode setup
│   ├── mcpClient.js             # MCP client
│   ├── langchainRAG.js          # RAG orchestration + embeddings
│   ├── vectorSearch.js          # In-memory cosine similarity
│   └── extractionAgent.js       # Character detail extraction
│
├── middleware/
│   ├── security.js              # Rate limiting, CSRF, Helmet, sanitization
│   ├── validation.js            # Joi schemas for all endpoints
│   └── errorHandler.js          # Async error wrapper, 404, global handler
│
├── mcp-servers/
│   └── settings-tools-server.js # Custom MCP for character extraction
│
├── scripts/
│   ├── migrate-vectors-to-sqlite.js
│   └── verify-vector-integrity.js
│
├── data/
│   ├── chat.db                  # SQLite (sessions, messages, vectors)
│   ├── characters/defaults/     # Built-in character templates
│   ├── personality-system/      # Trait definition JSON files
│   └── templates/
│       ├── active.json          # Active settings (written by app)
│       └── defaults/            # 9 preset templates
│
├── __tests__/                   # 120 tests (vitest + supertest)
│
└── client/                      # React frontend
    └── src/
        ├── App.jsx
        ├── store/useStore.js    # Zustand store
        ├── pages/               # ChatPage, Settings
        ├── components/          # 31 components (ui, chat, settings, session, layout, model)
        ├── utils/               # API clients, promptBuilder, characterAPI, etc.
        └── data/                # defaultSettings, templates helper, personality data
```

---

## Architecture

### Data Flow — Chat Message

```
User types message
  ↓
Frontend (Zustand store) → POST /api/chat
  ↓
Backend checks: session > 50 messages?
  ├─ YES → RAG: recent 20 + top 5 semantic matches (SQLite vectors)
  └─ NO  → Full history
  ↓
Stream response via SSE
  ↓
Background (non-blocking):
  ├─ Save messages to SQLite
  ├─ Generate embeddings → store as BLOBs in message_vectors
  └─ Roleplay + every 5 msgs → run extraction agent → store suggestions
```

### Settings Flow

```
User changes setting
  ↓
setSettings() in Zustand
  ├─ Immediate → localStorage
  └─ 1s debounce → PUT /api/templates/active → data/templates/active.json
```

### Component Tree

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

## Troubleshooting

**Red "Disconnected" status** — Run `ollama serve`, then refresh.

**RAG not activating** — Pull `nomic-embed-text`, enable Memory in Settings → General, session needs >50 messages.

**MCP errors on startup** — Check Node.js v18+, verify `data/chat.db` is writable.

**Chat not working** — Select a model in Settings → Model, ensure a session is active.

**Auto-extraction not triggering** — Must be in Roleplay mode with Memory enabled, needs 5+ messages.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js (ES Modules) |
| API framework | Express.js |
| AI / LLM | Ollama (`ollama` npm package) |
| RAG / embeddings | LangChain + Ollama `nomic-embed-text` |
| Database | SQLite (WAL mode) via `sqlite` + `sqlite3` |
| Vector storage | SQLite BLOBs + in-memory cosine similarity |
| MCP | `@modelcontextprotocol/sdk` |
| Security | Helmet, express-rate-limit, Joi, CSRF tokens |
| Frontend framework | React 19 |
| Build tool | Vite |
| State management | Zustand |
| Styling | SCSS modules |
| Testing | Vitest + Supertest (120 tests) |

---

## Version History

### v3.2.0 (2026-03-13) — Settings → Templates consolidation
- Settings storage unified under `data/templates/active.json`
- `/api/settings` removed; settings now served via `/api/templates/active`
- Removed unused services: `sessionSecurity.js`, `personalitySystem.js`
- Removed unused MCP server: `vector-store-server.js` (FAISS era)
- Removed unused middleware: `auth.js`, `authLimiter`
- Removed `data/settings/` legacy directory
- Test suite updated to cover new template routes

### v3.1.0 (2026-03-12) — SQLite Vector Storage
- Replaced FAISS with SQLite BLOB vector storage
- WAL mode for concurrent access
- Pure JavaScript cosine similarity (no C++ dependencies)
- Sliding window (100 vectors), SHA-256 checksums

### v3.0.0 (2026-03-11) — Memory System
- LangChain RAG with session management
- MCP architecture for data access
- Auto-extraction with user approval workflow
- Infinite scroll message history

### v2.1.0 (2026-03-11) — Oread Design System
- Dark theme, Montserrat font, teal accent

### v2.0.0 (2026-03-11) — Settings & Templates
- Zustand state management, template system, character management

### v1.0.0 (2026-03-11) — Initial Release

---

MIT License
