# Oread — A Personal AI Interface Project

**A privacy-first, model-agnostic AI interface. Built for learning. Currently in active rebuild.**

---

## What Is Oread?

Oread is a self-hosted AI interface that runs entirely on your machine — no cloud, no tracking, no third-party data collection. Named after the Oreads (Ὀρειάδες) of Greek mythology, mountain nymphs who were loyal companions to the gods, the project started as a way to explore AI companion apps locally, with full privacy, outside the control of any business or platform.

It has since grown into something broader: a personal research platform where I'm developing and testing my own ideas about AI memory, user-defined interaction profiles, and how we shape the tone and purpose of our conversations with language models.

**You bring the model. Oread provides the interface.**

---

## Why This Exists

Oread began because I wanted a companion-style AI conversation app — something like Nomi — that I could run locally and own completely. It was also the first time I used AI to build software: I provided the ideas and architecture, and let AI handle the routine coding. Everything about this project has been a learning process from the ground up.

### What I've Learned Building This

- How to use and implement local AI models and tooling
- How to develop and fine-tune AI models
- How to build custom sentiment analysis tools
- How AI context windows and chat memory actually work
- How to integrate services like web search into a local interface
- The practical quirks of working with LLMs and NLP day-to-day

---

## Where It's Going

Oread is evolving from a companion chat interface into a two-pronged rebuild:

### 1. A Memory Theory Testbed

I'm building and proving my own theory of AI memory, informed by ideas I explore in [What Gertrude Stein Taught Me About AI](https://github.com/4tlasX/writing-and-theory/blob/main/what-gertrude-stein-taught-me-about-ai). The short version: current approaches to AI memory are insufficient, and I believe there are better models for how context, recall, and conversational continuity should work. Oread is where I test that.

### 2. A Profile-Based Assistive Interface

The goal is for Oread to become an interface where users are defined as profiles — not just usernames, but rich descriptions of how they want to interact with an LLM. You could have one profile tuned for research, another for code, another for general conversation, each with its own tone, style, and integration preferences. The LLM adapts to the profile, not the other way around.

---

## Current State

**This is a personal project in active development. It is not production software.**

The original proof-of-concept worked as a companion chat interface formatted for roleplay-style LLMs. That version is functional but is being rebuilt to support the memory and profile work described above. Expect rough edges, incomplete features, and ongoing changes.

### What Works Now

- Multiple character creation with detailed personality profiles
- Default companions (Echo and Kairos) included as starting points
- Inclusive character system — any identity, orientation, or relationship type
- Lorebook system for custom prompts and personality patterns
- Long-term memory via vector database (ChromaDB)
- Optional web search integration
- Favorite messages, ambient audio, dark mode
- Mobile-friendly responsive design
- Encrypted user profiles (AES-256-GCM)
- Fully offline operation (except optional web search)

### What's Planned

- Implementation and testing of the new memory architecture
- Profile-based user system for multi-purpose LLM interaction
- Image understanding (without storage)
- Link/URL comprehension in conversations
- Optional audio features
- Multi-language support
- Mobile app options
- Model download helpers
- Group chat

---

## Screenshots

<!-- Add your actual screenshots here -->
<div align="center">

### Oread Login
<img width="1173" height="700" alt="Screenshot 2025-11-02 at 6 39 44 PM" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-login.png?raw=true" />

### Character Creation

*Build unique personalities with customizable traits*
<img width="1189" height="706" alt="Screenshot 2025-11-02 at 6 40 58 PM" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-character-building-1.png?raw=true" />

<img width="1056" height="597" alt="Screenshot 2025-11-02 at 6 41 11 PM" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-character-building-2.png?raw=true" />

<img width="1071" height="625" alt="Screenshot 2025-11-02 at 6 41 21 PM" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-character-building-3.png?raw=true" />

### Chat Interface

*Clean, responsive design for natural conversations*
<img width="1180" height="723" alt="oread-demo-wellness" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-chat-1.png?raw=true" />

<img width="1191" height="724" alt="oread-demo-dialogue-2" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-chat-2.png?raw=true" />

<img width="1185" height="745" alt="oread-demo-dialogue-1" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-chat-3.png?raw=true" />

### Settings & Profiles

*Full control over your experience - web search, memory, timezone, define your user profile like you would a character for better roleplay*

<img width="1142" height="737" alt="Screenshot 2025-11-02 at 6 42 08 PM" src="https://github.com/sleddd/oread-companion/blob/f282e86861ddf910582b4f9d6086dc25bf0cb5f4/assets/oread-demo-settings-1.png?raw=true" />

</div>

---

## Privacy

This is non-negotiable in Oread's design:

- All conversations stay on your machine
- Profiles encrypted with AES-256-GCM
- No telemetry, no analytics, no cloud sync
- You own everything
- The server runs on localhost only and does not expose itself to the internet by default

**What is not encrypted:** demo characters (Echo, Kairos) and web search queries if you enable that feature. Physical access to your computer means access to your data — back up regularly.

Full details: [SECURITY_ETHICS_SAFETY.md](SECURITY_ETHICS_SAFETY.md)

---

## Getting Started

### Requirements

- **RAM:** 16GB minimum (32GB recommended for larger models)
- **Storage:** 10GB+ free space
- **OS:** macOS, Linux, or Windows (WSL recommended)
- **Optional:** GPU (faster with Apple Silicon, NVIDIA, or AMD)

### Setup

1. Follow the [Installation Guide](INSTALLATION.md)
2. Download a model (see installation guide for options)
3. Run `./start-oread.sh`
4. Open `https://localhost:9000`
5. Default password is `oread` — change it immediately
6. Accept the safety protocols, then start chatting

On first startup, Oread automatically downloads two small models for local processing (no cloud calls): `all-MiniLM-L6-v2` (~90MB, for semantic memory search) and `roberta-base-go_emotions` (~500MB, for emotion detection). Both are cached locally after the first download.

---

## About the Code History

The public repo starts from the point where safety features were finalized. Earlier versions without those protections are kept in a [private repository](https://github.com/sleddd/oread-bu) to prevent easy removal of safeguards. Access can be requested, but I guard it carefully.

---

## License

**Open source for non-commercial use only** under the Oread Non-Commercial License v1.0.

You can use, modify, study, and share this software freely for personal, educational, or research purposes. You cannot use it commercially, sell it, remove safety features, or strip attribution. Full license: [LICENSE](LICENSE). For commercial licensing inquiries, contact me directly.

---

## Contributing

Bug reports, ideas, code contributions, and documentation improvements are all welcome. The one rule: don't remove safety features. See [the issues page](https://github.com/4tlasX/oread-companion/issues) or start a discussion.

---

## Built With

- [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) — LLM inference
- [ChromaDB](https://www.trychroma.com/) — Memory system
- [Express](https://expressjs.com/) — Web server
- [Brave Search API](https://brave.com/search/api/) — Web search

Developed with the assistance of Claude (Anthropic).

---

## Questions?

Check the [FAQ](FAQ.md) or [open an issue](https://github.com/4tlasX/oread-companion/issues).
