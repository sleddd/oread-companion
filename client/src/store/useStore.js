import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '../data/defaultSettings';
import { loadTemplates } from '../data/templates';
import { buildSystemPrompt, detectModeToggle } from '../utils/promptBuilder';
import { saveSettings as saveSettingsAPI, loadSettings as loadSettingsAPI } from '../utils/settingsAPI';
import { saveUserTemplate as saveUserTemplateAPI, deleteUserTemplate as deleteUserTemplateAPI } from '../utils/templateAPI';
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
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }

    // Debounced save to backend (1 second delay)
    if (saveTimeoutRef) {
      clearTimeout(saveTimeoutRef);
    }

    saveTimeoutRef = setTimeout(async () => {
      try {
        const result = await saveSettingsAPI(newSettings);
        if (result.success) {
          set({ isSavingSettings: false, lastSaved: new Date() });

          // Keep the in-memory templates list in sync when editing a user world
          const tid = newSettings.meta?.templateId;
          if (tid && newSettings.meta?.isUserTemplate) {
            const templates = get().templates;
            set({
              templates: templates.map(t =>
                t.id === tid ? { ...t, settings: newSettings } : t
              )
            });
          }
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
      }

      // Then try backend API (authoritative — always overrides localStorage)
      const result = await loadSettingsAPI();
      if (result.success && result.settings) {
        set({ settings: result.settings });
        // Keep localStorage in sync with backend (clears stale old-format data)
        try {
          localStorage.setItem('ollama-chat-settings', JSON.stringify(result.settings));
        } catch (_) {}
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  // Load inline character data for prompt building
  loadCharactersForPrompt: (settings) => {
    const settingsCopy = { ...settings };

    if (settings.roleplay.characterMode === 'single') {
      settingsCopy.roleplay = {
        ...settingsCopy.roleplay,
        _loadedCharacters: settings.roleplay.character
          ? [settings.roleplay.character]
          : [{ name: 'Assistant', role: '', knowledgeSkills: '', hobbiesInterests: '',
               thingsToAvoid: '', backstory: '', inventory: '', traits: {} }]
      };
    }

    if (settings.roleplay.characterMode === 'multi' && settings.roleplay.characters?.length > 0) {
      const chars = [...settings.roleplay.characters];
      const activeIdx = settings.roleplay.activeCharacterIndex || 0;
      // Put active character first so promptBuilder uses it as the main character
      if (activeIdx > 0 && activeIdx < chars.length) {
        const [active] = chars.splice(activeIdx, 1);
        chars.unshift(active);
      }
      settingsCopy.roleplay = {
        ...settingsCopy.roleplay,
        _loadedCharacters: chars
      };
    }

    return settingsCopy;
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

    // Build system prompt — include opening scene only on first message of session
    const isFirstMessage = state.messages.length === 0;
    const systemPrompt = buildSystemPrompt(settingsWithCharacters, modeForThisMessage, isFirstMessage);
    console.log('[System Prompt]', systemPrompt);

    // Determine model (dropdown selection wins, fall back to settings default)
    const modelToUse = selectedModel || state.settings.general.selectedModel;

    try {
      const chatPayload = {
        model: modelToUse,
        messages: conversationHistory
          .map(m => ({ role: m.role, content: m.content }))
          .filter(m => m.content !== ''),
        systemPrompt: systemPrompt,
        temperature: state.settings.general.temperature,
        topP: state.settings.general.topP,
        frequencyPenalty: state.settings.general.frequencyPenalty,
        maxTokens: state.settings.general.maxTokens,
        sessionId: state.currentSessionId,
        settings: state.settings
      };
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify(chatPayload)
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('❌ /api/chat error:', JSON.stringify(errBody, null, 2));
        set({ isSending: false });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = { role: 'assistant', content: '', timestamp: new Date() };
      let assistantMessageAdded = false;

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

            // Handle metadata events (message IDs for pinning)
            if (data.meta === 'user_saved') {
              set((state) => {
                const newMessages = [...state.messages];
                // Find the last user message and assign its ID
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  if (newMessages[i].role === 'user' && !newMessages[i].id) {
                    newMessages[i] = { ...newMessages[i], id: data.messageId };
                    break;
                  }
                }
                return { messages: newMessages };
              });
              continue;
            }

            if (data.meta === 'assistant_saved') {
              set((state) => {
                const newMessages = [...state.messages];
                // Assign ID to the assistant message (last)
                const lastIdx = newMessages.length - 1;
                if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
                  newMessages[lastIdx] = { ...newMessages[lastIdx], id: data.messageId };
                }
                return { messages: newMessages };
              });
              continue;
            }

            if (data.message && data.message.content) {
              assistantMessage.content += data.message.content;
              if (!assistantMessageAdded) {
                // Add the assistant bubble only once we have content
                assistantMessageAdded = true;
                set((state) => ({
                  messages: [...state.messages, { ...assistantMessage }]
                }));
              } else {
                set((state) => {
                  const newMessages = [...state.messages];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return { messages: newMessages };
                });
              }
            }
          }
        }
      }
    } catch (error) {
      // Remove any trailing empty assistant placeholder left by a failed send
      set((state) => ({
        messages: state.messages.filter(m => m.content !== '')
      }));
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
        set({ models: data.models });

        // Auto-select first model if none selected
        const state = get();
        const firstModel = data.models.length > 0 ? data.models[0].name : null;
        if (!state.selectedModel && firstModel) {
          set({ selectedModel: firstModel });
        }
        // Also set in settings if no model configured there
        if (!state.settings.general.selectedModel && firstModel) {
          state.setSettings({
            ...state.settings,
            general: { ...state.settings.general, selectedModel: firstModel }
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  },

  // Download model
  downloadModel: async (modelName) => {
    // Normalize HuggingFace URLs to the hf.co shorthand Ollama expects
    let normalizedName = modelName.trim();

    // Handle direct GGUF file URLs:
    // https://huggingface.co/user/repo/resolve/main/file.gguf?download=true
    // → hf.co/user/repo:file (without .gguf)
    const resolveMatch = normalizedName.match(
      /(?:https?:\/\/)?(?:huggingface\.co|hf\.co)\/([^/]+)\/([^/]+)\/resolve\/[^/]+\/([^/?#]+\.gguf)/i
    );
    if (resolveMatch) {
      const [, user, repo, filename] = resolveMatch;
      const tag = filename.replace(/\.gguf$/i, '');
      normalizedName = `hf.co/${user}/${repo}:${tag}`;
    } else {
      normalizedName = normalizedName
        .replace(/^https?:\/\//, '')
        .replace(/^huggingface\.co\//, 'hf.co/');
    }

    set({
      isDownloading: true,
      downloadProgress: { progress: 0, status: 'Starting download...', message: '' }
    });

    try {
      const response = await apiFetch('/api/models/pull', {
        method: 'POST',
        body: JSON.stringify({ modelName: normalizedName })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(err.error || err.details?.[0]?.message || `HTTP ${response.status}`);
      }

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
              set({
                isDownloading: false,
                downloadProgress: { progress: 0, status: `Error: ${data.error}`, message: '' }
              });
              return;
            }

            if (data.completed) {
              // Keep isDownloading true so the progress bar stays visible during the delay
              set({ downloadProgress: { progress: 100, status: 'Complete!', message: '' } });
              get().fetchModels();
              setTimeout(() => {
                set({ isDownloading: false, downloadProgress: { progress: 0, status: '', message: '' } });
              }, 2000);
              return;
            }

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

      // Stream ended without a completed event — reset state
      set({ isDownloading: false, downloadProgress: { progress: 0, status: '', message: '' } });
    } catch (error) {
      set({
        isDownloading: false,
        downloadProgress: { progress: 0, status: `Error: ${error.message}`, message: '' }
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
        body: JSON.stringify({
          name,
          mode: settings?.mode || 'normal',
          character_name: settings?.roleplay?.character?.name || null,
          character_mode: settings?.roleplay?.characterMode || 'single',
          settings_snapshot: settings || null
        })
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

        // Load message history and story notes
        await get().loadMessageHistory(sessionId);
        await get().loadStoryNotes(sessionId);
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
          id: m.id,
          role: m.role,
          content: m.content,
          pinned: !!m.pinned,
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
  // PIN MESSAGE
  // ==========================================
  togglePinMessage: async (messageId) => {
    const state = get();
    const sessionId = state.currentSessionId;
    if (!sessionId || !messageId) return;

    // Find the message and its current pinned state
    const msgIndex = state.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const newPinned = !state.messages[msgIndex].pinned;

    // Optimistic update
    set((s) => {
      const newMessages = [...s.messages];
      newMessages[msgIndex] = { ...newMessages[msgIndex], pinned: newPinned };
      return { messages: newMessages };
    });

    try {
      const response = await apiFetch(`/api/sessions/${sessionId}/messages/${messageId}/pin`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: newPinned })
      });
      const data = await response.json();
      if (!data.success) {
        // Revert on failure
        set((s) => {
          const newMessages = [...s.messages];
          newMessages[msgIndex] = { ...newMessages[msgIndex], pinned: !newPinned };
          return { messages: newMessages };
        });
      }
    } catch (error) {
      // Revert on failure
      set((s) => {
        const newMessages = [...s.messages];
        newMessages[msgIndex] = { ...newMessages[msgIndex], pinned: !newPinned };
        return { messages: newMessages };
      });
      console.error('Failed to toggle pin:', error);
    }
  },

  // ==========================================
  // STORY NOTES
  // ==========================================
  storyNotes: '',

  loadStoryNotes: async (sessionId) => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/notes`);
      const data = await response.json();
      if (data.success) {
        set({ storyNotes: data.notes || '' });
      }
    } catch (error) {
      console.error('Failed to load story notes:', error);
    }
  },

  saveStoryNotes: async (sessionId, notes) => {
    if (!sessionId) return;
    set({ storyNotes: notes });
    try {
      await apiFetch(`/api/sessions/${sessionId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes })
      });
    } catch (error) {
      console.error('Failed to save story notes:', error);
    }
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
  // TEMPLATES
  // ==========================================
  saveAsTemplate: async (name, description) => {
    try {
      const settings = get().settings;
      const result = await saveUserTemplateAPI(name, description, settings);
      await get().fetchTemplates();

      // Link active settings to the newly created world so future edits propagate
      if (result.template?.id) {
        get().setSettings({
          ...get().settings,
          meta: {
            ...get().settings.meta,
            templateId: result.template.id,
            isUserTemplate: true,
            lastModified: new Date().toISOString()
          }
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to save template:', error);
      return { success: false, error: error.message };
    }
  },

  deleteTemplate: async (id) => {
    try {
      await deleteUserTemplateAPI(id);
      await get().fetchTemplates();
      return { success: true };
    } catch (error) {
      console.error('Failed to delete template:', error);
      return { success: false, error: error.message };
    }
  },

  fetchTemplates: async () => {
    try {
      const templates = await loadTemplates();
      set({ templates });

      // Auto-apply default assistant template if no template is set (first-time UX)
      if (!get().settings.meta?.templateId && get().settings.mode === 'normal') {
        const assistantTemplate = templates.find(t => t.id === 'expert-tutor');
        if (assistantTemplate) {
          get().setSettings({
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
  },

  // ==========================================
  // INITIALIZATION
  // ==========================================
  initialize: async () => {
    const store = get();
    await store.loadSettings();
    await store.fetchTemplates();
    await store.checkHealth();
    await store.fetchModels();
    await store.loadSessions();
  }
}));

export default useStore;
