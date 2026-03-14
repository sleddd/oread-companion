# Data Folder Structure

This folder contains both default templates (tracked in git) and user data (excluded from git).

## Folder Structure

```
data/
├── avatars/                    # Default avatar images (in git)
│   └── Echo.svg
│
├── characters/
│   ├── defaults/               # Default character templates (in git)
│   │   ├── echo.json          # Default companion character
│   │   ├── assistant.json     # Default utility assistant
│   │   ├── elara.json         # Fantasy tavern keeper
│   │   ├── commander-zara.json # Sci-fi ship AI
│   │   ├── jack-marlowe.json  # Noir detective
│   │   └── nova.json          # Cyberpunk hacker
│   │
│   └── *.json                  # User-created characters (excluded from git)
│
├── lorebook/                   # Personality trait templates (in git)
│   ├── emotional-expression.json
│   ├── social-energy.json      # (to be created)
│   ├── thinking-style.json     # (to be created)
│   └── ...                     # (other trait categories)
│
├── settings/
│   ├── defaults/               # Default settings templates (in git)
│   │   ├── mode.json          # Default mode setting
│   │   ├── roleplay.json      # Default roleplay settings
│   │   ├── utility.json       # Default utility settings
│   │   ├── userPersona.json   # Default user persona
│   │   ├── general.json       # Default general settings
│   │   └── meta.json          # Default metadata
│   │
│   └── *.json                  # User settings (excluded from git)
│
├── chat.db                     # SQLite database (excluded from git)
├── chat.db-shm                 # SQLite shared memory (excluded from git)
├── chat.db-wal                 # SQLite write-ahead log (excluded from git)
│
└── vector-store/               # Vector embeddings (excluded from git)
```

## What's in Git vs What's Not

### ✅ Tracked in Git (Defaults & Templates)
- `avatars/` - Default avatar images
- `characters/defaults/` - Default character templates
- `lorebook/` - Personality trait templates
- `settings/defaults/` - Default settings templates
- This README file

### ❌ Excluded from Git (User Data)
- `settings/*.json` - User's personal settings
- `characters/*.json` - User-created characters
- `chat.db*` - Conversation history database
- `vector-store/` - RAG embeddings
- `.oread-chat-key` - Session encryption key (root level)

## First-Time Setup

When a new user clones the repository:

1. **Default characters** are available immediately in `characters/defaults/`
2. **Default settings** are available in `settings/defaults/`
3. **User settings** are automatically copied from defaults on first API call
4. **Database** is created automatically when first message is sent
5. **User characters** are created when templates are applied or custom characters are made

On first run, the backend automatically:
- Copies `settings/defaults/*.json` → `settings/*.json`
- User can then customize their settings without affecting defaults

## Applying Templates

When you apply a template (e.g., "Fantasy Tavern Keeper"):

1. The character is copied from `characters/defaults/elara.json`
2. To the user folder as `characters/elara.json`
3. Settings reference the character by ID: `singleCharacterRef: "elara"`
4. User can now customize their copy without affecting the default

## Resetting to Defaults

You can reset any character to its default version:

1. API: `POST /api/characters/reset/:id`
2. This copies from `characters/defaults/:id.json` → `characters/:id.json`
3. User customizations are overwritten with the default template
