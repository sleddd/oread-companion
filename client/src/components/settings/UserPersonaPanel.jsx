import TextField from '../ui/TextField';
import TextArea from '../ui/TextArea';
import TagInput from '../ui/TagInput';
import Dropdown from '../ui/Dropdown';

// Common timezone options
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET) - New York' },
  { value: 'America/Chicago', label: 'Central Time (CT) - Chicago' },
  { value: 'America/Denver', label: 'Mountain Time (MT) - Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT) - Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT) - Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT) - Honolulu' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' }
];

export default function UserPersonaPanel({ settings, onChange }) {
  const { userPersona } = settings;

  const handleFieldChange = (field, value) => {
    onChange({
      ...settings,
      userPersona: {
        ...userPersona,
        [field]: value
      }
    });
  };

  const handleTastesChange = (field, value) => {
    onChange({
      ...settings,
      userPersona: {
        ...userPersona,
        tastes: {
          ...userPersona.tastes,
          [field]: value
        }
      }
    });
  };

  const handleLinguisticFiltersChange = (field, value) => {
    onChange({
      ...settings,
      userPersona: {
        ...userPersona,
        linguisticFilters: {
          ...userPersona.linguisticFilters,
          [field]: value
        }
      }
    });
  };

  return (
    <div className="user-persona-panel">
      <div className="user-persona-panel__section">
        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Your Name</label>
          <TextField
            value={userPersona.name}
            onChange={(value) => handleFieldChange('name', value)}
            placeholder="How should the AI address you?"
          />
        </div>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Profession</label>
          <TextField
            value={userPersona.profession}
            onChange={(value) => handleFieldChange('profession', value)}
            placeholder="Your job or field of work"
          />
        </div>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Bio</label>
          <TextArea
            value={userPersona.bio}
            onChange={(value) => handleFieldChange('bio', value)}
            placeholder="Brief description of yourself, background, or relevant context"
            rows={3}
          />
        </div>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Skills & Expertise</label>
          <TextField
            value={userPersona.skills}
            onChange={(value) => handleFieldChange('skills', value)}
            placeholder="Your skills, knowledge areas, or expertise"
          />
        </div>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Timezone</label>
          <Dropdown
            options={TIMEZONE_OPTIONS}
            value={userPersona.timezone || 'America/Los_Angeles'}
            onChange={(value) => handleFieldChange('timezone', value)}
            placeholder="Select your timezone"
          />
          <p className="user-persona-panel__hint">
            The AI will be aware of your local time for time-sensitive responses.
          </p>
        </div>
      </div>

      <div className="user-persona-panel__section">
        <h4 className="user-persona-panel__section-title">Tastes & Preferences</h4>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Interests</label>
          <TextField
            value={userPersona.tastes.interests}
            onChange={(value) => handleTastesChange('interests', value)}
            placeholder="Topics you're interested in"
          />
        </div>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Hobbies</label>
          <TextField
            value={userPersona.tastes.hobbies}
            onChange={(value) => handleTastesChange('hobbies', value)}
            placeholder="Activities you enjoy"
          />
        </div>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Media Preferences</label>
          <TextField
            value={userPersona.tastes.mediaPreferences}
            onChange={(value) => handleTastesChange('mediaPreferences', value)}
            placeholder="Books, movies, games, music you like"
          />
        </div>
      </div>

      <div className="user-persona-panel__section">
        <h4 className="user-persona-panel__section-title">Boundaries & Comfort</h4>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Personal Boundaries</label>
          <TextArea
            value={userPersona.boundaries}
            onChange={(value) => handleFieldChange('boundaries', value)}
            placeholder="Topics to avoid, sensitivities, or comfort preferences"
            rows={3}
          />
          <p className="user-persona-panel__hint">
            Help the AI respect your boundaries and comfort zones.
          </p>
        </div>
      </div>

      <div className="user-persona-panel__section">
        <h4 className="user-persona-panel__section-title">Linguistic Filters</h4>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Banned Words</label>
          <TagInput
            tags={userPersona.linguisticFilters.bannedWords}
            onChange={(tags) => handleLinguisticFiltersChange('bannedWords', tags)}
            placeholder="Add a word and press Enter"
          />
          <p className="user-persona-panel__hint">
            Words the AI should never use in responses.
          </p>
        </div>

        <div className="user-persona-panel__field">
          <label className="user-persona-panel__label">Banned Phrases</label>
          <TagInput
            tags={userPersona.linguisticFilters.bannedPhrases}
            onChange={(tags) => handleLinguisticFiltersChange('bannedPhrases', tags)}
            placeholder="Add a phrase and press Enter"
          />
          <p className="user-persona-panel__hint">
            Phrases or expressions the AI should avoid.
          </p>
        </div>
      </div>
    </div>
  );
}
