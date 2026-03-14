import { useState, useEffect } from 'react';
import TextField from '../ui/TextField';
import TextArea from '../ui/TextArea';
import ImageUpload from '../ui/ImageUpload';
import MultiSelect from '../ui/MultiSelect';
import Button from '../ui/Button';
import { getCharacter, saveCharacter, deleteCharacter as deleteCharacterFile } from '../../utils/characterAPI';
import { generateCharacterId, characterFileToSettings } from '../../utils/characterConverter';

// Personality trait options
const TRAIT_OPTIONS = {
  emotionalExpression: ['Warm', 'Reserved', 'Passionate', 'Calm', 'Stoic', 'Sensitive', 'Expressive', 'Grumpy', 'Volatile', 'Abrasive'],
  socialEnergy: ['Extroverted', 'Introverted', 'Friendly', 'Selective', 'Takes Initiative', 'Supportive', 'Independent', 'Surly'],
  thinkingStyle: ['Analytical', 'Creative', 'Wise', 'Curious', 'Observant', 'Philosophical', 'Pensive', 'Poetic', 'Practical'],
  humorPersonality: ['Witty', 'Sarcastic', 'Playful', 'Wry', 'Bold', 'Mysterious', 'Brooding', 'Lighthearted', 'Sharp-Tongued'],
  coreValues: ['Honest', 'Loyal', 'Courageous', 'Ambitious', 'Humble', 'Principled', 'Adventurous', 'Authentic', 'Justice-Oriented', 'Cynical'],
  howTheyCare: ['Kind', 'Compassionate', 'Empathetic', 'Patient', 'Generous', 'Encouraging', 'Protective', 'Respectful', 'Nurturing'],
  energyPresence: ['Energetic', 'Confident', 'Assertive', 'Gentle', 'Steady', 'Dynamic', 'Intense', 'Easygoing'],
  lifestyleInterests: ['Outdoorsy', 'Homebody', 'Romantic', 'Intellectual', 'Artistic', 'Active', 'Contemplative', 'Social']
};

// Default empty character structure
const EMPTY_CHARACTER = {
  name: '',
  age: '',
  gender: '',
  species: '',
  role: '',
  avatarImage: '',
  knowledgeSkills: '',
  hobbiesInterests: '',
  thingsToAvoid: '',
  backstory: '',
  inventory: '',
  traits: {
    emotionalExpression: [],
    socialEnergy: [],
    thinkingStyle: [],
    humorPersonality: [],
    coreValues: [],
    howTheyCare: [],
    energyPresence: [],
    lifestyleInterests: []
  }
};

// Debounce timer
let saveTimer = null;

