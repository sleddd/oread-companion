# Oread Companion — Local AI Roleplay GUI

A privacy-first, **local** desktop-style GUI for immersive AI roleplay and writing. Design custom characters and
worlds, then play out persistent, character-driven scenarios — all running on your own machine.

Oread Companion is the **graphical front-end** for [**oread-cli**](https://github.com/cv01d/oread-cli), a local-first roleplay
engine. The CLI is the backend (database, memory, prompt-building, AI providers); this app is the
richer **editing and play surface**. You can use whichever you prefer — the terminal UI or this GUI —
on top of the same backend and the same saved worlds, characters, and sessions.

Note: The Oread CLI is being revised to have better roleplay and storytelling. It currently is missing the standard "you are" prompt which helps it maintain character. Unfortunately, I am limited on time, so I can only update this occasionally.

![Oread Companion](screenshots/screenshot-1.png)

## What is Oread Companion?

A roleplay-only chat GUI that talks to oread-cli over a local HTTP API. No data leaves your computer,
no subscriptions, no cloud dependency required (cloud model providers are opt-in via oread-cli).

- **Roleplay, done well** — create characters with personalities, backstories, and speaking styles;
  build worlds with lore, opening scenes, narrator voice, and hard rules.
- **Persistent memory** — characters remember across sessions; locations, present characters, events,
  and discoveries are tracked automatically.
- **Bring your own model** — local models via Ollama, or cloud models (Anthropic, OpenAI, Gemini, Bedrock, Cloudflare, Nomi, Kindroid) configured in oread-cli.

> **Roleplay-only.** The previous "assistant/normal" mode has been removed — this app is focused
> entirely on character-driven roleplay, matching oread-cli. 

## Features

### 🎭 Roleplay & world-building
- **Custom characters** — personalities, traits, backstory, role, avatar; single- or multi-character casts
- **World building** — setting lore, opening scene, narrator voice, hard rules
- **Reusable character library** — save characters once, reuse them across worlds
- **Worlds/templates** — start from a built-in world or save your own

### 🧠 Memory & continuity (handled by oread-cli)
- **World-state tracking** — location, time, present characters, ongoing events, mood, discoveries —
  viewable, editable, and re-extractable from the World State panel
- **Story notes** — free-form authorial notes injected into context each turn
- **Cross-session memory** — optional persistent memory + evolving relationships per character
- **Summarization & full-text recall** over long histories

### 🔒 Privacy & control
- **100% local** by default; cloud providers are strictly opt-in (keys stored encrypted in oread-cli)
- **No telemetry**
- **Model choice** — any Ollama model, plus cloud models when you add a key

## Screenshots

![Screenshot 1](screenshots/screenshot-1.png)
![Screenshot 2](screenshots/screenshot-2.png)
![Screenshot 3](screenshots/screenshot-3.png)
![Screenshot 4](screenshots/screenshot-4.png)

## Getting started

### Prerequisites
- **Node.js** v18+
- **[oread-cli](../oread-cli)** checked out alongside this repo (the backend)
- **Ollama** running ([download](https://ollama.ai)) with at least one model pulled, **or** a cloud
  provider key configured in oread-cli

### Install
```bash
# This GUI (installs client dependencies)
cd oread-companion
npm run install:client

# The backend, once
cd ../oread-cli
npm install
npm run build
```

## Running

Oread Companion needs the oread-cli API running. Use two terminals.

**Terminal 1 — backend (oread-cli) on `:3002`:**
```bash
# keep the chat + extraction (phi4-mini) models warm
OLLAMA_MAX_LOADED_MODELS=2 OLLAMA_NUM_PARALLEL=4 ollama serve

cd oread-cli
npm run build
node dist/oread.js --api --no-repl
#   (or `oread --api --no-repl` if you ran `npm link` in oread-cli)
```

**Terminal 2 — this GUI on `:5173`:**
```bash
cd oread-companion
npm run dev
```

Then open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the backend on `:3002`.

> First run: oread-cli auto-downloads the `phi4-mini` extraction model in the background. Chat works
> immediately; world-state extraction starts once it finishes.

## How to use

### Create a character
1. Open **Settings → Roleplay**.
2. Choose **Single** or **Multiple** character mode.
3. Fill in name, identity, personality traits, backstory, and (optionally) an avatar. Edits save
   automatically and sync to the backend.

### Build / pick a world
- **Settings → World** — pick a built-in or saved world to load its full configuration.
- **Settings → Roleplay → World/Narrative** — edit setting lore, opening scene, narrator voice, rules.
- Use **Save as World** to store your current setup as a reusable world.

### Play
1. Type in the input and press Enter — your character responds in-character, streaming token by token.
2. The **World State** panel shows the tracked scene (location, characters, events, mood); you can edit
   fields, re-extract from history (↻), or browse the change log.
3. Use **Story Notes** for authorial reminders the AI should keep in mind.
4. Manage conversations from the session sidebar (new / switch / archive); pin important messages.

### Choose a model
- **Settings → Model** — set the default model and generation parameters (temperature, top-P, max
  tokens, context budget), and download Ollama models. Cloud model keys are managed in oread-cli
  (`/key set ...`).

## Architecture

```
┌──────────────────┐        ┌──────────────────────┐        ┌──────────────┐
│  React GUI       │  HTTP  │   oread-cli backend  │  API   │   Ollama /   │
│  (Vite, :5173)   │ ─────► │   (Express, :3002)   │ ─────► │  cloud LLMs  │
└──────────────────┘        └──────────────────────┘        └──────────────┘
        ▲                              ▲
        └── shares the same backend ───┘
            with the oread-cli terminal UI
```

- **Frontend (this repo)**: React 19 + Vite, Zustand state, SCSS. Client-only — no server here.
- **Backend (oread-cli)**: Express HTTP API over a framework-agnostic engine; SQLite (WAL + FTS5) for
  sessions, messages, memory, relationships, and world snapshots; multi-provider LLM layer; phi4-mini
  for extraction.
- **Thin client**: the GUI sends `{ message, sessionId }`; oread-cli builds the prompt, streams the
  reply, and persists everything.

For backend internals (prompt building, memory tiers, world JSON schema, providers, DB schema), see
[`../oread-cli/README.md`](../oread-cli/README.md) and `../oread-cli/CLAUDE.md`.

## Troubleshooting

**Blank app / API errors in the console**
- Make sure the backend is running: `node dist/oread.js --api --no-repl` in `oread-cli` (listening on
  `http://127.0.0.1:3002`). The GUI proxies `/api/*` there.

**"Cannot connect to Ollama" / no models**
- Start Ollama (`ollama serve`) and pull a model (e.g. `ollama pull llama3`). Refresh models in
  **Settings → Model**.

**World State panel stays empty / "extraction model unavailable"**
- `phi4-mini` may still be downloading on first run. Chat works meanwhile; re-extract once it's ready.

**Slow responses**
- Use a smaller/faster model, lower the context budget, or run `ollama serve` with
  `OLLAMA_MAX_LOADED_MODELS=2` so the extraction model doesn't evict the chat model.

## License

Copyright 2025/2026 Claudette Raynor. This software is provided for non-commercial, personal, and
educational use only. Commercial redistribution or use is strictly prohibited without prior written
consent from the developer.

## Acknowledgments

- Backend by [oread-cli](../oread-cli)
- Local inference via [Ollama](https://ollama.ai)
- Built with [React](https://react.dev) and [Vite](https://vitejs.dev)
