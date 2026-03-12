# Oread Chat Interface

A modern, full-stack chat interface with advanced memory and character roleplay features for local Ollama models. Built with Node.js, Express, React, Vite, LangChain, and Model Context Protocol (MCP).

## Current State
Use at your own risk. This app is in rebuild and while fully working and ready to use, it has not been fully bug tested and reviewed. Using it means you assume full liability for what goes wrong or any security issues. I hope to have it fully reviewed within the next few weeks, until then feel free to use it if you want.


## Features

### 🧠 Memory System (NEW v3.0.0)
- **Session Management** - Create, switch, and manage multiple conversation sessions
- **Message Persistence** - All messages stored in SQLite database via MCP
- **RAG (Retrieval Augmented Generation)** - Semantic search using FAISS and embeddings
  - Automatically activates when session exceeds 50 messages
  - Uses recent 20 messages + top 5 semantically similar messages
  - Powered by Ollama's nomic-embed-text model
- **Infinite Scroll History** - Load entire conversation history with pagination
- **Auto-Extraction** - AI-powered character detail extraction with user approval
  - Analyzes every 5 messages in roleplay mode
  - Suggests updates to personality, backstory, knowledge, appearance
  - Confidence scoring and category organization
  - Preview before applying changes
- **Vector Store** - FAISS-based semantic search for each session
- **Background Embeddings** - Automatic vector generation for all messages

### 🎭 Comprehensive Settings System (v2.0.0)
- **Two Modes** - Roleplay and Utility/Normal modes
- **8 Preset Templates** - 5 roleplay + 3 utility templates
- **Character Management** - Single or multiple character support
- **World Building** - Setting lore, opening scene, narrator voice
- **User Persona** - Custom user preferences and boundaries
- **Avatar Support** - Image upload with auto-resize to 512x512px
- **Mode Toggle Commands** - `/chat` and `/play` for mid-conversation switching
- **Auto-Save** - Hybrid localStorage + backend persistence (1s debounce)
- **Import/Export** - Settings backup and restore
- **Dynamic System Prompts** - Generated from settings with variable mapping

