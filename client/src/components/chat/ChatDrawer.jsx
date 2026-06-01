import { useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import styles from './ChatDrawer.module.scss';

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffHours = Math.floor((now - date) / (1000 * 60 * 60));

  if (diffHours < 24) {
    return diffHours === 0 ? 'Just now' : `${diffHours}h ago`;
  } else {
    const diffDays = Math.floor(diffHours / 24);
    return diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`;
  }
};

export default function ChatDrawer({ isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [showNewChatForm, setShowNewChatForm] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const searchRef = useRef(null);
  const newChatRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const chatSessions = useStore((s) => s.chatSessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const selectSession = useStore((s) => s.selectSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const createSession = useStore((s) => s.createSession);
  const settings = useStore((s) => s.settings);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const loadSessions = useStore((s) => s.loadSessions);

  // Measure header height and load sessions when drawer opens
  useEffect(() => {
    if (isOpen) {
      const headerEl = document.querySelector('.header');
      if (headerEl) {
        setHeaderHeight(headerEl.offsetHeight);
      }
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  // Auto-focus search and handle Escape
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 100);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          if (showDeleteConfirm) {
            setShowDeleteConfirm(false);
            setChatToDelete(null);
          } else {
            onClose();
          }
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose, showDeleteConfirm]);

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setNewChatName('');
      setShowNewChatForm(false);
    }
  }, [isOpen]);

  const filteredSessions = chatSessions.filter((session) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.name?.toLowerCase().includes(query) ||
      session.character_name?.toLowerCase().includes(query)
    );
  });

  const getDefaultChatName = () => {
    const mode = settings?.mode;
    const characterName = mode === 'roleplay'
      ? settings?.roleplay?.character?.name || settings?.roleplay?.singleCharacter?.identity?.name
      : null;
    return characterName ? `Chat with ${characterName}` : 'New Chat';
  };

  const handleNewChatClick = () => {
    setShowNewChatForm(true);
    setTimeout(() => newChatRef.current?.focus(), 50);
  };

  const handleCreateChat = async () => {
    const name = newChatName.trim() || getDefaultChatName();
    await createSession(name, settings);
    setNewChatName('');
    setShowNewChatForm(false);
    setCurrentPage('chat');
    onClose();
  };

  const handleCancelNewChat = () => {
    setNewChatName('');
    setShowNewChatForm(false);
  };

  const handleChatClick = (sessionId) => {
    selectSession(sessionId);
    setCurrentPage('chat');
    onClose();
  };

  const handleDeleteClick = (e, sessionId) => {
    e.stopPropagation();
    setChatToDelete(sessionId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (chatToDelete) {
      await deleteSession(chatToDelete);
      setShowDeleteConfirm(false);
      setChatToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setChatToDelete(null);
  };

  if (!isOpen && !showDeleteConfirm) return null;

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.open : ''}`}
        style={{ '--header-height': `${headerHeight}px` }}
        onClick={onClose}
      />
      <div
        className={`${styles.drawer} ${isOpen ? styles.open : ''}`}
        style={{ '--header-height': `${headerHeight}px` }}
      >
        <div className={styles.header}>
          <h3>Chats</h3>
          <div className={styles.headerActions}>
            <button className={styles.newChatButton} onClick={handleNewChatClick}>
              + New Chat
            </button>
            <button className={styles.closeButton} onClick={onClose} title="Close">
              ×
            </button>
          </div>
        </div>

        <div className={styles.search}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {showNewChatForm && (
          <div className={styles.newChatForm}>
            <input
              ref={newChatRef}
              type="text"
              placeholder={getDefaultChatName()}
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateChat();
                if (e.key === 'Escape') handleCancelNewChat();
              }}
            />
            <div className={styles.newChatFormActions}>
              <button className={styles.createButton} onClick={handleCreateChat}>
                Create
              </button>
              <button className={styles.cancelButton} onClick={handleCancelNewChat}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className={styles.chatList}>
          {filteredSessions.length === 0 ? (
            <div className={styles.empty}>
              {searchQuery ? 'No chats match your search.' : 'No chats yet.'}
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.id}
                className={`${styles.chatCard} ${
                  currentSessionId === session.id ? styles.active : ''
                }`}
                onClick={() => handleChatClick(session.id)}
              >
                <div className={styles.chatInfo}>
                  <div className={styles.chatName}>{session.name}</div>
                  <div className={styles.chatMeta}>
                    {session.character_name && (
                      <span className={styles.character}>
                        {session.character_name}
                      </span>
                    )}
                    <span className={styles.mode}>
                      {session.mode === 'roleplay' ? '🎭' : '🛠️'}
                    </span>
                    <span className={styles.messageCount}>
                      {session.message_count || 0} msgs
                    </span>
                    <span className={styles.time}>
                      {formatDate(session.updated_at)}
                    </span>
                  </div>
                </div>

                <button
                  className={styles.deleteButton}
                  onClick={(e) => handleDeleteClick(e, session.id)}
                  title="Delete chat"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className={styles.modal} onClick={handleCancelDelete}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Delete Chat</h3>
            <p>Are you sure you want to delete this chat? This action cannot be undone.</p>
            <div className={styles.modalButtons}>
              <button onClick={handleCancelDelete}>Cancel</button>
              <button
                onClick={handleConfirmDelete}
                className={styles.dangerButton}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
