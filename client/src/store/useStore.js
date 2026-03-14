import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '../data/defaultSettings';
import { loadTemplates } from '../data/templates';
import { buildSystemPrompt, detectModeToggle } from '../utils/promptBuilder';
import { saveSettings as saveSettingsAPI, loadSettings as loadSettingsAPI } from '../utils/settingsAPI';
import { apiFetch } from '../utils/apiClient';

// Debounce timeout reference
let saveTimeoutRef = null;

const useStore = create((set, get) => ({
  // ==========================================
  // SETTINGS STATE
  // ==========================================
  settings: DEFAULT_SETTINGS,
  isSavingSettings: false,
  lastSaved: null,

  // Set settings (with auto-save)
  setSettings: (newSettings) => {
    set({ settings: newSettings, isSavingSettings: true });

    // Immediate save to localStorage
    try {
      localStorage.setItem('ollama-chat-settings', JSON.stringify(newSettings));
      console.log('✅ Settings saved to localStorage');
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }

    // Debounced save to backend (1 second delay)
    if (saveTimeoutRef) {
      clearTimeout(saveTimeoutRef);
    }

    saveTimeoutRef = setTimeout(async () => {
      try {
        console.log('💾 Saving settings to backend...');
        const result = await saveSettingsAPI(newSettings);
        if (result.success) {
          console.log('✅ Settings saved to backend successfully');
          set({ isSavingSettings: false, lastSaved: new Date() });
        } else {
          console.error('❌ Failed to save settings to backend:', result.error);
          set({ isSavingSettings: false });
        }
      } catch (error) {
        console.error('❌ Failed to save settings to backend:', error);
        set({ isSavingSettings: false });
      }
    }, 1000);
  },

  // Load settings from localStorage or backend
  loadSettings: async () => {
    try {
      // Try localStorage first (instant)
      const localSettings = localStorage.getItem('ollama-chat-settings');
      if (localSettings) {
        const parsed = JSON.parse(localSettings);
        set({ settings: parsed });
        console.log('✅ Settings loaded from localStorage');
      }

      // Then try backend API (may override if newer)
      const result = await loadSettingsAPI();
      if (result.success && result.settings) {
        set({ settings: result.settings });
        console.log('✅ Settings loaded from backend API');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  // Load characters from files for prompt building
  loadCharactersForPrompt: async (settings) => {
    try {
      const { getCharacter } = await import('../utils/characterAPI.js');
      const { characterFileToSettings } = await import('../utils/characterConverter.js');

      const settingsCopy = { ...settings };

      // Load single character
      if (settings.roleplay.characterMode === 'single' && settings.roleplay.singleCharacterRef) {
        const charFile = await getCharacter(settings.roleplay.singleCharacterRef);
        if (charFile) {
          const charData = characterFileToSettings(charFile);
          settingsCopy.roleplay = {
            ...settingsCopy.roleplay,
            _loadedCharacters: [charData]
          };
        } else {
          console.warn(`⚠️ Character "${settings.roleplay.singleCharacterRef}" not found. Prompt will use character reference name only.`);
          // Fallback: create minimal character with just the name
          settingsCopy.roleplay = {
            ...settingsCopy.roleplay,
            _loadedCharacters: [{
              name: settings.roleplay.singleCharacterRef || 'Assistant',
              role: '',
              knowledgeSkills: '',
              hobbiesInterests: '',
              thingsToAvoid: '',
              backstory: '',
              inventory: '',
              traits: {}
            }]
          };
        }
      }

      // Load multiple characters
      if (settings.roleplay.characterMode === 'multi' && settings.roleplay.multipleCharacterRefs?.length > 0) {
        const loadedChars = [];
        for (const charRef of settings.roleplay.multipleCharacterRefs) {
          const charFile = await getCharacter(charRef);
          if (charFile) {
            const charData = characterFileToSettings(charFile);
            loadedChars.push(charData);
          } else {
            console.warn(`⚠️ Character "${charRef}" not found. Skipping.`);
            // Add minimal fallback character
            loadedChars.push({
              name: charRef,
              role: '',
              knowledgeSkills: '',
              hobbiesInterests: '',
              thingsToAvoid: '',
              backstory: '',
              inventory: '',
              traits: {}
            });
          }
        }
        settingsCopy.roleplay = {
          ...settingsCopy.roleplay,
          _loadedCharacters: loadedChars
        };
      }

      return settingsCopy;
    } catch (error) {
      console.error('Failed to load characters for prompt:', error);
      return settings;
    }
  },

  // ==========================================
  // CHAT STATE
  // ==========================================
  messages: [],
  isSending: false,
  activeMode: null, // For /chat and /play command overrides

  setMessages: (messages) => set({ messages }),
  setIsSending: (isSending) => set({ isSending }),
  setActiveMode: (mode) => set({ activeMode: mode }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),

  updateLastMessage: (content) => set((state) => {
    const newMessages = [...state.messages];
    if (newMessages.length > 0) {
      newMessages[newMessages.length - 1] = {
        ...newMessages[newMessages.length - 1],
        content
      };
    }
    return { messages: newMessages };
  }),

  clearMessages: () => set({ messages: [] }),

  // Send message action
  sendMessage: async (content, selectedModel) => {
    const state = get();
    if (!selectedModel || state.isSending) return;

    // Detect /chat and /play commands
    const { command, cleanMessage, targetMode } = detectModeToggle(content);

    // Determine which mode to use for this message
    let modeForThisMessage = state.activeMode || state.settings.mode;
    if (targetMode) {
      modeForThisMessage = targetMode;
      set({ activeMode: targetMode });
    }

    // Use clean message (without command) or original
    const actualMessage = cleanMessage || content;

    const userMessage = { role: 'user', content: actualMessage, timestamp: new Date() };
    set((state) => ({
      messages: [...state.messages, userMessage],
      isSending: true
    }));

    const conversationHistory = [...state.messages, userMessage];

    // Load characters from files before building system prompt
    const settingsWithCharacters = await state.loadCharactersForPrompt(state.settings);

    // Build system prompt using settings and current mode
    const systemPrompt = buildSystemPrompt(settingsWithCharacters, modeForThisMessage);

    // Log system prompt for debugging
    console.log('📋 System Prompt Generated:');
    console.log('━'.repeat(50));
    console.log(systemPrompt);
    console.log('━'.repeat(50));
    console.log('Mode:', modeForThisMessage);
    console.log('Temperature:', state.settings.general.temperature);
    console.log('Top P:', state.settings.general.topP);
    console.log('Max Tokens:', state.settings.general.maxTokens);

    // Determine model (use settings default if set, otherwise use selected model)
    const modelToUse = state.settings.general.selectedModel || selectedModel;

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: modelToUse,
          messages: conversationHistory.map(m => ({ role: m.role, content: m.content })),
          systemPrompt: systemPrompt,
          temperature: state.settings.general.temperature,
          topP: state.settings.general.topP,
          maxTokens: state.settings.general.maxTokens,
          sessionId: state.currentSessionId,
          settings: state.settings
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = { role: 'assistant', content: '', timestamp: new Date() };
      set((state) => ({
        messages: [...state.messages, assistantMessage]
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.error) {
              alert(`Chat error: ${data.error}`);
              break;
            }

            if (data.message && data.message.content) {
              assistantMessage.content += data.message.content;
              set((state) => {
                const newMessages = [...state.messages];
                newMessages[newMessages.length - 1] = { ...assistantMessage };
                return { messages: newMessages };
              });
            }
          }
        }
      }
    } catch (error) {
      alert(`Chat failed: ${error.message}`);
    } finally {
      set({ isSending: false });
    }
  },

  // ==========================================
  // MODEL STATE
  // ==========================================
  models: [],
  selectedModel: null,
  isDownloading: false,
  downloadProgress: { progress: 0, status: '', message: '' },

  setModels: (models) => set({ models }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setIsDownloading: (isDownloading) => set({ isDownloading }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),

  // Fetch models from backend
  fetchModels: async () => {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();

      if (data.success) {
        // Filter out embedding models (nomic-embed-text and other embedding-only models)
        const chatModels = data.models.filter(model => {
          const modelName = model.name.toLowerCase();
          // Exclude models that are specifically embedding models
          // nomic-embed-text is used for RAG embeddings only, not chat
          const isEmbeddingModel =
            modelName.includes('nomic-embed') ||
            modelName.includes('all-minilm') ||
            modelName.includes('bge-') ||
            modelName === 'mxbai-embed-large' ||
            (modelName.includes('embed') && !modelName.includes('llama') && !modelName.includes('mistral'));

          return !isEmbeddingModel;
        });

        set({ models: chatModels });

        // Auto-select first model if none selected
        const state = get();
        if (!state.selectedModel && chatModels.length > 0) {
          set({ selectedModel: chatModels[0].name });
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  },

  // Download model
  downloadModel: async (modelName) => {
    set({
      isDownloading: true,
      downloadProgress: { progress: 0, status: 'Starting download...', message: '' }
    });

    try {
      const response = await apiFetch('/api/models/pull', {
        method: 'POST',
        body: JSON.stringify({ modelName })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.error) {
              alert(`Download error: ${data.error}`);
              set({
                isDownloading: false,
                downloadProgress: { progress: 0, status: 'Failed', message: data.error }
              });
              return;
            }

            if (data.completed) {
              set({
                isDownloading: false,
                downloadProgress: { progress: 100, status: 'Complete!', message: '' }
              });
              // Refresh models list
              get().fetchModels();
              setTimeout(() => {
                set({ downloadProgress: { progress: 0, status: '', message: '' } });
              }, 2000);
              return;
            }

            // Update progress
            if (data.status) {
              const progress = data.total
                ? Math.round((data.completed / data.total) * 100)
                : 0;

              set({
                downloadProgress: {
                  progress,
                  status: data.status,
                  message: data.digest ? `Digest: ${data.digest.substring(0, 12)}...` : ''
                }
              });
            }
          }
        }
      }
    } catch (error) {
      alert(`Download failed: ${error.message}`);
      set({
        isDownloading: false,
        downloadProgress: { progress: 0, status: 'Failed', message: error.message }
      });
    }
  },

  // ==========================================
  // OLLAMA CONNECTION STATE
  // ==========================================
  ollamaStatus: 'checking',

  setOllamaStatus: (status) => set({ ollamaStatus: status }),

  checkHealth: async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      set({ ollamaStatus: data.status === 'ok' ? 'connected' : 'disconnected' });
    } catch (error) {
      set({ ollamaStatus: 'disconnected' });
    }
  },

  // ==========================================
  // SESSION MANAGEMENT STATE
  // ==========================================
  currentSessionId: null,
  currentSession: null,
  chatSessions: [],
  sessionsLoading: false,

  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  setSessionsLoading: (loading) => set({ sessionsLoading: loading }),

  // Create new session
  createSession: async (name, settings) => {
    try {
      const response = await apiFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ name, settings })
      });

      const data = await response.json();
      if (data.success) {
        set({
          currentSessionId: data.session.id,
          currentSession: data.session
        });
        //console.log('✅ Session created:', data.session.id);

        // Refresh session list immediately after creation
        await get().loadSessions();

        return data.session;
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  },

  // Load sessions list
  loadSessions: async (options = {}) => {
    set({ sessionsLoading: true });
    try {
      const { archived = false, limit = 50, offset = 0 } = options;
      const params = new URLSearchParams({ archived, limit, offset });

      const response = await fetch(`/api/sessions?${params}`);
      const data = await response.json();

      if (data.success) {
        set({ chatSessions: data.sessions, sessionsLoading: false });
        return data;
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      set({ sessionsLoading: false });
    }
  },

  // Select session
  selectSession: async (sessionId) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();

      if (data.success) {
        set({
          currentSessionId: sessionId,
          currentSession: data.session,
          messages: []  // Clear current messages
        });
        //console.log('✅ Session selected:', sessionId);

        // Load message history
        await get().loadMessageHistory(sessionId);
      }
    } catch (error) {
      console.error('Failed to select session:', error);
    }
  },

  // Delete session
  deleteSession: async (sessionId) => {
    try {
      const response = await apiFetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        // Clear current session if it was deleted
        set((state) => ({
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
          currentSession: state.currentSessionId === sessionId ? null : state.currentSession
        }));
        //console.log('✅ Session deleted:', sessionId);

        // Refresh session list immediately after deletion
        await get().loadSessions();
      }
    } catch (error) {
      //console.error('Failed to delete session:', error);
    }
  },

  // ==========================================
  // MESSAGE HISTORY STATE
  // ==========================================
  messageHistory: [],
  historyLoading: false,
  historyHasMore: true,
  historyOffset: 0,

  setMessageHistory: (history) => set({ messageHistory: history }),
  setHistoryLoading: (loading) => set({ historyLoading: loading }),
  setHistoryHasMore: (hasMore) => set({ historyHasMore: hasMore }),
  setHistoryOffset: (offset) => set({ historyOffset: offset }),

  // Load message history (paginated)
  loadMessageHistory: async (sessionId, loadMore = false) => {
    const state = get();
    if (state.historyLoading) return;

    set({ historyLoading: true });

    try {
      const offset = loadMore ? state.historyOffset : 0;
      const limit = 50;

      const params = new URLSearchParams({ limit, offset });
      const response = await fetch(`/api/sessions/${sessionId}/messages?${params}`);
      const data = await response.json();

      if (data.success) {
        const messages = data.messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp)
        }));

        set({
          messageHistory: loadMore ? [...messages, ...state.messageHistory] : messages,
          messages: loadMore ? state.messages : messages,
          historyLoading: false,
          historyHasMore: data.has_more,
          historyOffset: offset + messages.length
        });

        //console.log(`✅ Loaded ${messages.length} messages (offset: ${offset})`);
      }
    } catch (error) {
      //console.error('Failed to load message history:', error);
      set({ historyLoading: false });
    }
  },

  // ==========================================
  // RAG / VECTOR CONTEXT STATE
  // ==========================================
  vectorContext: [],
  contextLoading: false,

  setVectorContext: (context) => set({ vectorContext: context }),
  setContextLoading: (loading) => set({ contextLoading: loading }),

  // Load vector context for query
  loadVectorContext: async (sessionId, query) => {
    set({ contextLoading: true });

    try {
      const response = await apiFetch('/api/memory/search', {
        method: 'POST',
        body: JSON.stringify({ sessionId, query, topK: 5 })
      });

      const data = await response.json();
      if (data.success) {
        set({
          vectorContext: data.results || [],
          contextLoading: false
        });
        //console.log(`✅ Found ${data.results.length} relevant context items`);
      }
    } catch (error) {
      //console.error('Failed to load vector context:', error);
      set({ contextLoading: false });
    }
  },

  // ==========================================
  // AUTO-EXTRACTION STATE
  // ==========================================
  extractedSuggestions: null,
  extractionLoading: false,

  setExtractedSuggestions: (suggestions) => set({ extractedSuggestions: suggestions }),
  setExtractionLoading: (loading) => set({ extractionLoading: loading }),

  // Analyze for updates (trigger extraction)
  analyzeForUpdates: async (sessionId) => {
    const state = get();
    set({ extractionLoading: true });

    try {
      const response = await apiFetch(`/api/sessions/${sessionId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ settings: state.settings })
      });

      const data = await response.json();
      if (data.success && data.proposed_updates.length > 0) {
        set({
          extractedSuggestions: data.proposed_updates,
          extractionLoading: false
        });
        //console.log(`✅ Found ${data.proposed_updates.length} suggestions`);
      } else {
        set({ extractionLoading: false });
      }
    } catch (error) {
      //console.error('Failed to analyze for updates:', error);
      set({ extractionLoading: false });
    }
  },

  // Apply extracted updates to settings
  applyExtractedUpdates: (updates) => {
    const state = get();
    const updatedSettings = JSON.parse(JSON.stringify(state.settings)); // Deep clone

    for (const update of updates) {
      const { category, addition } = update;

      if (!updatedSettings.roleplay?.singleCharacter?.core) {
        continue;
      }

      const core = updatedSettings.roleplay.singleCharacter.core;

      switch (category) {
        case 'personality':
          core.personality = core.personality
            ? `${core.personality}; ${addition}`
            : addition;
          break;
        case 'backstory':
          core.backstory = core.backstory
            ? `${core.backstory}\n\n${addition}`
            : addition;
          break;
        case 'knowledge':
          core.knowledge = core.knowledge
            ? `${core.knowledge}; ${addition}`
            : addition;
          break;
      }
    }

    state.setSettings(updatedSettings);
    set({ extractedSuggestions: null });
    //console.log('✅ Applied extracted updates to settings');
  },

  // ==========================================
  // TEMPLATES STATE
  // ==========================================
  templates: [],

  // ==========================================
  // UI STATE
  // ==========================================
  currentPage: 'chat',

  setCurrentPage: (page) => set({ currentPage: page }),

  // ==========================================
  // INITIALIZATION
  // ==========================================
  initialize: async () => {
    const store = get();
    await store.loadSettings();

    // Load templates from backend
    try {
      const templates = await loadTemplates();
      set({ templates });
      console.log(`✅ Loaded ${templates.length} templates from backend`);

      // Auto-apply default assistant template if no template is set
      // (First-time user experience)
      if (!get().settings.meta.templateId && get().settings.mode === 'normal') {
        console.log('🎯 No template set - auto-applying default assistant template');
        const assistantTemplate = templates.find(t => t.id === 'expert-tutor');
        if (assistantTemplate) {
          store.setSettings({
            ...assistantTemplate.settings,
            meta: {
              ...assistantTemplate.settings.meta,
              templateId: assistantTemplate.id,
              lastModified: new Date().toISOString()
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to load templates:', error);
    }

    await store.checkHealth();
    await store.fetchModels();
    await store.loadSessions();
  }
}));

export default useStore;
