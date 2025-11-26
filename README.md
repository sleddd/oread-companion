# Oread - Your Privacy-First, AI Interface

<div align="center">

**Self-hosted AI interface that actually respects your privacy**

[![License: Non-Commercial](https://img.shields.io/badge/License-Non--Commercial-blue.svg)](LICENSE)
[![Privacy: Local Only](https://img.shields.io/badge/Privacy-Local%20Only-green.svg)]()
[![Status: Pre-Release](https://img.shields.io/badge/Status-Pre--Release-orange.svg)]()

[Features](#features) • [Installation](INSTALLATION.md) • [Screenshots](#screenshots) • [FAQ](FAQ.md)

</div>

---

## What is Oread?

Named after the Oreads (Ὀρειάδες) of Greek mythology—mountain nymphs who were loyal companions to the gods—**Oread** brings that same companionship to your computer, minus the mythology and corporate data mining.

It's a **self-hosted AI interface** that runs entirely on your machine. No cloud. No tracking. No sketchy terms of service. Just you, your computer, and an AI friend that stays between you two.

> **⚠️ Pre-Release Software** - Works well, but expect bugs and ongoing improvements. Think "beta testing" phase.

### The Core Idea

Give your AI a bit of personality. The idea is to provide a model agnostic interface that allows you to give your LLM a personality, so that you can use it for anything from chat, research and discussion to roleplay with complete privacy. All conversations stay on your machine. Currently, it is formatted to work best with roleplay LLMs, but there will be changes in the future to ensure it is more widely supported.

**You bring the model** (like downloading an app), **Oread provides the interface** (think of it as the operating system for your AI assistant/companion).

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

## Features

### What's Included
- 🎭 **Multiple characters** - Create different AI personalities with detailed profiles
- 🤖 **Default companions** - Echo (fun & chatty) and Kairos (wellness & reflection) included to get started
- 🌈 **Inclusive character system** - Build any identity, orientation, or relationship type
- 📝 **Lorebook system** - Custom prompts and personality patterns
- 💾 **Long-term memory** - Vector database remembers past conversations
- 🔍 **Web search** (optional) - AI can look up current info
- ❤️ **Favorite messages** - Save the good stuff
- 🎵 **Ambient audio** - Built-in music player for vibes
- 📱 **Mobile friendly** - Works on phones and tablets
- 🌙 **Dark mode** - Easy on the eyes
- 🔐 **Encrypted profiles** - Your data is protected

### What Makes It Different
- **Emotionally aware conversations** - Not just "bot replies"
- **Works offline** (except optional web search)
- **Model-agnostic** - Use any GGUF model you want
- **No typing indicators like \*waves\*** - Natural dialogue
- **Time-aware** - Different greetings based on time of day

### Getting the Best Roleplay Experience

**Fill Out Your User Profile:** The more you tell your AI about yourself, the better it can personalize conversations. Add details about your interests, background, and preferences in Settings for richer, more engaging interactions.

**About Fictional References:** During roleplay, your AI may reference or create fictional characters and scenarios. This is normal and expected—roleplay is collaborative storytelling. The AI might reference popular media, create new characters, or build imaginary worlds as part of your shared narrative. This is all part of the creative fiction-building experience.

---

## Safety & Ethics (The Important Stuff)

> For the full philosophy behind these protections, see [Philosophy: Shared Responsibility](#philosophy-shared-responsibility) above and [SECURITY_ETHICS_SAFETY.md](SECURITY_ETHICS_SAFETY.md).

--_

## Quick Start

### What You Need
- **RAM:** 16GB minimum (32GB better for larger models)
- **Storage:** 10GB+ free space
- **OS:** macOS, Linux, or Windows (WSL recommended)
- **Optional:** GPU (runs faster with Apple Silicon, NVIDIA, or AMD)

### Getting Started

1. **Install** - Follow the [INSTALLATION.md](INSTALLATION.md) guide
2. **Download a model** - See [Installation](INSTALLATION.md) for an overview of model options
3. **Start Oread** - Run `./start-oread.sh`
4. **Open browser** - Go to `https://localhost:9000`
5. **Login** - Default password is `oread` (change it immediately!)
6. **Accept terms** - Read and agree to safety protocols
7. **Start chatting!** - Echo or Kairos are ready to talk

Full instructions: [INSTALLATION.md](INSTALLATION.md)

---

## Privacy & Security

### What's Protected
- ✅ All conversations stay on your computer
- ✅ Profiles encrypted (AES-256-GCM)
- ✅ No telemetry or analytics
- ✅ No cloud sync
- ✅ You own everything

### What's NOT Encrypted
- Demo characters (Echo, Kairos) - they're examples
- Web search queries (if you enable that feature)

### Important Notes
- **Backup regularly** - Settings → Download Backup
- **localhost only** - Server doesn't expose to internet by default
- **Physical access = risk** - Anyone with your computer can access your data

Full details: [SECURITY_ETHICS_SAFETY.md](SECURITY_ETHICS_SAFETY.md)

---

## License (TL;DR)

**Open source for non-commercial use only.**

Licensed under **Oread Non-Commercial License v1.0**:

### You CAN:
- ✅ Use it for free (personal, educational, research)
- ✅ Modify the code
- ✅ Study how it works
- ✅ Contribute improvements
- ✅ Share modifications (under same license)

### You CANNOT:
- ❌ Use it commercially or for profit
- ❌ Sell, resell, or sublicense it
- ❌ Use it in SaaS or paid services
- ❌ Remove safety features
- ❌ Remove attribution or license notices

**Bottom line:** Free for personal use. No commercial use or resale. Safety features required. Attribution required.

**Need commercial licensing?** Contact the author.

Full license: [LICENSE](LICENSE)

---

## Contributing

Want to help? Awesome!

- 🐛 **Found a bug?** [Open an issue](https://github.com/sleddd/oread/issues)
- 💡 **Have an idea?** Start a discussion
- 🔧 **Can code?** Submit a pull request
- 📖 **Like writing?** Improve the docs

**Rules:** Don't remove safety features, test your changes, document what you did.

---

## What's Coming and Experiement Features

### Planned Features
- A way to understand, but not store user images
- A way to understand user shared links
- Optional audio
- Multi-language Support - It is just English right now
- Mobile app options
- Model download options
- Group conversations

### Current Issues / What is still needed
- Comprehensive personality trait testing
- Code needs review and cleanup (it grew fast!)
- SCSS is messy
- Some security improvements

---

## Support

- **Questions?** Check the [FAQ](FAQ.md)
- **Problems?** [Open an issue](https://github.com/sleddd/oread/issues)
- **Need help?** Start a discussion

---

## About This Project

Built by someone who wanted an AI assistant/companion without the corporate nonsense. Developed with AI assistance (Claude) because using AI to build AI tools is delightfully meta and qiuck.

**Why no full Git history?** The repo starts from when safety features were finalized. Earlier versions (without protections) are kept private to prevent easy removal of safeguards. You can request access, but I do guard it very carefully [Original private git](https://github.com/sleddd/oread-bu)


---

## Credits

Built with:
- [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) - LLM inference
- [ChromaDB](https://www.trychroma.com/) - Memory system
- [Express](https://expressjs.com/) - Web server
- [Brave Search API](https://brave.com/search/api/) - Web search

Developed with the assistance of Claude (Anthropic) to decrease development time.

---

<div align="center">

**AI should be fun, private, and safe.**

**Built for people who believe privacy and ethics actually matter.**

---

⚠️ **Disclaimer:** Use at your own risk. You're responsible for how you use this software, what models you choose, and who accesses your computer. We're not liable for data loss, security issues, or anything else. Back up your data. Read the license. Be smart.

---

[⬆ Back to Top](#oread---your-privacy-first-ai-companion)

</div>
