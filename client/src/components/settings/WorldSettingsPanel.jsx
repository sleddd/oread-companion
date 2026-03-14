import TextArea from '../ui/TextArea';

export default function WorldSettingsPanel({ settings, onChange }) {
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

  return (
    <div className="world-settings-panel">
      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Setting & Lore</label>
        <p className="world-settings-panel__hint">
          Describe the world, time period, location, and any important lore or background.
        </p>
        <TextArea
          value={world.settingLore}
          onChange={(value) => handleFieldChange('settingLore', value)}
          placeholder="Describe the world, setting, and lore. What kind of universe does this take place in?"
          rows={4}
        />
      </div>

      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Opening Scene</label>
        <p className="world-settings-panel__hint">
          Describe the initial scene and atmosphere to establish the starting point.
        </p>
        <TextArea
          value={world.openingScene}
          onChange={(value) => handleFieldChange('openingScene', value)}
          placeholder="Set the opening scene. Where does the story begin? What is happening?"
          rows={4}
        />
      </div>
    </div>
  );
}