### 🎨 Oread Design System (v2.1.0)
- **Dark Theme** - Complete dark color palette (#1a1a1a backgrounds)
- **Montserrat Typography** - Professional font system (weights 300-700)
- **Teal Accent Color** - Modern teal (#4db8a8) accent throughout
- **Character Sidebar** - Left sidebar with circular avatar and character name
- **Redesigned Chat Bubbles** - 18px border-radius with cutoff corners
- **Pill-Shaped Input** - Rounded input field with circular send button
- **Track Selector** - Background ambient music selector
- **Enhanced Animations** - Hover transforms, glows, and smooth transitions
- **Custom Scrollbars** - Thin (6px) dark scrollbars

### 📦 Model Management
- **View Models** - List all locally available Ollama models
- **Download Models** - From Ollama library (e.g., `llama2`, `mistral`)
- **HuggingFace GGUF** - Support for HuggingFace models (e.g., `hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF`)
- **Real-time Progress** - Live download progress tracking
- **Model Switching** - Switch between models with session management

### 💬 Chat Interface
- **Real-time Streaming** - Token-by-token streaming responses
- **Session-Based** - Multiple conversation sessions with independent histories
- **Message History** - Infinite scroll pagination loading
- **Context-Aware** - Automatic RAG activation for long conversations
- **Character Mode** - Roleplay with character avatars and personas
- **Clean UI** - Modern dark theme with teal accents

### 🏗️ Architecture
- **LangChain Integration** - RAG orchestration with Ollama embeddings
- **MCP (Model Context Protocol)** - Standardized data access layer
  - SQLite MCP for database operations
  - Filesystem MCP for settings management
  - Custom Vector Store MCP for FAISS search
  - Custom Settings Tools MCP for character extraction
- **Zustand State Management** - Centralized state with no prop drilling
- **Granular Components** - Reusable UI primitives and modular design
- **Individual JSON Files** - Settings stored as separate files for granular backup

## Prerequisites

Before running this application, ensure you have:

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **Ollama** installed and running
   - Install from [https://ollama.com](https://ollama.com)
   - Start Ollama service:
     ```bash
     ollama serve
     ```
   - Verify Ollama is running:
     ```bash
     curl http://localhost:11434/api/tags
     ```

3. **Embedding Model** (Required for Memory System)
   - Download the nomic-embed-text model:
     ```bash
     ollama pull nomic-embed-text
     ```
   - This model is used for RAG semantic search and embeddings

## Installation

### 1. Install Backend Dependencies

```bash
npm install
```

### 2. Install Frontend Dependencies

```bash
cd client
npm install
cd ..
```

## Running the Application

You need to run both the backend and frontend servers.

### Terminal 1: Start Backend Server

```bash
npm start
```

The backend API will run on **http://localhost:3001**

Available endpoints:
- `GET /api/health` - Check Ollama connection status
- `GET /api/models` - List available models
- `POST /api/models/pull` - Download a model (SSE streaming)
- `POST /api/chat` - Send chat message with RAG support (SSE streaming)
- `GET/POST /api/settings` - Load/save user settings
- `POST /api/sessions` - Create new conversation session
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id/messages` - Get session message history
- `POST /api/memory/embed` - Create embeddings for messages
- `POST /api/memory/search` - Semantic search in vector store

### Terminal 2: Start Frontend Development Server

```bash
cd client
npm run dev
```

The frontend will run on **http://localhost:5173**

Open your browser to **http://localhost:5173** to use the application.

## Usage

### 1. Check Connection Status

Look at the header to verify Ollama is connected (green indicator).

### 2. Configure Settings (Optional)

Click the settings icon in the header to access comprehensive settings:

**Mode Selection**:
- **Roleplay Mode** - Character-based interactions with world building
- **Utility Mode** - Standard AI assistant

**Templates** (Quick Start):
- Choose from 8 preset templates (5 roleplay + 3 utility)
- Templates include: Fantasy Tavern Keeper, Sci-Fi Ship AI, Noir Detective, Expert Tutor, Code Review Partner, and more

**Roleplay Settings** (if in roleplay mode):
- **World Settings** - Setting lore, opening scene, narrator voice
- **Character Configuration** - Single or multiple characters
- **Character Details** - Identity, personality, backstory, appearance, voice
- **Avatar Upload** - Add character images (auto-resized to 512x512px)

**User Persona**:
- Set your name, bio, skills, interests
- Define boundaries and linguistic filters

**General Settings**:
- Select model, temperature, top_p, max_tokens
- Enable/disable memory system (RAG)

### 3. Download a Model

Navigate to the Settings page, Models tab:
- **Ollama Library Models**: Enter model name like `llama2`, `mistral`, `codellama`
- **HuggingFace GGUF Models**: Enter full path like `hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF`

Click "Download" and watch the progress bar.

### 4. Create or Select a Session

In the chat page sidebar:
- Click **"+ New"** to create a new conversation session
- Select from existing sessions in the list
- Each session maintains its own:
  - Message history
  - Vector embeddings (for RAG)
  - Character configuration

### 5. Chat

Type your message in the pill-shaped input field at the bottom:
- Press **Enter** or click the send button (▶)
- Watch the response stream in real-time
- **RAG activates automatically** after 50 messages for better context

**Special Commands**:
- `/chat` - Switch to utility mode for this conversation
- `/play` - Switch to roleplay mode for this conversation

### 6. View Message History

- Scroll up to load earlier messages (infinite scroll)
- Click **"Jump to present"** to return to latest messages
- All messages are persisted in SQLite database

### 7. Auto-Extraction (Roleplay Mode)

When memory is enabled in roleplay mode:
- Every 5 messages, AI analyzes conversation for new character details
- Review suggested updates in the modal popup
- Preview changes before applying
- Categories: personality, backstory, knowledge, appearance, voice
- Select which updates to apply

## Project Structure

```
/chat
├── package.json              # Backend dependencies
├── server.js                 # Express API server
├── mcp-config.json           # MCP server configurations
│
├── services/                 # Backend services
│   ├── ollama.js            # Ollama API wrapper
│   ├── database.js          # SQLite schema initialization
│   ├── mcpClient.js         # MCP client for all servers
│   ├── langchainRAG.js      # LangChain RAG orchestration
│   └── extractionAgent.js   # Character extraction agent
│
├── controllers/
│   └── settingsController.js # Settings CRUD operations
│
├── routes/                   # API routes
│   ├── settings.js          # Settings endpoints
│   ├── sessions.js          # Session CRUD API
│   └── memory.js            # RAG/embedding API
│
├── mcp-servers/             # Custom MCP servers
│   ├── vector-store-server.js      # FAISS vector store MCP
│   └── settings-tools-server.js    # Settings extraction tools MCP
│
├── data/                    # Persistent data
│   ├── chat.db              # SQLite database (auto-created)
│   ├── vector-store/        # FAISS indexes per session
│   │   ├── {session-id}.index
│   │   └── {session-id}.meta.json
│   └── settings/            # User settings (individual JSON files)
│       ├── mode.json
│       ├── roleplay.json
│       ├── utility.json
│       ├── userPersona.json
│       ├── general.json
│       └── meta.json
│
├── CLAUDE.md                # Complete developer documentation
└── README.md                # This file
│
└── client/                  # React frontend
    ├── package.json         # Frontend dependencies
    ├── vite.config.js       # Vite config with proxy
    │
    └── src/
        ├── App.jsx          # Root component (30 lines - minimal!)
        ├── main.jsx         # React entry point
        │
        ├── store/
        │   └── useStore.js  # Zustand store (700+ lines)
        │
        ├── pages/
        │   ├── ChatPage.jsx     # Chat view
        │   └── Settings.jsx     # Settings view
        │
        ├── components/
        │   ├── ui/              # Reusable UI primitives
        │   │   ├── Button.jsx
        │   │   ├── TextField.jsx
        │   │   ├── Dropdown.jsx
        │   │   ├── ProgressBar.jsx
        │   │   ├── TagInput.jsx
        │   │   └── ImageUpload.jsx
        │   │
        │   ├── chat/            # Chat components
        │   │   ├── ChatBubble.jsx
        │   │   ├── ChatInput.jsx
        │   │   ├── ChatInterface.jsx
        │   │   ├── MessageHistoryViewer.jsx  # NEW - Infinite scroll
        │   │   └── AutoUpdateSuggestions.jsx # NEW - Extraction modal
        │   │
        │   ├── session/         # Session components
        │   │   └── SessionManager.jsx  # NEW - Session CRUD
        │   │
        │   ├── model/           # Model management
        │   │   ├── ModelSelector.jsx
        │   │   └── ModelDownloader.jsx
        │   │
        │   ├── layout/          # Layout components
        │   │   └── Header.jsx
        │   │
        │   └── settings/        # Settings components (10+)
        │       ├── TemplateSelector.jsx
        │       ├── ModeSelector.jsx
        │       ├── WorldSettingsPanel.jsx
        │       ├── CharacterEditor.jsx
        │       ├── CharacterList.jsx
        │       └── ... (more panels)
        │
        ├── data/
        │   ├── templates.js     # 8 preset templates
        │   └── defaultSettings.js
        │
        ├── utils/
        │   ├── settingsAPI.js   # Settings API client
        │   ├── promptBuilder.js # System prompt generation
        │   ├── imageProcessor.js
        │   ├── sessionAPI.js    # Session API client
        │   └── ... (more utilities)
        │
        └── styles/
            ├── global.scss      # Global styles & variables
            └── ... (component SCSS modules)
```

## Architecture

### State Management (Zustand)

**Centralized Store** - No prop drilling, automatic re-renders:
- **Settings State** - Mode, roleplay, utility, persona, general settings
- **Chat State** - Messages, isSending, activeMode
- **Model State** - Models list, selectedModel, download progress
- **Session State** - currentSessionId, sessions list, session management
- **Message History** - messageHistory, pagination, infinite scroll
- **RAG/Vector Context** - vectorContext, context loading
- **Auto-Extraction** - extracted suggestions, approval workflow

### Data Flow

```
User sends message
  ↓
Chat endpoint (with sessionId)
  ↓
Check: session > 50 messages?
  ├─ YES → Use RAG (recent 20 + top 5 semantic)
  └─ NO  → Use full history
  ↓
Stream response (SSE)
  ↓
Background tasks:
  ├─ Save to SQLite (via MCP)
  ├─ Create embeddings → FAISS
  └─ Every 5 msgs → Run extraction agent
      └─ Suggest character updates (user approval required)
```

### Component Architecture

```
App.jsx (Minimal - routing & initialization)
  ↓
  ├─ Header (Navigation & Status)
  │
  ├─ ChatPage
  │   ├─ Sidebar
  │   │   ├─ Character Avatar & Name
  │   │   ├─ SessionManager (create/delete/select sessions)
  │   │   └─ Track Selector
  │   │
  │   ├─ ChatInterface
  │   │   ├─ MessageHistoryViewer (infinite scroll)
  │   │   │   ├─ Load history (50 at a time)
  │   │   │   └─ ChatBubble[] (history + current)
  │   │   └─ ChatInput (pill-shaped input + send)
  │   │
  │   └─ AutoUpdateSuggestions (extraction modal)
  │
  └─ Settings (tabbed interface)
      ├─ TemplateSelector
      ├─ ModeSelector (Roleplay/Utility)
      ├─ WorldSettingsPanel
      ├─ CharacterEditor (with avatar upload)
      ├─ CharacterList
      ├─ UtilitySettingsPanel
      ├─ UserPersonaPanel
      ├─ GeneralSettingsPanel (incl. memory toggle)
      ├─ ModelSelector
      └─ ModelDownloader
```

### Memory System Architecture

```
┌─────────────────────────────────────────────────────────┐
│         Express Backend (port 3001)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  LangChain + MCP Services                         │  │
│  │  - langchainRAG.js (Ollama embeddings)            │  │
│  │  - extractionAgent.js (Character analysis)        │  │
│  │  - mcpClient.js (Manages 4 MCP servers)           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
           │                    │                    │
           │ HTTP               │ stdio              │ stdio
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐
│ Ollama (11434)   │  │ MCP Servers      │  │ Vector Store   │
│ - Chat LLM       │  │ - SQLite Server  │  │ - FAISS Index  │
│ - nomic-embed    │  │ - Filesystem     │  │ - Per Session  │
└──────────────────┘  │ - Settings Tools │  └────────────────┘
                      └──────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │ Persistent Data  │
                      │ - chat.db        │
                      │ - settings/*.json│
                      │ - vector-store/  │
                      └──────────────────┘
```

## Key Features Explained

### Memory System & RAG

**How it works**:
1. Enable **Memory** in Settings → General
2. Create or select a session
3. Send messages normally
4. After **50 messages**, RAG automatically activates
5. System uses:
   - **Recent 20 messages** (conversation continuity)
   - **Top 5 semantically similar messages** (relevant context from entire history)
6. All messages embedded using `nomic-embed-text` and stored in FAISS

**Benefits**:
- Maintain context in very long conversations (100+ messages)
- AI recalls relevant information from early in conversation
- Semantic search finds related topics, not just keywords

### Auto-Extraction

**How it works** (Roleplay mode only):
1. Enable **Memory** in Settings → General
2. Set mode to **Roleplay**
3. Every **5 messages**, AI analyzes conversation
4. Extracts new character details:
   - Personality traits
   - Backstory elements
   - Knowledge/skills
   - Appearance details
   - Voice/mannerisms
5. Shows suggestions modal with:
   - Confidence scores (High/Medium/Low)
   - Before/after preview
   - Category icons
6. You approve which updates to apply

**Benefits**:
- Character evolves naturally through conversation
- Maintains consistency without manual updates
- You stay in control (always requires approval)

### Session Management

**Why use sessions?**
- Separate conversations with different characters
- Organize chats by topic or context
- Each session has independent:
  - Message history
  - Vector embeddings
  - Character configuration

**Best practices**:
- Create new session when switching characters
- Use descriptive session names
- Archive old sessions instead of deleting

## Troubleshooting

### Ollama Not Connected

**Symptom**: Red "Disconnected" indicator in header

**Solutions**:
1. Ensure Ollama is installed: [https://ollama.com](https://ollama.com)
2. Start Ollama service: `ollama serve`
3. Check Ollama is running: `curl http://localhost:11434/api/tags`
4. Click refresh button in the header

### Memory/RAG Not Working

**Symptom**: RAG not activating or embeddings failing

**Solutions**:
1. Ensure `nomic-embed-text` is downloaded: `ollama pull nomic-embed-text`
2. Check memory is enabled in Settings → General
3. Verify session has > 50 messages for RAG activation
4. Check backend console for "✅ All services initialized"
5. Look for error messages in browser console

### MCP Servers Not Starting

**Symptom**: Backend errors about MCP server connections

**Solutions**:
1. Check `mcp-config.json` exists in project root
2. Ensure Node.js v18+ is installed
3. Check backend console for MCP initialization messages
4. Verify SQLite database is writable in `/data/chat.db`

### Model Download Fails

**Solutions**:
1. Check internet connection
2. Verify model name is correct
3. For HuggingFace models, use full path: `hf.co/username/model-name`
4. Ensure sufficient disk space

### Chat Not Working

**Solutions**:
1. Ensure a model is selected in Settings → General
2. Check backend server is running on port 3001
3. Verify frontend proxy is configured correctly in `vite.config.js`
4. Create or select a session before sending messages

### Auto-Extraction Not Triggering

**Solutions**:
1. Ensure mode is set to **Roleplay** (not Utility)
2. Verify memory is enabled in Settings → General
3. Send at least 5 messages in the session
4. Check backend console for "🔍 Running extraction analysis"

## Technology Stack

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **AI Integration**: Ollama (official `ollama` npm package v0.6.3+)
- **Memory System**: LangChain + Model Context Protocol (MCP)
- **Database**: SQLite (via MCP server)
- **Vector Store**: FAISS (via custom MCP server)
- **Embeddings**: Ollama nomic-embed-text model
- **Communication**: REST API + Server-Sent Events (SSE) for streaming

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite
- **Language**: JavaScript (JSX)
- **Styling**: SCSS (global + component modules)
- **Design System**: Oread Dark Theme
  - Montserrat font family (weights: 300, 400, 500, 600, 700)
  - Teal accent color (#4db8a8)
  - Dark backgrounds (#1a1a1a)
- **State Management**: Zustand (centralized store)

### External Dependencies
- **Ollama Service**: Must be running locally on `http://localhost:11434`
- **MCP Servers**: SQLite, Filesystem, Vector Store (auto-started by backend)
- **Embedding Model**: nomic-embed-text (download: `ollama pull nomic-embed-text`)

## Version History

### v3.0.0 (2026-03-11) - Memory System with LangChain + MCP
- ✅ LangChain Integration - RAG orchestration
- ✅ MCP Architecture - Model Context Protocol for data access
- ✅ Session Management - Multiple conversation sessions
- ✅ Message Persistence - SQLite database storage
- ✅ Vector Memory (RAG) - FAISS semantic search
- ✅ Auto-Extraction - AI-powered character detail extraction
- ✅ Infinite Scroll History - Complete message history with pagination
- ✅ Background Embeddings - Automatic vector generation

### v2.1.0 (2026-03-11) - Oread Design System
- ✅ Dark Theme - Complete redesign
- ✅ Montserrat Font - Professional typography
- ✅ Teal Accent Color - Modern color palette
- ✅ Character Sidebar - Avatar and character name display
- ✅ Enhanced Animations - Hover effects and transitions

### v2.0.0 (2026-03-12) - Comprehensive Settings System
- ✅ Zustand Migration - Centralized state management
- ✅ Settings System - Roleplay and Utility modes
- ✅ Template System - 8 preset templates
- ✅ Settings Persistence - Individual JSON files
- ✅ Character Management - Single/multiple characters
- ✅ Avatar Support - Image upload and processing

### v1.0.0 (2026-03-11) - Initial Release
- ✅ Model download and management
- ✅ Chat with streaming responses
- ✅ Basic UI components

## License

MIT
