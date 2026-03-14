# Oread

A local-first AI chat app for world-building, roleplay, and custom AI interactions. Build immersive worlds and step into them, create companion characters, or craft tailored utility assistants — all running on your own hardware through Ollama.

> **Note**: This app is in active development. Fully functional but not yet exhaustively tested.

---

## What is Oread?

Oread is a chat interface that puts **worlds first**. Instead of just picking a model and chatting, you build complete environments — settings, characters, rules, narrative voice — and then have conversations inside them.

**Roleplay worlds** — Create a fantasy tavern, a noir detective's office, a cyberpunk back-alley, or anything you can imagine. Define the lore, set the opening scene, add characters with rich personalities and backstories, and let the story unfold.

**Companion characters** — Build AI companions with distinct personalities, communication styles, and areas of expertise. A mindful wellness companion, a witty conversation partner, or a reflective journaling buddy.

**Utility assistants** — Configure purpose-built AI tools like code reviewers, research assistants, or expert tutors with custom personas, guardrails, and formatting preferences. No world-building needed — just a focused identity and rules.

Everything is saved as a **world** you can switch between instantly. Jump from a fantasy adventure to a code review session to a reflective conversation with one click.

---

## Features

- **World building** — Lore, opening scenes, narrator voice, pacing, and hard rules that shape every response
- **Character system** — Name, backstory, personality traits, appearance, voice, inventory; single or multi-character modes
- **Streaming chat** — Real-time token-by-token responses via SSE
- **Session management** — Independent conversation histories, archiving, and session switching
- **Semantic memory** — FAISS vector search surfaces relevant context from long conversations (50+ messages)
- **Auto-extraction** — AI analyzes roleplay conversations and suggests character detail updates
- **Worlds** — 9 built-in presets (roleplay + utility); save your current settings as a named world and switch between them
- **Model management** — Browse, download, and switch Ollama models; HuggingFace GGUF support
- **User persona** — Define yourself once and carry your identity across all worlds
- **Dark theme** — Montserrat font, teal accent (#4db8a8), designed for long sessions

---

## Quick Start

### Prerequisites

1. **Node.js v18+**
2. **Ollama** — [ollama.com](https://ollama.com)
3. **An embedding model** (for memory):
   ```bash
   ollama pull nomic-embed-text
   ```

### Install

```bash
# Clone the repo
git clone <repo-url> && cd chat

# Backend dependencies
npm install

# Frontend dependencies
cd client && npm install && cd ..
```

### Run

```bash
# Make sure Ollama is running
ollama serve

# Terminal 1 — Backend (http://localhost:3001)
npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd client && npm run dev
```

Open **http://localhost:5173** and pick a template to get started.

---

## How It Works

1. **Pick a world** — Choose a built-in world (Fantasy Tavern, Cyberpunk Hacker, Detective Noir...) or a utility assistant (Code Reviewer, Research Assistant, Expert Tutor...), or create your own from scratch.

2. **Customize** — Edit the world settings, characters, rules, and narrative style. For utility mode, configure the assistant identity, guardrails, and formatting.

3. **Chat** — Start a session and interact. The system prompt is built automatically from your world settings. Streaming responses appear token by token.

4. **Memory kicks in** — After 50+ messages, semantic memory activates. The system retrieves relevant earlier context so the conversation stays coherent over long sessions.

5. **Characters evolve** — In roleplay mode, the AI periodically analyzes the conversation and suggests updates to character details based on what's happened in the story.

---

## Built-in Templates

### Roleplay Worlds
| Template | Description |
|----------|-------------|
| Fantasy Tavern | Medieval fantasy tavern with Elara the tavern keeper |
| Cyberpunk Hacker | Neon-lit back-alley with a rogue hacker guide |
| Detective Noir | 1940s noir detective's office |
| Sci-Fi Explorer | Deep space exploration aboard the ISS Wanderlust |
| Companion — Kairos | Calm, reflective wellness and mindfulness companion |
| Companion — Echo | Warm, curious conversation companion |

### Utility Assistants
| Template | Description |
|----------|-------------|
| Code Reviewer | Senior engineer providing constructive code review |
| Research Assistant | Structured research and analysis partner |
| Expert Tutor | Adaptive teacher across any subject |

---

## Troubleshooting

**Red "Disconnected" status** — Run `ollama serve`, then refresh.

**Memory not activating** — Pull `nomic-embed-text`, enable Memory in Settings > General, session needs 50+ messages.

**Chat not working** — Select a model in Settings > Model, ensure a session is active.

---

## Tech Stack

Node.js, Express, SQLite, React 19, Vite, Zustand, SCSS, Ollama, FAISS

For full architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System design, data flow, project structure, and API reference
- [Quick Start](docs/QUICK_START.md) — Getting up and running fast
- [Security](docs/SECURITY.md) — Security model and configuration

---

MIT License
