import { useState, useEffect } from 'react';
import Button from '../ui/Button';
import CharacterEditor from './CharacterEditor';
import { getAllCharacters, deleteCharacter as deleteCharacterFile } from '../../utils/characterAPI';
import { generateCharacterId } from '../../utils/characterConverter';

export default function CharacterList({ characterRefs = [], onCharacterRefsChange }) {
  const [editingRef, setEditingRef] = useState(null);
  const [availableCharacters, setAvailableCharacters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load available characters (user-created only)
  useEffect(() => {
    async function loadCharacters() {
      setIsLoading(true);
      try {
        const userChars = await getAllCharacters();
        setAvailableCharacters(userChars);
      } catch (error) {
        console.error('Error loading characters:', error);
        setAvailableCharacters([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadCharacters();
  }, [characterRefs]); // Reload when refs change

  const handleAddCharacter = () => {
    // Add an empty reference - user will need to create/name the character
    const newRef = '';
    onCharacterRefsChange([...characterRefs, newRef]);
    setEditingRef(newRef);
  };

  const handleEditCharacter = (ref) => {
    setEditingRef(ref);
  };

  const handleDeleteCharacter = async (index) => {
    const refToDelete = characterRefs[index];

    if (!refToDelete) {
      // Empty reference - just remove from array
      const updatedRefs = characterRefs.filter((_, i) => i !== index);
      onCharacterRefsChange(updatedRefs);
      return;
    }

    const charName = getCharacterName(refToDelete);
    if (window.confirm(`Delete character "${charName}" (${refToDelete})? This will remove the character file.`)) {
      try {
        // Delete from file system
        const success = await deleteCharacterFile(refToDelete);

        if (success) {
          // Remove from refs array
          const updatedRefs = characterRefs.filter((_, i) => i !== index);
          onCharacterRefsChange(updatedRefs);
          console.log(`✅ Character "${refToDelete}" deleted successfully`);
        } else {
          console.error(`❌ Failed to delete character "${refToDelete}"`);
          alert(`Failed to delete character "${charName}". Check console for details.`);
        }
      } catch (error) {
        console.error(`❌ Error deleting character "${refToDelete}":`, error);
        alert(`Error deleting character "${charName}": ${error.message}`);
      }
    }
  };

  const handleCharacterRefChange = (oldRef, newRef) => {
    // Update the ref in the array
    const updatedRefs = characterRefs.map(ref => ref === oldRef ? newRef : ref);
    onCharacterRefsChange(updatedRefs);

    // Update editing ref if it changed
    if (editingRef === oldRef) {
      setEditingRef(newRef);
    }
  };

  const handleFinishEditing = () => {
    setEditingRef(null);
  };

  // Get character details for display
  const getCharacterName = (ref) => {
    const char = availableCharacters.find(c => c.id === ref);
    return char?.character?.name || ref || 'Unnamed';
  };

  if (isLoading) {
    return (
      <div className="character-list">
        <p>Loading characters...</p>
      </div>
    );
  }

  return (
    <div className="character-list">
      <div className="character-list__header">
        <h3 className="character-list__title">
          Characters ({characterRefs.length})
        </h3>
        <Button onClick={handleAddCharacter} variant="primary">
          + Add Character
        </Button>
      </div>

      {characterRefs.length === 0 && (
        <div className="character-list__empty">
          <p>No characters added yet. Click "Add Character" to create one.</p>
        </div>
      )}

      {/* Editing Mode */}
      {editingRef !== null && (
        <div className="character-list__editor">
          <div className="character-list__editor-header">
            <h4>Editing Character</h4>
            <Button onClick={handleFinishEditing} variant="secondary">
              Done Editing
            </Button>
          </div>
          <CharacterEditor
            characterRef={editingRef}
            onCharacterRefChange={(newRef) => handleCharacterRefChange(editingRef, newRef)}
            mode="multi"
          />
        </div>
      )}

      {/* Character List View */}
      {editingRef === null && characterRefs.length > 0 && (
        <div className="character-list__grid">
          {characterRefs.map((ref, index) => {
            const charName = getCharacterName(ref);
            const char = availableCharacters.find(c => c.id === ref);

            return (
              <div key={index} className="character-card-preview">
                {char?.character?.avatarImage && (
                  <div className="character-card-preview__avatar">
                    <img
                      src={char.character.avatarImage}
                      alt={charName}
                    />
                  </div>
                )}

                <div className="character-card-preview__info">
                  <h4 className="character-card-preview__name">
                    {charName}
                    {index === 0 && (
                      <span className="character-card-preview__badge">Main</span>
                    )}
                  </h4>

                  {char?.character?.role && (
                    <p className="character-card-preview__role">
                      {char.character.role}
                    </p>
                  )}

                  {char?.character?.traits && (
                    <div className="character-card-preview__traits">
                      {[
                        ...(char.character.traits.emotionalExpression || []),
                        ...(char.character.traits.socialEnergy || []),
                        ...(char.character.traits.thinkingStyle || [])
                      ].slice(0, 3).map((trait, i) => (
                        <span key={i} className="character-card-preview__trait">
                          {trait}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="character-card-preview__actions">
                  <Button
                    onClick={() => handleEditCharacter(ref)}
                    variant="secondary"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => handleDeleteCharacter(index)}
                    variant="secondary"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
