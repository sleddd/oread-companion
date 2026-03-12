import { useState } from 'react';
import TextArea from '../ui/TextArea';
import TextField from '../ui/TextField';
import TagInput from '../ui/TagInput';
import Dropdown from '../ui/Dropdown';

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

  const narratorOptions = [
    { value: '', label: 'None' },
    { value: 'Omniscient Narrator', label: 'Omniscient Narrator' },
    { value: 'Third-person limited perspective', label: 'Third-person Limited' },
    { value: 'First-person narrator', label: 'First-person Narrator' },
    { value: 'Second-person narrator', label: 'Second-person Narrator' },
    { value: 'Cinematic narrative style', label: 'Cinematic Style' },
    { value: 'Literary prose narrator', label: 'Literary Prose' }
  ];

  return (
    <div className="world-settings-panel">
      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Setting & Lore</label>
        <TextArea
          value={world.settingLore}
          onChange={(value) => handleFieldChange('settingLore', value)}
          placeholder="Describe the world, setting, and lore. What kind of universe does this take place in?"
          rows={4}
        />
        <p className="world-settings-panel__hint">
          Describe the world, time period, location, and any important lore or background.
        </p>
      </div>

      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Opening Scene</label>
        <TextArea
          value={world.openingScene}
          onChange={(value) => handleFieldChange('openingScene', value)}
          placeholder="Set the opening scene. Where does the story begin? What is happening?"
          rows={4}
        />
        <p className="world-settings-panel__hint">
          Describe the initial scene and atmosphere to establish the starting point.
        </p>
      </div>

      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Narrator Voice</label>
        <Dropdown
          options={narratorOptions}
          value={world.narratorVoice}
          onChange={(value) => handleFieldChange('narratorVoice', value)}
        />
        <p className="world-settings-panel__hint">
          The narrative perspective and style for scene descriptions.
        </p>
      </div>

      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Pacing & Flow</label>
        <TextArea
          value={world.pacing}
          onChange={(value) => handleFieldChange('pacing', value)}
          placeholder="Describe the desired pacing. Should scenes move quickly, or take time for atmosphere?"
          rows={3}
        />
        <p className="world-settings-panel__hint">
          Define how quickly or slowly the narrative should progress.
        </p>
      </div>

      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Hard Rules (Never Violate)</label>
        <TagInput
          tags={world.hardRules}
          onChange={(tags) => handleFieldChange('hardRules', tags)}
          placeholder="Add a rule and press Enter"
        />
        <p className="world-settings-panel__hint">
          Absolute constraints the AI must never break (e.g., "Never speak for the user").
        </p>
      </div>

      <div className="world-settings-panel__field">
        <label className="world-settings-panel__label">Turn Logic</label>
        <TextArea
          value={world.turnLogic}
          onChange={(value) => handleFieldChange('turnLogic', value)}
          placeholder="Define when the AI should stop and wait for user input. E.g., 'Stop after character speaks'"
          rows={3}
        />
        <p className="world-settings-panel__hint">
          Instructions for when to end a response and wait for user action.
        </p>
      </div>
    </div>
  );
}
