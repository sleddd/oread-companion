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
          <p className="general-settings-panel__hint">
            The model to use by default. Leave empty to use currently selected model.
          </p>
          <Dropdown
            options={modelOptions}
            value={general.selectedModel || ''}
            onChange={(value) => handleFieldChange('selectedModel', value || null)}
          />
        </div>
      </div>

      <div className="general-settings-panel__section">
        <h4 className="general-settings-panel__section-title">Generation Parameters</h4>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">
            Temperature ({general.temperature})
          </label>
          <p className="general-settings-panel__hint">
            How wild or predictable your character acts. Low values make them speak in safe, expected ways.
            High values make them more surprising, playful, and unpredictable — but too high can make them incoherent.
          </p>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={general.temperature}
            onChange={(e) => handleFieldChange('temperature', parseFloat(e.target.value))}
            className="general-settings-panel__slider"
          />
        </div>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">
            Top P ({general.topP})
          </label>
          <p className="general-settings-panel__hint">
            How broad your character's vocabulary and word choices are. Lower values make them stick to the most
            obvious words and phrases. Higher values let them pick from a wider range of expressions, giving
            responses more variety and flavor.
          </p>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={general.topP}
            onChange={(e) => handleFieldChange('topP', parseFloat(e.target.value))}
            className="general-settings-panel__slider"
          />
        </div>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">
            Frequency Penalty ({general.frequencyPenalty})
          </label>
          <p className="general-settings-panel__hint">
            How much your character avoids repeating themselves. At 1.0 there is no penalty.
            Higher values discourage repeated words and phrases, making dialogue feel fresher.
            Too high and they may start avoiding common words unnaturally.
          </p>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={general.frequencyPenalty}
            onChange={(e) => handleFieldChange('frequencyPenalty', parseFloat(e.target.value))}
            className="general-settings-panel__slider"
          />
        </div>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">Max Tokens</label>
          <p className="general-settings-panel__hint">
            How long your character's responses can be. Each token is roughly a word or part of a word.
            Higher values allow longer, more detailed replies. Lower values keep responses short and snappy.
          </p>
          <TextField
            type="number"
            value={general.maxTokens.toString()}
            onChange={(value) => handleFieldChange('maxTokens', parseInt(value) || 2048)}
            placeholder="2048"
          />
        </div>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">Context Budget</label>
          <p className="general-settings-panel__hint">
            How many tokens of conversation history to include in each request. Higher values give the AI
            more context from past messages but use more of the model's context window. Pinned messages
            and story notes are prioritized within this budget.
          </p>
          <TextField
            type="number"
            value={(general.contextBudget || 4096).toString()}
            onChange={(value) => handleFieldChange('contextBudget', Math.max(512, Math.min(131072, parseInt(value) || 4096)))}
            placeholder="4096"
          />
        </div>
      </div>

      <div className="general-settings-panel__section">
        <h4 className="general-settings-panel__section-title">Features</h4>

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
