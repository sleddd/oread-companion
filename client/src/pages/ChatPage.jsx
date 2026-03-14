import { useEffect, useState, useRef } from 'react';
import useStore from '../store/useStore';
import ChatInterface from '../components/chat/ChatInterface';
import AutoUpdateSuggestions from '../components/chat/AutoUpdateSuggestions';

// Default avatar
const DEFAULT_AVATAR = '/echo.svg';

export default function ChatPage() {
  // Local state for mobile sidebar collapse
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Ref to track if we've already attempted to create a session
  const sessionCreationAttempted = useRef(false);

  // Ref to track the last loaded session ID
  const lastLoadedSessionId = useRef(null);

  // Get state and actions from Zustand store
  const messages = useStore((state) => state.messages);
  const selectedModel = useStore((state) => state.selectedModel);
  const isSending = useStore((state) => state.isSending);
  const sendMessage = useStore((state) => state.sendMessage);
  const settings = useStore((state) => state.settings);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const createSession = useStore((state) => state.createSession);
  const loadMessageHistory = useStore((state) => state.loadMessageHistory);

  // Load messages when session changes
  useEffect(() => {
    // If session changed and we have a session ID, reload messages
    if (currentSessionId && currentSessionId !== lastLoadedSessionId.current) {
      lastLoadedSessionId.current = currentSessionId;
      loadMessageHistory(currentSessionId);
    }
  }, [currentSessionId, loadMessageHistory]);

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
        : 'Utility Session';

      createSession(sessionName, settings);
    }
    // Only depend on currentSessionId - don't re-run when settings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  const handleSendMessage = (content) => {
    sendMessage(content, selectedModel);
  };

  // Get character info from settings (always use main character if configured)
  // Priority: Single Character > First Multiple Character > Default
  const singleCharacter = settings.roleplay?.singleCharacter;
  const multipleCharacters = settings.roleplay?.multipleCharacters || [];
  const mainCharacter = settings.roleplay?.characterMode === 'single'
    ? singleCharacter
    : multipleCharacters[0]; // Use first character from multiple mode

  const characterName = mainCharacter?.identity?.name || 'Oread Assistant';
  const characterAvatar = mainCharacter?.appearance?.avatarImage || DEFAULT_AVATAR;

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

        {/* TODO: Add music options
        <div className="chat-page__track-selector">
          <label>Select a track</label>
          <select defaultValue="model-ambient">
            <option value="model-ambient">Model Ambient</option>
            <option value="background-ambient">Background Ambient</option>
            <option value="nature-sounds">Nature Sounds</option>
            <option value="cafe-ambient">Cafe Ambient</option>
          </select>
        </div>
        */}
      </div>

      <div className="chat-page__main-area">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isSending}
          selectedModel={selectedModel}
        />
      </div>

      {/* Auto-Update Suggestions Modal */}
      <AutoUpdateSuggestions />
    </div>
  );
}
