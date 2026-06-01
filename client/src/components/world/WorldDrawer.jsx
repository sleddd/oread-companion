import { useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import styles from './WorldDrawer.module.scss';

export default function WorldDrawer({ isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [worldToDelete, setWorldToDelete] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const searchRef = useRef(null);

  const templates = useStore((s) => s.templates);
  const settings = useStore((s) => s.settings);
  const applyTemplate = useStore((s) => s.applyTemplate);
  const fetchTemplates = useStore((s) => s.fetchTemplates);
  const deleteTemplate = useStore((s) => s.deleteTemplate);

  const activeTemplateId = settings?.meta?.templateId || null;

  // Measure header height and load templates when drawer opens
  useEffect(() => {
    if (isOpen) {
      const headerEl = document.querySelector('.header');
      if (headerEl) {
        setHeaderHeight(headerEl.offsetHeight);
      }
      fetchTemplates();
    }
  }, [isOpen, fetchTemplates]);

  // Auto-focus search and handle Escape
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 100);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          if (showDeleteConfirm) {
            setShowDeleteConfirm(false);
            setWorldToDelete(null);
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
    }
  }, [isOpen]);

  const userTemplates = templates.filter((t) => t.isUserTemplate);
  const defaultTemplates = templates.filter((t) => !t.isUserTemplate);

  const filterTemplates = (list) => {
    if (!searchQuery.trim()) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(
      (t) =>
        t.name?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
    );
  };

  const filteredUser = filterTemplates(userTemplates);
  const filteredDefault = filterTemplates(defaultTemplates);
  const hasResults = filteredUser.length > 0 || filteredDefault.length > 0;

  const handleWorldClick = async (template) => {
    await applyTemplate(template);
    onClose();
  };

  const handleClearWorld = async () => {
    await applyTemplate(null);
    onClose();
  };

  const handleDeleteClick = (e, template) => {
    e.stopPropagation();
    setWorldToDelete(template);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (worldToDelete) {
      await deleteTemplate(worldToDelete.id);
      setShowDeleteConfirm(false);
      setWorldToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setWorldToDelete(null);
  };

  if (!isOpen && !showDeleteConfirm) return null;

  const renderWorldCard = (template, showDelete = false) => (
    <div
      key={template.id}
      className={`${styles.worldCard} ${
        activeTemplateId === template.id ? styles.active : ''
      }`}
      onClick={() => handleWorldClick(template)}
    >
      <div className={styles.worldInfo}>
        <div className={styles.worldName}>{template.name}</div>
        <div className={styles.worldMeta}>
          <span className={styles.worldCategory}>
            {template.category === 'utility' ? 'Utility' : 'Roleplay'}
          </span>
          {template.isUserTemplate && (
            <span className={styles.worldBadge}>My World</span>
          )}
        </div>
        {template.description && (
          <div className={styles.worldDescription}>{template.description}</div>
        )}
      </div>

      {showDelete && (
        <button
          className={styles.deleteButton}
          onClick={(e) => handleDeleteClick(e, template)}
          title="Delete world"
        >
          ×
        </button>
      )}
    </div>
  );

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
          <h3>Worlds</h3>
          <button className={styles.closeButton} onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className={styles.search}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search worlds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.worldList}>
          {activeTemplateId && (
            <button className={styles.clearCard} onClick={handleClearWorld}>
              Clear active world
            </button>
          )}

          {!hasResults ? (
            <div className={styles.empty}>
              {searchQuery ? 'No worlds match your search.' : 'No worlds available.'}
            </div>
          ) : (
            <>
              {filteredUser.length > 0 && (
                <>
                  <div className={styles.sectionLabel}>My Worlds</div>
                  {filteredUser.map((t) => renderWorldCard(t, true))}
                </>
              )}
              {filteredDefault.length > 0 && (
                <>
                  <div className={styles.sectionLabel}>Templates</div>
                  {filteredDefault.map((t) => renderWorldCard(t, false))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className={styles.modal} onClick={handleCancelDelete}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Delete World</h3>
            <p>
              Are you sure you want to delete &ldquo;{worldToDelete?.name}&rdquo;? This
              action cannot be undone.
            </p>
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
