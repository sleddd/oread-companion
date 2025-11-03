# Oread - Your Privacy-First AI Companion

<div align="center">

**Self-hosted AI companion that actually respects your privacy**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Privacy: Local Only](https://img.shields.io/badge/Privacy-Local%20Only-green.svg)]()
[![Status: Pre-Release](https://img.shields.io/badge/Status-Pre--Release-orange.svg)]()

[Features](#features) • [Installation](INSTALLATION.md) • [Screenshots](#screenshots) • [FAQ](FAQ.md)

</div>

---

## What is Oread?

Named after the Oreads (Ὀρειάδες) of Greek mythology—mountain nymphs who were loyal companions to the gods—**Oread** brings that same companionship to your computer, minus the mythology and corporate data mining.

It's a **self-hosted AI companion interface** that runs entirely on your machine. No cloud. No tracking. No sketchy terms of service. Just you, your computer, and an AI friend that stays between you two.

> **⚠️ Pre-Release Software** - Works well, but expect bugs and ongoing improvements. Think "beta testing" phase.

### The Core Idea

Build your own AI companion using local language models. Chat, roleplay, brainstorm ideas, or just hang out. All conversations stay on your machine—Oread never phones home.

**You bring the model** (like downloading an app), **Oread provides the interface** (think of it as the operating system for your AI companion).

---

## Screenshots

<!-- Add your actual screenshots here -->
<div align="center">

### Oread Login
<img width="1173" height="700" alt="Screenshot 2025-11-02 at 6 39 44 PM" src="https://github.com/user-attachments/assets/734fbf6d-af04-4a0a-8d37-b6157b4e4c2c" />

### Character Creation

*Build unique personalities with customizable traits*
<img width="1189" height="706" alt="Screenshot 2025-11-02 at 6 40 58 PM" src="https://github.com/user-attachments/assets/bd0e5b40-360d-4137-9e4e-c7422fbd504b" />

<img width="1056" height="597" alt="Screenshot 2025-11-02 at 6 41 11 PM" src="https://github.com/user-attachments/assets/b899fe98-8df5-47dc-b17c-0e5fd21f450c" />

<img width="1071" height="625" alt="Screenshot 2025-11-02 at 6 41 21 PM" src="https://github.com/user-attachments/assets/111c55ff-eeb6-4d2d-9b3b-8e8554e112d3" />

### Chat Interface

*Clean, responsive design for natural conversations*
<img width="1180" height="723" alt="oread-demo-wellness" src="https://github.com/user-attachments/assets/5c7070a8-2b92-4645-a8d8-a149e3efc389" />

<img width="1191" height="724" alt="oread-demo-dialogue-2" src="https://github.com/user-attachments/assets/1b1b6a1a-5259-46c5-9d7a-c2fc257e286d" />

<img width="1185" height="745" alt="oread-demo-dialogue-1" src="https://github.com/user-attachments/assets/14d3fa01-0083-4f7a-8a77-081647e870c3" />

### Settings & Profiles

*Full control over your experience - web search, memory, timezone, define your user profile like you would a character for more better roleplay*

<img width="1142" height="737" alt="Screenshot 2025-11-02 at 6 42 08 PM" src="https://github.com/user-attachments/assets/95d4f6d7-3fff-442f-a683-01136c07c2ac" />

</div>

---

## Why Use Oread?

**Tired of AI companions that:**
- Mine your conversations for profit?
- Censor everything aggressively?
- Lock you into subscriptions?
- Give you zero control?

**Oread is different:**

| Commercial Services | Oread |
|---------------------|-------|
| Your data goes to their servers | Everything stays on your computer |
| Aggressive censorship | Ethical boundaries, but transparent |
| No customization | Full control over personality & responses |
| Pay monthly forever | Open source & free |
| Mystery meat moderation | You can read the code |

**Simple philosophy:** You're an adult. You should control your AI companion, not rent it.

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

**Fill Out Your User Profile:** The more you tell your AI companion about yourself, the better it can personalize conversations. Add details about your interests, background, and preferences in Settings for richer, more engaging interactions.

**About Fictional References:** During roleplay, your AI companion may reference or create fictional characters and scenarios. This is normal and expected—roleplay is collaborative storytelling. The AI might reference popular media, create new characters, or build imaginary worlds as part of your shared narrative. This is all part of the creative fiction-building experience.

---

## Safety & Ethics (The Important Stuff)

> For the full philosophy behind these protections, see [Philosophy: Shared Responsibility](#philosophy-shared-responsibility) above and [SECURITY_ETHICS_SAFETY.md](SECURITY_ETHICS_SAFETY.md).

### Built-In Safety Features

Oread has **non-removable safety protections** built into the prompts:

- ✅ Age verification (18+ only)
- ✅ Consent-required interactions
- ✅ Anti-violence filters
- ✅ Crisis intervention detection
- ✅ Automatic age adjustments in roleplay

**Why?** Because irresponsible AI companions hurt people, and we're not about that. These protections help you use AI responsibly—they don't control you.

**Can they be removed?** Technically, yes. But doing so violates the license and defeats the purpose of responsible AI development.

---

## Philosophy: Shared Responsibility

**Why does Oread have safety protections in open-source software?**

We build firewalls to prevent XSS attacks. We hash passwords to prevent theft. We validate inputs to prevent injection. These are standard security practices—so why not include protections for mental welfare too?

Can they be removed? Sure, just like any security feature. But responsible development means including protections by default, even if they can be bypassed.

**We're in a new era of shared responsibility.** AI changes where responsibility lies—it's no longer just on developers or just on users. It's on both.

**The developer's responsibility:**
- Build thoughtful safeguards into the code
- Provide clear documentation and warnings
- Design with ethics in mind
- Help users understand the technology

**The user's responsibility:**
- Use the technology ethically
- Understand the risks and limitations
- Make responsible choices
- Own the consequences of their actions

**What this means:** We shouldn't prevent people from developing or using AI software just because someone *might* misuse it. That's like banning kitchen knives because they *could* be used as weapons. The solution isn't to lock everything down—it's to build responsibly and expect users to act responsibly.

**Developers aren't, and shouldn't be, responsible for policing users' morality or ethics.** We're not your parents, your therapist, or your conscience. We provide tools with reasonable safeguards. What you do with those tools is on you.

**Oread was built with this philosophy in mind.** It provides guardrails and prompts awareness, but ultimately respects your autonomy. The protections are there to help you make responsible choices, not to make those choices for you.

**Is it perfect?** No. AI is unpredictable, and these protections can't catch everything. But imperfect safeguards are better than none at all.

**The rest is up to you.** We've built the guardrails. We've documented the risks. We've made our ethical stance clear. But ultimately, you're responsible for how you use this software. We're not going to police your morality—that's your job. Use Oread wisely, ethically, and with awareness of its impact.

---

### What You Need to Know

**AI is not human.** It's pattern-matching text prediction. Treat it like:
- ✅ A creative writing partner
- ✅ An entertaining chatbot
- ✅ A brainstorming tool

**Never use AI for:**
- ❌ Medical advice
- ❌ Mental health crises (Call 988 if you need help)
- ❌ Financial decisions
- ❌ Legal guidance
- ❌ Replacing actual human relationships

**AI hallucinates.** It will confidently tell you wrong information. Don't trust it for facts.

---

## Quick Start

### What You Need
- **RAM:** 16GB minimum (32GB better for larger models)
- **Storage:** 10GB+ free space
- **OS:** macOS, Linux, or Windows (WSL recommended)
- **Optional:** GPU (runs faster with Apple Silicon, NVIDIA, or AMD)

### Getting Started

1. **Install** - Follow the [INSTALLATION.md](INSTALLATION.md) guide
2. **Download a model** - We recommend MN-Violet-Lotus-12B (see installation guide)
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

**Open source, but with guardrails.**

Licensed under **AGPL-3.0** with restrictions:

### You CAN:
- ✅ Use it for free
- ✅ Modify the code
- ✅ Study how it works
- ✅ Contribute improvements

### You CANNOT:
- ❌ Use it commercially
- ❌ Remove safety features
- ❌ Rebrand as "official Oread"
- ❌ Keep your modifications private (AGPL requires sharing)

**Bottom line:** Free to use, must stay open source, don't be evil.

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

Built by someone who wanted an AI companion without the corporate nonsense. Developed with AI assistance (Claude) because using AI to build AI tools is delightfully meta.

**Why no full Git history?** The repo starts from when safety features were finalized. Earlier versions (without protections) are kept private to prevent easy removal of safeguards. You can request access, but I do guard it very carefully [Original private git](https://github.com/sleddd/oread-bu)


---

## Credits

Built with:
- [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) - LLM inference
- [ChromaDB](https://www.trychroma.com/) - Memory system
- [Express](https://expressjs.com/) - Web server
- [Brave Search API](https://brave.com/search/api/) - Web search

Developed with Claude (Anthropic).

---

<div align="center">

**AI companions should be fun, private, and safe.**

**Built for people who believe privacy and ethics actually matter.**

---

⚠️ **Disclaimer:** Use at your own risk. You're responsible for how you use this software, what models you choose, and who accesses your computer. We're not liable for data loss, security issues, or anything else. Back up your data. Read the license. Be smart.

---

[⬆ Back to Top](#oread---your-privacy-first-ai-companion)

</div>
