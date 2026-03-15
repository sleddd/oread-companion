import { useEffect, useRef, useState } from 'react';
import useStore from '../../store/useStore';
import ChatBubble from './ChatBubble';
import styles from './MessageHistoryViewer.module.scss';

export default function MessageHistoryViewer() {
  const scrollRef = useRef(null);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [isNearTop, setIsNearTop] = useState(false);

  // Use individual selectors to avoid infinite loop
  const messages = useStore((state) => state.messages);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const historyLoading = useStore((state) => state.historyLoading);
  const historyHasMore = useStore((state) => state.historyHasMore);
  const loadMessageHistory = useStore((state) => state.loadMessageHistory);
  const togglePinMessage = useStore((state) => state.togglePinMessage);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current && !showJumpButton) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, showJumpButton]);

  // Detect scroll position
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const scrolledFromBottom = scrollHeight - scrollTop - clientHeight;

    // Show jump button if scrolled up more than 200px from bottom
    setShowJumpButton(scrolledFromBottom > 200);

    // Check if near top (for infinite scroll)
    const nearTop = scrollTop < 100;
    setIsNearTop(nearTop);

    // Load more messages when near top
    if (nearTop && !historyLoading && historyHasMore && currentSessionId) {
      loadMessageHistory(currentSessionId, true);
    }
  };

  const jumpToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setShowJumpButton(false);
    }
  };

  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        {currentSessionId
          ? 'No messages yet. Start the conversation!'
          : 'Select a session or start a new one to begin chatting.'}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div
        ref={scrollRef}
        className={styles.messageList}
        onScroll={handleScroll}
      >
        {/* Loading indicator at top */}
        {historyLoading && (
          <div className={styles.loadingTop}>
            <div className={styles.spinner}></div>
            <span>Loading more messages...</span>
          </div>
        )}

        {/* No more messages indicator */}
        {!historyHasMore && messages.length > 50 && (
          <div className={styles.noMore}>
            — Beginning of conversation —
          </div>
        )}

        {/* Messages */}
        {messages.map((message, index) => (
          <ChatBubble
            key={message.id || index}
            message={message.content}
            role={message.role}
            timestamp={message.timestamp}
            id={message.id}
            pinned={message.pinned}
            onTogglePin={togglePinMessage}
          />
        ))}
      </div>

      {/* Jump to bottom button */}
      {showJumpButton && (
        <button className={styles.jumpButton} onClick={jumpToBottom}>
          ↓ Jump to present
        </button>
      )}
    </div>
  );
}
