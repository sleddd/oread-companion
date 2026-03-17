import { useState, useCallback } from 'react';
import useStore from '../../store/useStore';
import styles from './WorldStatePanel.module.scss';

export default function WorldStatePanel() {
  const worldState = useStore((s) => s.worldState);
  const worldStateHistory = useStore((s) => s.worldStateHistory);
  const saveWorldState = useStore((s) => s.saveWorldState);
  const reextractWorldState = useStore((s) => s.reextractWorldState);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const mode = useStore((s) => s.settings.mode);

  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [reextracting, setReextracting] = useState(false);

  const isRoleplay = mode === 'roleplay';

  const hasState = worldState && (
    isRoleplay
      ? (worldState.currentTime || worldState.currentLocation ||
         worldState.presentCharacters?.length > 0 || worldState.ongoingEvents?.length > 0 ||
         worldState.mood || (worldState.knownCharacters && Object.keys(worldState.knownCharacters).length > 0) ||
         worldState.debates?.length > 0)
      : (worldState.currentFocus || worldState.openQuestions?.length > 0 ||
         worldState.decisions?.length > 0 || worldState.parkedItems?.length > 0 ||
         (worldState.knownEntities && Object.keys(worldState.knownEntities).length > 0) ||
         worldState.debates?.length > 0)
  );

  const startEdit = (field, value) => {
    setEditing(field);
    setEditValue(Array.isArray(value) ? value.join(', ') : (value || ''));
  };

  const saveEdit = useCallback(() => {
    if (!editing || !currentSessionId) return;

    const updated = { ...worldState };

    if (editing === 'presentCharacters') {
      updated[editing] = editValue.split(',').map(s => s.trim()).filter(Boolean);
    } else if (editing === 'ongoingEvents') {
      const newTexts = editValue.split(',').map(s => s.trim()).filter(Boolean);
      updated.ongoingEvents = newTexts.map(text => {
        const existing = (worldState.ongoingEvents || []).find(e =>
          typeof e === 'object' && e.text === text
        );
        return existing || { text, firstDetected: worldState.lastUpdated || 0, lastConfirmed: worldState.lastUpdated || 0, state: 'active' };
      });
    } else if (editing.startsWith('knownChar_')) {
      const charKey = editing.replace('knownChar_', '');
      updated.knownCharacters = { ...worldState.knownCharacters };
      updated.knownCharacters[charKey] = {
        ...updated.knownCharacters[charKey],
        disposition: editValue
      };
    } else if (editing.startsWith('knownEntity_')) {
      const entityKey = editing.replace('knownEntity_', '');
      updated.knownEntities = { ...worldState.knownEntities };
      updated.knownEntities[entityKey] = {
        ...updated.knownEntities[entityKey],
        context: editValue
      };
    } else if (editing.startsWith('debate_topic_')) {
      const idx = parseInt(editing.replace('debate_topic_', ''));
      updated.debates = [...(worldState.debates || [])];
      if (updated.debates[idx]) {
        updated.debates[idx] = { ...updated.debates[idx], topic: editValue };
      }
    } else if (editing.startsWith('debate_pos_')) {
      const [, , idxStr, name] = editing.split('_');
      const idx = parseInt(idxStr);
      updated.debates = [...(worldState.debates || [])];
      if (updated.debates[idx]) {
        updated.debates[idx] = {
          ...updated.debates[idx],
          positions: { ...updated.debates[idx].positions, [name]: editValue }
        };
      }
    } else {
      updated[editing] = editValue;
    }

    saveWorldState(currentSessionId, updated);
    setEditing(null);
    setEditValue('');
  }, [editing, editValue, worldState, currentSessionId, saveWorldState]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') { setEditing(null); setEditValue(''); }
  };

  const removeItem = (arrayField, idx) => {
    if (!currentSessionId) return;
    const updated = { ...worldState };
    const items = [...(updated[arrayField] || [])];
    items.splice(idx, 1);
    updated[arrayField] = items;
    saveWorldState(currentSessionId, updated);
  };

  const resolveDebate = (idx) => {
    if (!currentSessionId) return;
    const updated = { ...worldState };
    const debates = [...(updated.debates || [])];
    if (debates[idx]) {
      debates[idx] = { ...debates[idx], state: 'resolved' };
    }
    updated.debates = debates;
    saveWorldState(currentSessionId, updated);
  };

  const renderField = (label, field, value) => {
    const display = Array.isArray(value) ? value.join(', ') : value;
    if (editing === field) {
      return (
        <div className={styles.field}>
          <span className={styles.label}>{label}</span>
          <input
            className={styles.editInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
      );
    }
    return (
      <div className={styles.field} onClick={() => startEdit(field, value)}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{display || '—'}</span>
      </div>
    );
  };

  const renderLifecycleList = (label, arrayField, badgeOverride) => {
    const items = worldState[arrayField] || [];
    if (items.length === 0) return null;

    return (
      <div className={styles.subsection}>
        <span className={styles.label}>{label}</span>
        <div className={styles.eventList}>
          {items.map((item, idx) => {
            const text = typeof item === 'string' ? item : item.text;
            const state = typeof item === 'object' ? (badgeOverride || item.state) : 'active';
            return (
              <div key={idx} className={styles.eventItem}>
                <span className={`${styles.eventBadge} ${styles[`event_${state}`]}`}>
                  {state}
                </span>
                <span className={styles.eventText}>{text}</span>
                <button
                  className={styles.resolveBtn}
                  onClick={(e) => { e.stopPropagation(); removeItem(arrayField, idx); }}
                  title="Remove"
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderKnownCharacters = () => {
    const known = worldState.knownCharacters;
    if (!known || Object.keys(known).length === 0) return null;

    const presentSet = new Set((worldState.presentCharacters || []).map(c => c.toLowerCase()));
    const absent = Object.entries(known).filter(([key]) => !presentSet.has(key));
    if (absent.length === 0) return null;

    return (
      <div className={styles.subsection}>
        <span className={styles.sublabel}>Known Characters</span>
        <div className={styles.knownList}>
          {absent.map(([key, data]) => {
            const turnsAgo = (worldState.lastUpdated || 0) - (data.lastSeen || 0);
            const name = key.charAt(0).toUpperCase() + key.slice(1);
            const editField = `knownChar_${key}`;
            return (
              <div key={key} className={styles.knownItem}>
                <span className={styles.knownName}>{name}</span>
                <span className={styles.knownMeta}>
                  {turnsAgo}t ago{data.lastLocation ? ` at ${data.lastLocation}` : ''}
                </span>
                {editing === editField ? (
                  <input
                    className={styles.editInput}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    placeholder="disposition"
                  />
                ) : (
                  <span
                    className={styles.knownDisposition}
                    onClick={() => startEdit(editField, data.disposition)}
                  >
                    {data.disposition || 'neutral'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderKnownEntities = () => {
    const entities = worldState.knownEntities;
    if (!entities || Object.keys(entities).length === 0) return null;

    return (
      <div className={styles.subsection}>
        <span className={styles.sublabel}>Referenced</span>
        <div className={styles.knownList}>
          {Object.entries(entities).map(([key, data]) => {
            const turnsAgo = (worldState.lastUpdated || 0) - (data.lastSeen || 0);
            const editField = `knownEntity_${key}`;
            return (
              <div key={key} className={styles.knownItem}>
                <span className={styles.knownName}>{key}</span>
                <span className={styles.knownMeta}>{turnsAgo}t ago</span>
                {editing === editField ? (
                  <input
                    className={styles.editInput}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    placeholder="context"
                  />
                ) : (
                  <span
                    className={styles.knownDisposition}
                    onClick={() => startEdit(editField, data.context)}
                  >
                    {data.context || '—'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLocationTrail = () => {
    const trail = worldState.locationTrail;
    if (!trail || trail.length === 0) return null;

    const recent = trail.slice(-3);
    return (
      <div className={styles.breadcrumbs}>
        {recent.map((loc, idx) => {
          const turnsAgo = (worldState.lastUpdated || 0) - (loc.departedTurn || 0);
          return (
            <span key={idx} className={styles.crumb}>
              {loc.location} <span className={styles.crumbMeta}>({turnsAgo}t ago)</span>
              {idx < recent.length - 1 && <span className={styles.crumbArrow}> &rarr; </span>}
            </span>
          );
        })}
      </div>
    );
  };

  const renderDebates = () => {
    const debates = worldState.debates;
    if (!debates || debates.length === 0) return null;

    const visible = debates.filter(d => d.state !== 'resolved');
    if (visible.length === 0) return null;

    return (
      <div className={styles.subsection}>
        <span className={styles.sublabel}>Debates</span>
        <div className={styles.debateList}>
          {visible.map((debate, idx) => {
            const actualIdx = debates.indexOf(debate);
            return (
              <div key={idx} className={styles.debateItem}>
                <div className={styles.debateHeader}>
                  <span className={`${styles.eventBadge} ${styles[`event_${debate.state || 'active'}`]}`}>
                    {debate.state || 'active'}
                  </span>
                  {editing === `debate_topic_${actualIdx}` ? (
                    <input
                      className={styles.editInput}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                  ) : (
                    <span
                      className={styles.debateTopic}
                      onClick={() => startEdit(`debate_topic_${actualIdx}`, debate.topic)}
                    >
                      {debate.topic}
                    </span>
                  )}
                  <button
                    className={styles.resolveBtn}
                    onClick={() => resolveDebate(actualIdx)}
                    title="Resolve debate"
                  >
                    x
                  </button>
                </div>
                {debate.positions && Object.entries(debate.positions).map(([name, stance]) => (
                  <div key={name} className={styles.debatePosition}>
                    <span className={styles.posName}>{name}:</span>
                    {editing === `debate_pos_${actualIdx}_${name}` ? (
                      <input
                        className={styles.editInput}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={handleKeyDown}
                        autoFocus
                      />
                    ) : (
                      <span
                        className={styles.posStance}
                        onClick={() => startEdit(`debate_pos_${actualIdx}_${name}`, stance)}
                      >
                        {stance}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const title = isRoleplay ? 'World State' : 'Session State';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>{title}</span>
        <div className={styles.headerActions}>
          <button
            className={styles.reextractBtn}
            onClick={async () => {
              if (!currentSessionId || reextracting) return;
              setReextracting(true);
              await reextractWorldState(currentSessionId);
              setReextracting(false);
              setCollapsed(false);
            }}
            title="Re-extract state from all messages"
            disabled={reextracting}
          >
            {reextracting ? '...' : '\u21BB'}
          </button>
          <button
            className={`${styles.collapseBtn} ${collapsed ? styles.collapsed : ''}`}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            &#9662;
          </button>
        </div>
      </div>
      {!collapsed && hasState && (
        <div className={styles.fields}>
          {isRoleplay ? (
            <>
              {worldState.currentTime && renderField('Time', 'currentTime', worldState.currentTime)}
              {worldState.currentLocation && renderField('Location', 'currentLocation', worldState.currentLocation)}
              {renderLocationTrail()}
              {worldState.presentCharacters?.length > 0 && renderField('Present', 'presentCharacters', worldState.presentCharacters)}
              {worldState.mood && renderField('Atmosphere', 'mood', worldState.mood)}
              {renderLifecycleList('Events', 'ongoingEvents')}
              {renderKnownCharacters()}
            </>
          ) : (
            <>
              {worldState.currentFocus && renderField('Focus', 'currentFocus', worldState.currentFocus)}
              {renderLifecycleList('Open', 'openQuestions')}
              {renderLifecycleList('Decided', 'decisions', 'decided')}
              {renderLifecycleList('Parked', 'parkedItems', 'parked')}
              {renderKnownEntities()}
            </>
          )}
          {renderDebates()}
          {worldStateHistory?.length > 0 && (
            <div className={styles.subsection}>
              <span
                className={styles.historyToggle}
                onClick={() => setShowHistory(!showHistory)}
              >
                History ({worldStateHistory.length}) {showHistory ? '\u25B4' : '\u25BE'}
              </span>
              {showHistory && (
                <div className={styles.historyList}>
                  {[...worldStateHistory].reverse().map((entry, idx) => (
                    <div key={idx} className={styles.historyItem}>
                      <span className={styles.historyTurn}>t{entry.turn}</span>
                      <span className={styles.historyText}>
                        {entry.action
                          ? `${entry.field}: ${entry.to || entry.from} (${entry.action})`
                          : `${entry.field}: ${entry.from ? entry.from + ' \u2192 ' : ''}${entry.to || ''}`
                        }
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
