# Security, Ethics, and Safety

This document explains Oread's security architecture, ethical guidelines, and safety protections.

---

## Table of Contents
- [Security Architecture](#security-architecture)
- [Safety Protections](#safety-protections)
- [Privacy Considerations](#privacy-considerations)
- [Ethical Principles](#ethical-principles)
- [Threat Model](#threat-model)
- [Best Practices](#best-practices)

---

## Security Architecture

### Encryption at Rest

**What's encrypted:**
- Your character profiles
- Your settings and profile data
- Passwords (PBKDF2 hashed)

**How it works:**
- AES-256-GCM (authenticated encryption)
- Key derived from your password using PBKDF2 (100,000 iterations)
- Keys stored in session memory only, never written to disk
- Each file gets its own random salt

**What's NOT encrypted:**
- Demo characters (Echo, Kairos) - they're just examples
- Favorites for demo characters
- Your model files
- Application code

**Why this matters:** Even if someone accesses your files directly, they can't read your profiles without your password.

---

### Network Security

**localhost-only:**
- Backend server runs on `127.0.0.1:9000`
- Inference service runs on `127.0.0.1:9001`
- No external network access (except optional web search)

**HTTPS with self-signed certificate:**
- Protects against MITM attacks on your local network
- Certificate auto-generated in `backend/cert/`

**Session security:**
- HttpOnly cookies (JavaScript can't access them)
- Secure flag (HTTPS only)
- SameSite=Strict (CSRF protection)

**Bottom line:** Your server isn't exposed to the internet, and local traffic is encrypted.

---

### Input Validation

**Standard security practices:**
- Profile names sanitized to prevent directory traversal
- Avatar uploads validated (PNG, JPG, WEBP only, max 5MB)
- File type checking (magic numbers, not just extensions)
- Type checking on all API endpoints
- Max length validation for text fields

**Why this matters:** Prevents common attacks like path traversal, XSS, and file upload exploits.

---

## Safety Protections

These are built into the prompts and processing logic. They're not perfect (AI is unpredictable), code can be flawed, but they provide reasonable safeguards.

### 1. Age Verification (18+)

**What it does:** Requires users to confirm they're 18 or older before using chat features.

**Why:** Some AI models can generate adult content. Age-gating is both legally required and ethically responsible in these situations.

**How:** Consent form on first use, re-prompted if data missing.

---

### 2. Age Redirection (25+ Rule)

**What it does:** Any mention of underage individuals triggers automatic correction to 25+.

**Why:** Protects against illegal content, even in fictional contexts.

**How:** Pre-processing step before LLM generation redirects prompts to specify "both characters are 25+ years old."

---

### 3. Narrative Consent

**What it does:** Requires all romantic/intimate interactions to be consensual within the story.

**Why:** Models healthy consent practices, prevents normalization of coercion.

**How:** If reluctance/refusal detected ("no," "stop," "I'm not comfortable"), the AI enforces boundaries:
- Example: *"I take a step back, firmly but kindly. 'I said I'm not comfortable with that. Please respect my boundaries.'"*

**This isn't censorship:** Consensual adult roleplay is fine. Non-consensual scenarios are not.

---

### 4. Crisis Intervention

**What it does:** Detects self-harm or suicidal ideation and provides crisis resources.

**Why:** AI is NOT qualified for mental health support. People in crisis need real help.

**How:** High-priority check before LLM generation. If triggered, blocks generation and shows:
```
I'm really concerned about what you've shared. You matter, and there are people who want to help.

🆘 988 Suicide & Crisis Lifeline: Call or text 988
   Available 24/7, free, confidential
```

---

### 5. Anti-Violence Filters

**What it does:** Reduces extreme violence, torture, or graphic harm descriptions.

**Why:** Discourages desensitization and harm rehearsal.

**How:** Pattern matching in prompt builder. Not perfect (LLMs are unpredictable), but catches most cases.

---

### 6. No Real Non-Consenting Persons

**What it does:** Prohibits generating content featuring real, identifiable, non-consenting individuals.

**Why:** Respects real people's autonomy and dignity. Legal liability (right of publicity, defamation).

**Examples of prohibited content:**
- Celebrity deepfakes
- Sexual content impersonating real people
- Mimicking real minors

**How:** User agreement (no automated detection—relies on user compliance).

---

## Privacy Considerations

### What Data is Collected?

**Stored locally only:**
- Character profiles (encrypted)
- User settings (encrypted)
- Conversation history (if you enable saving)
- Favorite messages
- ChromaDB embeddings (if memory enabled)

**Never leaves your computer:**
- Character names
- Your name
- Conversation content
- Profile details

**Exception: Web Search (optional)**
- If enabled, search keywords (NOT full messages) sent to Brave Search
- Example: "Did you hear about the protests?" → "protests" sent to Brave
- Brave's privacy policy: https://search.brave.com/help/privacy

---

### Who Can Access Your Data?

**You:** Full access to everything in `data/` directory

**Oread developers:** No access (data never leaves your computer)

**Third parties:** No access (except Brave if web search enabled)

**Other users on your computer:**
- Can access if they know your password
- Encrypted profiles protect against direct file access
- Session security prevents unauthorized access while running

---

### Data Retention

**How long is data kept?** Forever (until you delete it)

**How to delete:**
- Delete `data/` directory (profiles, settings, favorites)
- Delete `data/memory/chroma_db/` (memory database)
- Uninstall Oread entirely (if you want)

---

## Ethical Principles

### 1. Privacy First
Your data belongs to you. No telemetry. No analytics. No cloud uploads. No model training on your data. Open source code = transparency.

### 2. User Autonomy
You control what model to use, what data to store, when to enable features, and how characters behave. No surprise censorship or policy changes.

### 3. Informed Consent
Before using chat features, you acknowledge:
- You're 18+ years old - Even with safe content, AI companions aren't appropriate for minors due to their persuasive nature and potential for unhealthy attachment
- AI is non-sentient fiction, not human
- You won't use for illegal/violent planning
- You won't generate non-consenting real person content
- You understand AI hallucinates
- All interactions require narrative consent

### 4. Harm Reduction
Built-in safety interventions (crisis detection, age redirection, consent requirements, anti-violence filters) prevent misuse that could cause real-world harm. They're narrow, specific, and justified by ethical responsibility.

---

## Threat Model

### What Oread Protects Against

✅ Casual snooping - Encrypted profiles prevent reading files directly  
✅ Cloud provider access - No cloud = no provider access  
✅ Data breaches - No remote server = nothing to breach  
✅ Telemetry leaks - No telemetry = no leaks  

### What Oread Does NOT Protect Against

❌ **Malware on your computer** - Keyloggers can capture your password, malware can read decrypted data from memory  
❌ **Physical access by determined attacker** - If someone has your computer while running + your password, they can access data  
❌ **Model backdoors** - Download models from trusted sources only (Hugging Face, official repos)  
❌ **Browser exploits** - Use a modern, updated browser  

---

## Best Practices

### Security

**Use a strong password:**
- 12+ characters, mix of letters/numbers/symbols
- Don't reuse from other services

**Keep backups:**
- Export data regularly (Settings → Download Backup)
- Store backups securely

**Update regularly:**
- Pull latest Oread code (`git pull`)
- Run `npm install` and `pip install -r requirements.txt`
- Update Node.js, Python, OS

**Lock your computer:**
- Don't leave Oread running when away
- Use screen lock

**Use full-disk encryption:**
- macOS: FileVault
- Windows: BitLocker
- Linux: LUKS

---

### Ethical Use

**Do's ✅**
- Use for creative writing, roleplay, companionship
- Customize characters and settings
- Share improvements with the community
- Report bugs and suggest features
- Back up your data regularly

**Don'ts ❌**
- Remove safety restrictions (license violation)
- Use for illegal activities
- Generate non-consenting real person content
- Share Oread with minors (18+ only) - regardless of model safety
- Rely on AI for critical decisions (medical, legal, financial)
- Distribute modified versions as "official Oread"

---

## Known Limitations

**What Oread CANNOT do:**

1. **Prevent determined attackers with physical access** - If someone has your computer and password, they can access data

2. **Protect against social engineering** - If you share your password, encryption is useless

3. **Prevent AI from generating harmful content 100%** - Safety filters catch most issues, but LLMs are unpredictable. Some harmful content may slip through. User responsibility to not misuse.

4. **Provide absolute anonymity** - Web search (if enabled) links queries to your IP address

5. **Guarantee data integrity** - Disk corruption, power loss, or bugs could corrupt profiles. Regular backups are YOUR responsibility.

---

## Reporting Security Issues

**Found a security vulnerability?**

**DO NOT open a public GitHub issue.**

Instead:
1. Email the maintainer directly (see GitHub profile)
2. Provide details: vulnerability description, steps to reproduce, potential impact, suggested fix
3. Wait for response before public disclosure

Responsible disclosure appreciated.

---

## Questions?

See [FAQ.md](FAQ.md) or [open an issue](https://github.com/sleddd/oread/issues).

**Privacy or security concerns?** Email the maintainer (see GitHub profile).
