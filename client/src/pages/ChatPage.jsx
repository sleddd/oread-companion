import { useEffect, useState, useRef, useCallback } from 'react';
import useStore from '../store/useStore';
import ChatInterface from '../components/chat/ChatInterface';

// Default avatar
const DEFAULT_AVATAR = '/echo.svg';

export default function ChatPage() {
  // Local state for mobile sidebar collapse
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Ref to track if we've already attempted to create a session
  const sessionCreationAttempted = useRef(false);

  // Ref to track the last loaded session ID
  const lastLoadedSessionId = useRef(null);

  // Story notes panel
  const [showStoryNotes, setShowStoryNotes] = useState(false);
  const storyNotesSaveRef = useRef(null);

  // Get state and actions from Zustand store
  const messages = useStore((state) => state.messages);
  const selectedModel = useStore((state) => state.selectedModel);
  const isSending = useStore((state) => state.isSending);
  const sendMessage = useStore((state) => state.sendMessage);
  const settings = useStore((state) => state.settings);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const createSession = useStore((state) => state.createSession);
  const loadMessageHistory = useStore((state) => state.loadMessageHistory);
  const storyNotes = useStore((state) => state.storyNotes);
  const saveStoryNotes = useStore((state) => state.saveStoryNotes);
  const loadStoryNotes = useStore((state) => state.loadStoryNotes);

  // Load messages and story notes when session changes
  useEffect(() => {
    if (currentSessionId && currentSessionId !== lastLoadedSessionId.current) {
      // Flush any pending story notes save for the previous session
      if (storyNotesSaveRef.current) {
        clearTimeout(storyNotesSaveRef.current);
        storyNotesSaveRef.current = null;
        // Save immediately to the OLD session before switching
        const prevSessionId = lastLoadedSessionId.current;
        const pendingNotes = useStore.getState().storyNotes;
        if (prevSessionId && pendingNotes) {
          saveStoryNotes(prevSessionId, pendingNotes);
        }
      }

      lastLoadedSessionId.current = currentSessionId;
      loadMessageHistory(currentSessionId);
      loadStoryNotes(currentSessionId);
    }
  }, [currentSessionId, loadMessageHistory, loadStoryNotes, saveStoryNotes]);

  // Auto-create session on first message if none exists
  useEffect(() => {
    // Only create if we have NO session and NO messages
    // Wait for settings to be loaded (check if meta.lastModified exists - indicates loaded from storage)
    // Don't create if we've already attempted to create a session
    const settingsLoaded = settings.meta?.lastModified !== null || settings.meta?.templateId !== null;

    if (!currentSessionId && messages.length === 0 && settingsLoaded && !sessionCreationAttempted.current) {
      sessionCreationAttempted.current = true;

      // Create default session based on current mode
      const mode = settings.mode;
      const characterName = mode === 'roleplay'
        ? settings.roleplay?.singleCharacter?.identity?.name
        : null;
      const sessionName = mode === 'roleplay'
        ? `Chat with ${characterName || 'Character'}`
        : 'New Chat';

      createSession(sessionName, settings);
    }
    // Only depend on currentSessionId - don't re-run when settings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  const handleSendMessage = (content) => {
    sendMessage(content, selectedModel);
  };

  const handleStoryNotesChange = useCallback((e) => {
    const notes = e.target.value;
    // Capture session ID at the moment the user types, not when the debounce fires
    const targetSessionId = currentSessionId;

    // Update local state immediately via store
    useStore.setState({ storyNotes: notes });

    // Debounced save to backend
    if (storyNotesSaveRef.current) {
      clearTimeout(storyNotesSaveRef.current);
    }
    storyNotesSaveRef.current = setTimeout(() => {
      if (targetSessionId) {
        saveStoryNotes(targetSessionId, notes);
      }
      storyNotesSaveRef.current = null;
    }, 1000);
  }, [currentSessionId, saveStoryNotes]);

  // Get character info from settings (always use main character if configured)
  // Priority: Single Character > Active Multiple Character > Default
  const singleCharacter = settings.roleplay?.character;
  const multipleCharacters = settings.roleplay?.characters || [];
  const activeCharacterIndex = settings.roleplay?.activeCharacterIndex || 0;
  const isMultiMode = settings.roleplay?.characterMode === 'multi';

  const mainCharacter = isMultiMode
    ? multipleCharacters[activeCharacterIndex] || multipleCharacters[0]
    : singleCharacter;

  const supportingCharacters = isMultiMode
    ? multipleCharacters.filter((_, i) => i !== activeCharacterIndex)
    : [];

  const characterName = mainCharacter?.name || 'Oread Assistant';
  const characterAvatar = mainCharacter?.avatarImage || DEFAULT_AVATAR;

  return (
    <div className="chat-page">
      {/* Mobile sidebar toggle bar */}
      <div className="chat-page__mobile-header">
        <button
          className="chat-page__mobile-toggle"
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="chat-page__mobile-avatar">
            <img src={characterAvatar} alt={characterName} />
          </span>
          <span className="chat-page__mobile-character-name">{characterName}</span>
          <span className="chat-page__mobile-icon">
            {isSidebarCollapsed ? '▼' : '▲'}
          </span>
        </button>
      </div>

      {/* Collapsible sidebar content on mobile */}
      <div className={`chat-page__sidebar ${isSidebarCollapsed ? 'chat-page__sidebar--collapsed' : 'chat-page__sidebar--expanded'}`}>
        <div className="chat-page__avatar">
          <img src={characterAvatar} alt={characterName} />
        </div>
        <div className="chat-page__character-name">{characterName}</div>

        {supportingCharacters.length > 0 && (
          <div className="chat-page__supporting-characters">
            {supportingCharacters.map((char, i) => (
              <div key={char?.name || i} className="chat-page__supporting-character">
                <div className="chat-page__supporting-avatar">
                  <img
                    src={char?.avatarImage || DEFAULT_AVATAR}
                    alt={char?.name || 'Character'}
                  />
                </div>
                <span className="chat-page__supporting-name">
                  {char?.name || 'Unnamed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chat-page__main-area">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isSending}
          selectedModel={selectedModel}
        />
      </div>

      {/* Story Notes Panel */}
      {currentSessionId && (
        <div className={`chat-page__story-notes ${showStoryNotes ? 'chat-page__story-notes--open' : ''}`}>
          <button
            className="chat-page__story-notes-toggle"
            onClick={() => setShowStoryNotes(!showStoryNotes)}
          >
            {showStoryNotes ? '▶' : '◀'} Story Notes
          </button>
          {showStoryNotes && (
            <div className="chat-page__story-notes-content">
              <textarea
                className="chat-page__story-notes-textarea"
                value={storyNotes}
                onChange={handleStoryNotesChange}
                placeholder="Write notes about this session... These will be included in the AI's context to help maintain continuity."
                maxLength={10000}
              />
              <div className="chat-page__story-notes-count">
                {storyNotes.length} / 10000
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
