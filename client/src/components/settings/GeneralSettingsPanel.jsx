import Dropdown from '../ui/Dropdown';
import TextField from '../ui/TextField';

export default function GeneralSettingsPanel({ settings, onChange, models = [] }) {
  const { general } = settings;

  const handleFieldChange = (field, value) => {
    onChange({
      ...settings,
      general: {
        ...general,
        [field]: value
      }
    });
  };

  const modelOptions = [
    { value: '', label: 'None (use current model)' },
    ...models.map(model => ({
      value: model.name,
      label: model.name
    }))
  ];

  return (
    <div className="general-settings-panel">
      <div className="general-settings-panel__section">
        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">Default Model</label>
          <Dropdown
            options={modelOptions}
            value={general.selectedModel || ''}
            onChange={(value) => handleFieldChange('selectedModel', value || null)}
          />
          <p className="general-settings-panel__hint">
            The model to use by default. Leave empty to use currently selected model.
          </p>
        </div>
      </div>

      <div className="general-settings-panel__section">
        <h4 className="general-settings-panel__section-title">Generation Parameters</h4>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">
            Temperature ({general.temperature})
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={general.temperature}
            onChange={(e) => handleFieldChange('temperature', parseFloat(e.target.value))}
            className="general-settings-panel__slider"
          />
          <p className="general-settings-panel__hint">
            Controls randomness. Lower = more focused, Higher = more creative (0.0 - 2.0)
          </p>
        </div>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">
            Top P ({general.topP})
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={general.topP}
            onChange={(e) => handleFieldChange('topP', parseFloat(e.target.value))}
            className="general-settings-panel__slider"
          />
          <p className="general-settings-panel__hint">
            Nucleus sampling threshold. Controls diversity of output (0.0 - 1.0)
          </p>
        </div>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">Max Tokens</label>
          <TextField
            type="number"
            value={general.maxTokens.toString()}
            onChange={(value) => handleFieldChange('maxTokens', parseInt(value) || 2048)}
            placeholder="2048"
          />
          <p className="general-settings-panel__hint">
            Maximum length of generated responses (in tokens)
          </p>
        </div>
      </div>

      <div className="general-settings-panel__section">
        <h4 className="general-settings-panel__section-title">Features</h4>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__checkbox-label">
            <input
              type="checkbox"
              checked={general.memory}
              onChange={(e) => handleFieldChange('memory', e.target.checked)}
              className="general-settings-panel__checkbox"
            />
            <span>Enable Conversation Memory & RAG</span>
          </label>
          <p className="general-settings-panel__hint">
            Save conversations to database and use semantic search for longer chats (50+ messages)
          </p>
        </div>

        {/* Hidden for now - Future features
        <div className="general-settings-panel__field">
          <label className="general-settings-panel__checkbox-label">
            <input
              type="checkbox"
              checked={general.webSearch}
              onChange={(e) => handleFieldChange('webSearch', e.target.checked)}
              className="general-settings-panel__checkbox"
            />
            <span>Enable Web Search</span>
          </label>
          <p className="general-settings-panel__hint">
            Allow the AI to search the web for up-to-date information (not yet implemented)
          </p>
        </div>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__checkbox-label">
            <input
              type="checkbox"
              checked={general.chatSearch}
              onChange={(e) => handleFieldChange('chatSearch', e.target.checked)}
              className="general-settings-panel__checkbox"
            />
            <span>Enable Chat Search</span>
          </label>
          <p className="general-settings-panel__hint">
            Search through past conversations (not yet implemented)
          </p>
        </div>
        */}
      </div>
    </div>
  );
}
