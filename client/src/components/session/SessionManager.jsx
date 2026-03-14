import { useState, useEffect } from 'react';
import useStore from '../../store/useStore';
import styles from './SessionManager.module.scss';

export default function SessionManager() {
  const [showModal, setShowModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);

  // Use individual selectors to avoid infinite loop
  const chatSessions = useStore((state) => state.chatSessions);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const sessionsLoading = useStore((state) => state.sessionsLoading);
  const settings = useStore((state) => state.settings);
  const loadSessions = useStore((state) => state.loadSessions);
  const selectSession = useStore((state) => state.selectSession);
  const createSession = useStore((state) => state.createSession);
  const deleteSession = useStore((state) => state.deleteSession);

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateSession = async () => {
    const mode = settings.mode;
    const characterName = mode === 'roleplay'
      ? settings.roleplay?.singleCharacterRef
      : null;

    // Use provided name or generate default based on mode and character
    const name = newSessionName.trim() || `${characterName || 'Utility'} Session`;

    await createSession(name, settings);
    setNewSessionName('');
    setShowModal(false);
  };

  const handleDeleteClick = (sessionId) => {
    setSessionToDelete(sessionId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (sessionToDelete) {
      await deleteSession(sessionToDelete);
      setShowDeleteConfirm(false);
      setSessionToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setSessionToDelete(null);
  };

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

  return (
    <div className={styles.sessionManager}>
      <div className={styles.header}>
        <h3>Sessions</h3>
        <button
          className={styles.newButton}
          onClick={() => setShowModal(true)}
        >
          + New
        </button>
      </div>

      {sessionsLoading ? (
        <div className={styles.loading}>Loading sessions...</div>
      ) : (
        <div className={styles.sessionList}>
          {chatSessions.length === 0 ? (
            <div className={styles.empty}>
              No sessions yet. Create one to get started!
            </div>
          ) : (
            chatSessions.map((session) => (
              <div
                key={session.id}
                className={`${styles.sessionCard} ${
                  currentSessionId === session.id ? styles.active : ''
                }`}
                onClick={() => selectSession(session.id)}
              >
                <div className={styles.sessionInfo}>
                  <div className={styles.sessionName}>{session.name}</div>
                  <div className={styles.sessionMeta}>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(session.id);
                  }}
                  title="Delete session"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && (
        <div className={styles.modal} onClick={() => setShowModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Create New Session</h3>
            <input
              type="text"
              className={styles.input}
              placeholder="Session name (optional)"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSession();
              }}
              autoFocus
            />
            <div className={styles.modalButtons}>
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button
                onClick={handleCreateSession}
                className={styles.primaryButton}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className={styles.modal} onClick={handleCancelDelete}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Delete Session</h3>
            <p>Are you sure you want to delete this session? This action cannot be undone.</p>
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
    </div>
  );
}