export default function CharacterEditor({ characterRef, onCharacterRefChange, mode = 'single' }) {
  const [character, setCharacter] = useState(EMPTY_CHARACTER);
  const [isLoading, setIsLoading] = useState(false);

  // Load character from file when characterRef changes
  useEffect(() => {
    async function loadCharacterData() {
      if (!characterRef) {
        setCharacter(EMPTY_CHARACTER);
        return;
      }

      setIsLoading(true);
      try {
        const charFile = await getCharacter(characterRef);
        if (charFile) {
          const charData = characterFileToSettings(charFile);
          setCharacter(charData);
        } else {
          setCharacter({...EMPTY_CHARACTER, name: characterRef});
        }
      } catch (error) {
        setCharacter(EMPTY_CHARACTER);
      } finally {
        setIsLoading(false);
      }
    }

    loadCharacterData();
  }, [characterRef]);

  const handleFieldChange = (field, value) => {
    const updatedCharacter = {
      ...character,
      [field]: value
    };

    // Update local state immediately
    setCharacter(updatedCharacter);

    // Save to JSON file (debounced)
    saveToCharacterFile(updatedCharacter);
  };

  const handleTraitChange = (category, values) => {
    const updatedCharacter = {
      ...character,
      traits: {
        ...character.traits,
        [category]: values
      }
    };

    // Update local state immediately
    setCharacter(updatedCharacter);

    // Save to JSON file (debounced)
    saveToCharacterFile(updatedCharacter);
  };

  const saveToCharacterFile = (characterData) => {
    // Clear existing timer
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    // Set new timer (debounce 1 second)
    saveTimer = setTimeout(async () => {
      if (characterData.name) {
        const characterId = generateCharacterId(characterData.name);

        // If name changed, update the reference
        if (characterId !== characterRef) {
          onCharacterRefChange(characterId);
        }

        await saveCharacter(characterId, characterData);
      }
    }, 1000);
  };

  if (isLoading) {
    return (
      <div className="character-editor">
        <p>Loading character...</p>
      </div>
    );
  }

  return (
    <div className="character-editor">
      <div className="character-card">
        {/* Card Header with Avatar */}
        <div className="character-card__header">
          <div className="character-card__avatar-section">
            <ImageUpload
              value={character.avatarImage || ''}
              onChange={(value) => handleFieldChange('avatarImage', value)}
              label="Character Avatar"
            />
          </div>

          <div className="character-card__basic-info">
            <div className="character-editor__field">
              <label className="character-editor__label">Name</label>
              <TextField
                value={character.name || ''}
                onChange={(value) => handleFieldChange('name', value)}
                placeholder="Character name"
              />
            </div>

            <div className="character-editor__row">
              <div className="character-editor__field">
                <label className="character-editor__label">Age</label>
                <TextField
                  value={character.age || ''}
                  onChange={(value) => handleFieldChange('age', value)}
                  placeholder="Age or age range"
                />
              </div>

              <div className="character-editor__field">
                <label className="character-editor__label">Gender</label>
                <TextField
                  value={character.gender || ''}
                  onChange={(value) => handleFieldChange('gender', value)}
                  placeholder="Gender identity"
                />
              </div>
            </div>

            <div className="character-editor__row">
              <div className="character-editor__field">
                <label className="character-editor__label">Species</label>
                <TextField
                  value={character.species || ''}
                  onChange={(value) => handleFieldChange('species', value)}
                  placeholder="Human, Elf, AI, etc."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Role / Profession */}
        <div className="character-editor__section">
          <label className="character-editor__label">Role / Profession</label>
          <TextField
            value={character.role || ''}
            onChange={(value) => handleFieldChange('role', value)}
            placeholder="e.g., Tavern keeper, Ship captain, Detective"
          />
        </div>

        {/* Knowledge & Skills */}
        <div className="character-editor__section">
          <label className="character-editor__label">Knowledge & Skills</label>
          <TextArea
            value={character.knowledgeSkills || ''}
            onChange={(value) => handleFieldChange('knowledgeSkills', value)}
            placeholder="What they know and what they're good at..."
            rows={3}
          />
        </div>

        {/* Hobbies & Interests */}
        <div className="character-editor__section">
          <label className="character-editor__label">Hobbies & Interests</label>
          <TextArea
            value={character.hobbiesInterests || ''}
            onChange={(value) => handleFieldChange('hobbiesInterests', value)}
            placeholder="What they enjoy, what they do for fun..."
            rows={3}
          />
        </div>

        {/* Things to Avoid */}
        <div className="character-editor__section">
          <label className="character-editor__label">Things They Avoid</label>
          <TextArea
            value={character.thingsToAvoid || ''}
            onChange={(value) => handleFieldChange('thingsToAvoid', value)}
            placeholder="Topics or behaviors they dislike or avoid..."
            rows={2}
          />
        </div>

        {/* Backstory */}
        <div className="character-editor__section">
          <label className="character-editor__label">Backstory</label>
          <TextArea
            value={character.backstory || ''}
            onChange={(value) => handleFieldChange('backstory', value)}
            placeholder="Their history, experiences, key events..."
            rows={4}
          />
        </div>

        {/* Inventory */}
        <div className="character-editor__section">
          <label className="character-editor__label">Inventory</label>
          <TextArea
            value={character.inventory || ''}
            onChange={(value) => handleFieldChange('inventory', value)}
            placeholder="Items they carry or possess..."
            rows={2}
          />
        </div>

        {/* Personality Traits */}
        <div className="character-editor__section">
          <h3 className="character-editor__section-title">Personality Traits</h3>
          <p className="character-editor__hint">Select traits that define this character</p>

          {Object.entries(TRAIT_OPTIONS).map(([category, options]) => (
            <div key={category} className="character-editor__trait-group">
              <label className="character-editor__label">
                {category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
              <MultiSelect
                options={options}
                selected={character.traits?.[category] || []}
                onChange={(values) => handleTraitChange(category, values)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
