# Oread Chat Interface

Full-stack local AI chat app with Ollama, OpenAI, and Anthropic support. Streaming chat, roleplay/character system, semantic memory (FAISS + embeddings), session management.

**Design**: Dark theme, Montserrat font, teal accent `#4db8a8`, `#1a1a1a` backgrounds.

## Stack

- **Backend**: Node.js (ES Modules), Express, SQLite (WAL mode), SSE streaming
- **Frontend**: React 19, Vite, Zustand, SCSS (`global.scss` + `*.module.scss`)
- **AI**: Ollama (local), OpenAI, Anthropic (cloud) — provider auto-detected from model name
- **Memory**: `nomic-embed-text` embeddings + FAISS vector index per session

## Running

```bash
npm run dev          # Backend :3001 (auto-reload)
cd client && npm run dev  # Frontend :5173 (proxies /api/* → :3001)
npm test             # Vitest + Supertest
```

## Key Architecture

### Settings (3-place sync)
Settings = a special "active" template at `data/templates/active.json`.
- **Save**: `setSettings()` → localStorage (instant) → 1s debounce → `PUT /api/templates/active`
- **Load**: localStorage first (instant), then `GET /api/templates/active` (authoritative, overwrites)

### Chat Flow
`sendMessage()` → build system prompt → `POST /api/chat` → provider router picks Ollama/OpenAI/Anthropic → SSE stream → save messages to SQLite → background: embeddings + extraction

### Cloud API Integration (`cloud-api-integration` branch)
- **Provider routing**: `services/providerRouter.js` — auto-detects from model name (`gpt-*` → OpenAI, `claude-*` → Anthropic, else → Ollama)
- **API keys**: Encrypted AES-256-GCM in `api_keys` SQLite table. Env var fallback: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- **Stream normalization**: All providers emit `{ message: { content } }` chunks — frontend SSE parsing unchanged
- **Endpoints**: `GET/PUT/DELETE /api/keys/:provider`, `POST /api/keys/:provider/verify`
- **UI**: `ApiKeyPanel` in Settings > Integrations tab. Keys are write-only (never sent back to browser)
- **Services**: `services/openaiService.js`, `services/anthropicService.js`, `services/apiKeyService.js`

### DB Tables
- `sessions` — id, name, character_name, mode, settings_snapshot, message_count, archived
- `messages` — id, session_id, role, content, timestamp, embedded, extracted_data
- `api_keys` — provider (PK), encrypted_key, created_at, updated_at

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

## Gotchas
1. `/api/templates/active` must be registered before `/:id` — otherwise "active" is captured as a template ID
2. **Zustand selectors** — always `useStore((s) => s.x)`, never destructure the whole store
3. **`validate()` uses `stripUnknown: true`** — new setting fields must be in `settingsSchema` or silently removed
4. **`TextField.onChange`** receives the value directly, not the event
5. **`characterMode`** is `'single'` or `'multi'` (not `'multiple'`)
6. **SSE parsing** — always check `line.startsWith('data: ')` before JSON.parse
7. WAL files (`.db-shm`, `.db-wal`) are normal; don't delete while app is running
8. CSRF bypassed in dev when `ENABLE_AUTH=false` (default). `apiFetch()` handles CSRF token injection

## Environment Variables
`PORT` (3001), `OLLAMA_URL` (localhost:11434), `SESSION_SECRET` (auto-gen), `OREAD_ENCRYPTION_PASSPHRASE` (auto-gen, required in prod), `ENABLE_AUTH` (false), `ENABLE_CSRF` (true), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
