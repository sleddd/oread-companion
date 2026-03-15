# Oread Chat Interface

Full-stack local AI chat app with Ollama integration. Streaming chat, roleplay/character system, session management.

**Design**: Dark theme, Montserrat font, teal accent `#4db8a8`, `#1a1a1a` backgrounds.

## Stack

- **Backend**: Node.js (ES Modules), Express, SQLite (WAL mode), SSE streaming
- **Frontend**: React 19, Vite, Zustand, SCSS (`global.scss` + `*.module.scss`)
- **AI**: Ollama (`ollama` npm package), `compromise` (rule-based NLP for fact extraction)
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
  → load DB messages + context window selection (contextWindow.js)
  → append story notes + extracted facts to system prompt
  → ollamaService.chat() → SSE stream → save to SQLite
  → background: NLP fact extraction (factExtractor.js) → update session
```

### Zero-Inference Memory System
No additional model inference — all context management is rule-based.

**5 components sharing a single token budget** (priority order):
1. **System prompt** — always included, deducted first
2. **Story notes + extracted facts** — injected as `[Story Notes]` / `[Session Memory]` block
3. **Anchors** — first user message + first assistant reply (sets scene)
4. **Pinned messages** — user-pinned key moments, newest-first when over budget
5. **Recent messages** — fills remaining budget, newest→oldest

**Key files:**
- `services/contextWindow.js` — pure function `selectMessages()`, token-budgeted sliding window
- `services/factExtractor.js` — `compromise` NLP library extracts people, places, events, facts (capped at 50 per session)
- `settings.general.contextBudget` — configurable token budget (default 4096, min 512, max 131072)

**API endpoints:**
- `PATCH /api/sessions/:sessionId/messages/:messageId/pin` — toggle pin (`{ pinned: true|false }`)
- `GET /api/sessions/:id/notes` — read story notes
- `PUT /api/sessions/:id/notes` — save story notes (`{ notes: string }`, max 10000 chars)

**SSE metadata events** emitted during chat:
- `{ meta: 'user_saved', messageId }` — after user message saved to DB
- `{ meta: 'assistant_saved', messageId }` — after assistant message saved to DB

**UI:**
- Pin button on each message (visible on hover, teal when active, teal left border on pinned)
- Story Notes slide-out panel on right side of chat page (debounced auto-save, per-session)
- Context Budget number input in Settings > General > Generation Parameters

### Zustand Store Patterns
- Always use selectors: `useStore((s) => s.x)` — never `useStore().property`
- `setSettings()` auto-saves; don't call save separately
- `sendMessage()` handles the full chat flow including SSE streaming

### DB Tables
- `sessions` — id, name, character_name, mode, settings_snapshot, message_count, archived, story_notes, extracted_facts
- `messages` — id, session_id, role, content, timestamp, pinned

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
9. **Model selection priority** — dropdown selection wins over `settings.general.selectedModel` (which is the fallback default)
10. **Story notes race condition** — handled by flushing pending debounced saves on session switch and capturing `sessionId` at typing time
11. **`contextBudget`** must be in `settingsSchema` (see gotcha 3) — added to `general` object

## Environment Variables
`PORT` (3001), `OLLAMA_URL` (localhost:11434), `OLLAMA_CHAT_MODEL` (llama2), `SESSION_SECRET` (auto-gen), `OREAD_ENCRYPTION_PASSPHRASE` (auto-gen, required in prod), `ENABLE_AUTH` (false), `ENABLE_CSRF` (true), `CORS_ORIGINS` (localhost:5173,localhost:3000)

## In-Progress Branches
- **`cloud-api-integration`** — Adds OpenAI + Anthropic cloud model support alongside Ollama. Provider auto-detected from model name. API keys encrypted (AES-256-GCM) in SQLite `api_keys` table. UI in Settings > Integrations.
