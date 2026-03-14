# Oread Chat Interface

Full-stack local AI chat app with Ollama integration. Streaming chat, roleplay/character system, semantic memory (FAISS + embeddings), session management.

**Design**: Dark theme, Montserrat font, teal accent `#4db8a8`, `#1a1a1a` backgrounds.

## Stack

- **Backend**: Node.js (ES Modules), Express, SQLite (WAL mode), SSE streaming
- **Frontend**: React 19, Vite, Zustand, SCSS (`global.scss` + `*.module.scss`)
- **AI**: Ollama (`ollama` npm package)
- **Memory**: `nomic-embed-text` embeddings + FAISS vector index per session
- **Security**: Helmet, express-rate-limit, Joi validation, CSRF tokens, express-session

## Running

```bash
npm run dev          # Backend :3001 (auto-reload)
cd client && npm run dev  # Frontend :5173 (proxies /api/* → :3001)
npm test             # Vitest + Supertest
```

Ollama must be running: `ollama serve`

## Key Architecture

### Settings (3-place sync)
Settings = a special "active" template at `data/templates/active.json`.
- **Save**: `setSettings()` → localStorage (instant) → 1s debounce → `PUT /api/templates/active`
- **Load**: localStorage first (instant), then `GET /api/templates/active` (authoritative, overwrites)

### Chat Flow
```
sendMessage() → build system prompt (promptBuilder.js) → load characters if needed
  → POST /api/chat { model, messages, systemPrompt, temperature, topP, maxTokens, sessionId, settings }
  → Backend: >50 msgs + memory? → RAG (recent 20 + top 5 semantic) : full history
  → ollamaService.chat() → SSE stream → save to SQLite
  → Background: embeddings + extraction (roleplay only, every 5 msgs)
```

### Zustand Store Patterns
- Always use selectors: `useStore((s) => s.x)` — never `useStore().property`
- `setSettings()` auto-saves; don't call save separately
- `sendMessage()` handles the full chat flow including SSE streaming

### DB Tables
- `sessions` — id, name, character_name, mode, settings_snapshot, message_count, archived
- `messages` — id, session_id, role, content, timestamp, embedded, extracted_data

## Adding a New Setting Field
1. `client/src/data/defaultSettings.js` — add to `DEFAULT_SETTINGS`
2. `controllers/templateController.js` — add to `BLANK_SETTINGS`
3. `middleware/validation.js` — add to `settingsSchema` (**required** or it gets stripped by `stripUnknown`)
4. Add UI in the appropriate settings panel
5. Add to `promptBuilder.js` if it affects the system prompt

## Adding a New API Endpoint
1. Route handler in `routes/*.js`
2. Joi schema in `middleware/validation.js` + `validate(schema)` middleware
3. Register router in `server.js` if new file

## User Templates (Worlds)
Users can save current settings as a named "world" template. Stored as JSON in `data/templates/user/` (gitignored).
- **Save**: `POST /api/templates/user` → generates ID from name, handles collisions (`-2`, `-3`)
- **Delete**: `DELETE /api/templates/user/:id`
- **List**: `GET /api/templates` returns both `defaults/` and `user/` templates, tagged with `isUserTemplate: true/false`
- Frontend: `saveAsTemplate()` / `deleteTemplate()` in Zustand store, `templateAPI.js` for API calls
- UI: "Save as World" button below settings tabs, "Choose Your World" section in Mode tab

## Gotchas
1. `/api/templates/active` and `/api/templates/user` must be registered before `/:id` — otherwise they are captured as template IDs
2. **Zustand selectors** — always `useStore((s) => s.x)`, never destructure the whole store
3. **`validate()` uses `stripUnknown: true`** — new setting fields must be in `settingsSchema` or silently removed
4. **`TextField.onChange`** receives the value directly, not the event
5. **`characterMode`** is `'single'` or `'multi'` (not `'multiple'`)
6. **SSE parsing** — always check `line.startsWith('data: ')` before JSON.parse
7. WAL files (`.db-shm`, `.db-wal`) are normal; don't delete while app is running
8. CSRF bypassed in dev when `ENABLE_AUTH=false` (default). `apiFetch()` handles CSRF token injection

## Environment Variables
`PORT` (3001), `OLLAMA_URL` (localhost:11434), `OLLAMA_CHAT_MODEL` (llama2), `OLLAMA_EMBED_MODEL` (nomic-embed-text), `SESSION_SECRET` (auto-gen), `OREAD_ENCRYPTION_PASSPHRASE` (auto-gen, required in prod), `ENABLE_AUTH` (false), `ENABLE_CSRF` (true), `CORS_ORIGINS` (localhost:5173,localhost:3000)

## In-Progress Branches
- **`cloud-api-integration`** — Adds OpenAI + Anthropic cloud model support alongside Ollama. Provider auto-detected from model name. API keys encrypted (AES-256-GCM) in SQLite `api_keys` table. UI in Settings > Integrations.
