export default function ChatBubble({ message, role, timestamp, id, pinned, onTogglePin }) {
  const classes = [
    'chat-bubble',
    `chat-bubble--${role}`,
    pinned ? 'chat-bubble--pinned' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="chat-bubble__content">{message}</div>
      <div className="chat-bubble__footer">
        {timestamp && (
          <div className="chat-bubble__timestamp">
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
        {id && onTogglePin && (
          <button
            className={`chat-bubble__pin ${pinned ? 'chat-bubble__pin--active' : ''}`}
            onClick={() => onTogglePin(id)}
            title={pinned ? 'Unpin message' : 'Pin message'}
            aria-label={pinned ? 'Unpin message' : 'Pin message'}
          >
            {pinned ? '📌' : '📌'}
          </button>
        )}
      </div>
    </div>
  );
}
