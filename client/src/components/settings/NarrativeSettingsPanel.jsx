import Dropdown from '../ui/Dropdown';
import TagInput from '../ui/TagInput';
import { getNarrativeOptions } from '../../utils/narrativeSystemLoader';

export default function NarrativeSettingsPanel({ settings, onChange }) {
  const { world } = settings.roleplay;

  const handleFieldChange = (field, value) => {
    onChange({
      ...settings,
      roleplay: {
        ...settings.roleplay,
        world: {
          ...world,
          [field]: value
        }
      }
    });
  };

  const narratorOptions = getNarrativeOptions();

  return (
    <div className="narrative-settings-panel">
      <div className="narrative-settings-panel__field">
        <label className="narrative-settings-panel__label">Narrator Voice</label>
        <p className="narrative-settings-panel__hint">
          The narrative perspective and style for scene descriptions and character actions.
        </p>
        <Dropdown
          options={narratorOptions}
          value={world.narratorVoice}
          onChange={(value) => handleFieldChange('narratorVoice', value)}
        />
      </div>

      <div className="narrative-settings-panel__field">
        <label className="narrative-settings-panel__label">Hard Rules (Never Violate)</label>
        <p className="narrative-settings-panel__hint">
          Absolute constraints the AI must never break (e.g., "Never speak for the user").
        </p>
        <TagInput
          tags={world.hardRules}
          onChange={(tags) => handleFieldChange('hardRules', tags)}
          placeholder="Add a rule and press Enter"
        />
      </div>
    </div>
  );
}
