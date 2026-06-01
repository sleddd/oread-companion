# Oread Companion

Roleplay-only React **GUI** for the **oread-cli** backend. It is a **client-only** app — there is no
local server in this repo. The Vite dev server proxies `/api/*` to oread-cli's HTTP API on
`http://localhost:3002`.

> **Architecture (read this first).** oread-cli (`../oread-cli`) is the single shared backend — it owns
> the SQLite database, system-prompt building, memory/extraction pipeline, worlds, characters, and the
> LLM provider layer (Ollama + cloud). This GUI and the oread-cli Ink terminal UI are two
> interchangeable front-ends over the same backend; the GUI is the richer **editing surface**
> (world-building, character editing, settings). Anything you change here that touches chat behavior,
> memory, or prompts probably belongs in oread-cli — see its `CLAUDE.md`.
>
> **Roleplay-only.** The former assistant/"normal" mode was removed. `settings.mode` is always
> `'roleplay'`. There is no `utility` settings block, no client-side `promptBuilder`, no
> `ModeSelector`/`UtilitySettingsPanel`.
>
> **Thin client.** The chat path sends only `{ message, sessionId }` to `POST /api/chat` and renders
> the SSE stream (`{type:'chunk'|'done'|'error'}`). oread-cli builds the system prompt (from settings
> synced via `PUT /api/templates/active`) and persists both messages. After each turn the client
> reloads `/api/sessions/:id/messages` to pick up real DB ids (oread-cli emits no per-message id events).

**Design**: Dark theme, Montserrat font, teal accent `#4db8a8`, `#1a1a1a` backgrounds.

## Stack

- **Frontend only**: React 19, Vite, Zustand (sliced stores), SCSS (`global.scss` + `*.module.scss`)
- **Backend**: provided by [`../oread-cli`](../oread-cli) (Node ESM, Express, SQLite WAL+FTS5, Ollama +
  cloud providers, phi4-mini extraction). Not part of this repo.
- All app source lives under `client/`. The repo root holds only docs and a thin `package.json` that
  proxies scripts into `client/`.

## Running

Two processes. Start the backend first.

```bash
# 1. Backend = oread-cli on :3002 (keep extraction + chat models warm)
OLLAMA_MAX_LOADED_MODELS=2 OLLAMA_NUM_PARALLEL=4 ollama serve
cd ../oread-cli && npm run build && node dist/oread.js --api --no-repl
#   (or `oread --api --no-repl` if you've run `npm link` in oread-cli)

# 2. This GUI on :5173 (Vite proxies /api/* → :3002)
npm run dev          # from repo root; = npm --prefix client run dev
```

Other scripts (all proxy into `client/`): `npm run build`, `npm test`, `npm run install:client`.
First-time setup: `npm run install:client` (installs `client/node_modules`).

Open http://localhost:5173.

## Project structure

```
package.json              Client-only scripts (dev/build/test proxy into client/)
client/
  vite.config.js          Dev server; proxies /api → http://localhost:3002 (timeout:0 for SSE)
  src/
    main.jsx, App.jsx     Entry + top-level page switch (chat / settings)
    pages/
      ChatPage.jsx        Chat view: sidebar avatar, WorldStatePanel, story-notes panel,
                          auto-creates a session on first message
      Settings.jsx        Tabs: World (template picker), Roleplay (world/narrative/characters),
                          You/User (persona), Model (params + model mgmt), Integrations (import/export)
    components/
      chat/               ChatInterface, MessageList, ChatBubble, ChatInput, ChatDrawer,
                          WorldStatePanel (roleplay world-state: view/edit/re-extract/history),
                          MessageHistoryViewer
      settings/           WorldSettingsPanel, NarrativeSettingsPanel, CharacterEditor, CharacterList,
                          UserPersonaPanel, GeneralSettingsPanel, TemplateSelector, CollapsibleSection
      model/              ModelSelector, ModelDownloader, ModelDrawer
      world/              WorldDrawer
      layout/             Header, Sidebar
      ui/                 Button, TextField, TextArea, Dropdown, MultiSelect, TagInput, ImageUpload, ProgressBar
    store/
      useStore.js         Composes the slices into one flat Zustand store
      slices/             settingsSlice, chatSlice, modelSlice, sessionSlice, memorySlice,
                          templateSlice, uiSlice
    utils/
      apiClient.js        apiFetch() — thin fetch wrapper (NO CSRF; backend has none)
      settingsAPI.js      load/save active settings + fetch defaults → /api/templates/{active,defaults}
      characterAPI.js     character library CRUD → /api/characters
      templateAPI.js      world list (loadTemplates) + user world CRUD → /api/templates[/user]
      characterConverter.js, imageProcessor.js, settingsImportExport.js, settingsValidation.js,
      narrativeSystemLoader.js   (narrator-voice dropdown labels only — NO prompt building)
    styles/               global.scss + component *.module.scss
```

## Key architecture

### Settings sync (2-place)
Settings are the backend's "active" world. The client mirrors them to localStorage for instant UI.
- **Save**: `setSettings()` → localStorage (instant) → 1s debounce → `PUT /api/templates/active` (`{ settings }`)
- **Defaults**: there is **no client-side `DEFAULT_SETTINGS`**. oread-cli owns the canonical shape
  (`settingsManager._defaultSettings()`); the client fetches it once via `GET /api/templates/defaults`
  (`fetchDefaultSettings()`), caches it in `settingsSlice`, and uses it as the merge base
  (`mergeWithDefaults`). `settings` starts `null`; `App.jsx` shows a loading state until `loadSettings()`
  resolves. **Reset** = `resetSettings()` → `DELETE /api/templates/active` (backend reloads defaults) →
  clear localStorage → `loadSettings()`. If you add a default field, add it in oread-cli, not here.
- **Load**: fetch defaults → localStorage merged onto defaults (instant), then `GET /api/templates/active`
  (authoritative, overwrites)
- The client sends `roleplay.character` (single) / `roleplay.characters` (multi). The backend derives
  `roleplay._loadedCharacters` itself (`settingsManager._normalizeLoadedCharacters`) — **don't** rely on
  the client to send `_loadedCharacters`, but **do** keep `roleplay.character`/`characters` populated or
  the prompt degrades to "You are The Character."

### Chat flow (thin client)
`chatSlice.sendMessage(content)`:
1. Optimistically push the user message; `isSending = true`.
2. `POST /api/chat` with **exactly** `{ message, sessionId }` (no model/systemPrompt/settings — the
   server uses its synced settings).
3. Parse SSE lines: `data.type === 'chunk'` appends `data.content`; `'done'` finalizes; `'error'` alerts.
4. `finally`: reload `/api/sessions/:id/messages` (so messages gain DB `id`/`pinned`) then `loadWorldState()`.

The system prompt, context-window assembly, streaming from the model, persistence, and all post-chat
extraction happen server-side in oread-cli.

### Zustand store (sliced)
Compose-only flat store in `store/useStore.js`. Always select with `useStore((s) => s.x)` — never
destructure the whole store. `setSettings()` auto-saves (debounced). Cross-slice access via `get()`.
- `settingsSlice` — settings, setSettings, loadSettings
- `chatSlice` — messages, sendMessage (SSE), isSending
- `modelSlice` — models, fetchModels, downloadModel, checkHealth
- `sessionSlice` — sessions, createSession, selectSession, loadMessageHistory
- `memorySlice` — storyNotes, worldState (+ save/reextract), pin, globalMemories, relationships
- `templateSlice` — templates, saveAsTemplate, deleteTemplate, fetchTemplates
- `uiSlice` — currentPage

### Backend API consumed by this GUI (served by oread-cli on :3002)
- `POST /api/chat` — SSE chat (`{message, sessionId}` → `{type:'chunk'|'done'|'error'}`)
- `GET /api/health`, `GET /api/models`, `POST /api/models/pull` (SSE)
- `GET/POST/PUT/DELETE /api/sessions[...]` — sessions, `GET /:id/messages`, `GET/PUT /:id/notes`,
  `GET/PUT /:id/world-state`, `POST /:id/reextract-state`, `PATCH /:id/messages/:mid/pin`,
  `GET /:id/search`
- `GET /api/templates`, `GET/PUT/DELETE /api/templates/active`, `POST/DELETE /api/templates/user[/:id]`
- `GET/POST/DELETE /api/characters[/:id]` — reusable character library
- `GET /api/memory/global`, `GET /api/memory/search`, `PUT/DELETE /api/memory/global/:id`,
  `POST /api/memory/promote/:sid`, `GET /api/memory/relationships[/:name]`

> The GUI relies on three oread-cli routes that were added for it: `PUT /:id/world-state`,
> `POST /:id/reextract-state`, `PATCH /:id/messages/:mid/pin`, plus the whole `/api/characters` router.
> If you add an endpoint the GUI needs, implement it in `oread-cli/src/api/routes/` (and rebuild oread-cli).

## Adding a new setting field
1. **oread-cli** `settingsManager._defaultSettings()` — add the field to the canonical default shape
   (this is the single source of truth; the GUI fetches it via `GET /api/templates/defaults`). Rebuild
   oread-cli.
2. Add UI in the appropriate `components/settings/*` panel.
3. If it affects the prompt, memory, or extraction, also wire it on the **oread-cli** side
   (`promptBuilder.js` / the relevant service) — this GUI does not build prompts.
4. oread-cli's `settingsManager.setAll()` does a JSON round-trip; unknown keys are tolerated but ignored.

## Gotchas
1. **No CSRF.** `apiFetch()` is a plain fetch wrapper; `clearCsrfToken()` is a no-op kept for callers.
   The backend (oread-cli) has no CSRF endpoint — don't reintroduce token fetching.
2. **Vite proxy must keep `timeout:0`/`proxyTimeout:0`** or long SSE streams get cut.
3. **Zustand selectors** — `useStore((s) => s.x)`, never destructure.
4. **`TextField.onChange`** receives the value directly, not the event.
5. **`characterMode`** is `'single'` or `'multi'` (not `'multiple'`).
6. **SSE parsing** — check `line.startsWith('data: ')` before `JSON.parse`.
7. **Keep `settings.mode = 'roleplay'` and session `mode: 'roleplay'`.** `'normal'` is gone server-side.
8. **Message pin needs a real DB id** — only available after the post-turn `loadMessageHistory` reload.
9. **Character library files** live under `oread-cli/data/characters/user/` (backend-owned), not here.
10. **No backend in this repo.** `server.js`, `routes/`, `services/`, etc. were removed; git history has them.

## Backend internals
For how the prompt is built, memory/world-state extraction, context window, providers, world JSON
schema, and the full DB schema, see [`../oread-cli/CLAUDE.md`](../oread-cli/CLAUDE.md).
