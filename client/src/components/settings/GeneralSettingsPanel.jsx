import TextField from '../ui/TextField';

const PROVIDER_LABELS = {
  ollama: 'Ollama (Local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)'
};

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

  // Group models by provider
  const grouped = {};
  for (const model of models) {
    const provider = model.provider || 'ollama';
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push(model);
  }
  const providerOrder = ['ollama', 'openai', 'anthropic'];
  const sortedProviders = providerOrder.filter(p => grouped[p]?.length > 0);
  const hasMultipleProviders = sortedProviders.length > 1;

  return (
    <div className="general-settings-panel">
      <div className="general-settings-panel__section">
        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">Default Model</label>
          <p className="general-settings-panel__hint">
            The model to use by default. Leave empty to use currently selected model.
          </p>
          <select
            className="dropdown"
            value={general.selectedModel || ''}
            onChange={(e) => handleFieldChange('selectedModel', e.target.value || null)}
          >
            <option value="">None (use current model)</option>
            {hasMultipleProviders ? (
              sortedProviders.map(provider => (
                <optgroup key={provider} label={PROVIDER_LABELS[provider] || provider}>
                  {grouped[provider].map(model => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : (
              models.map(model => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="general-settings-panel__section">
        <h4 className="general-settings-panel__section-title">Generation Parameters</h4>

        <div className="general-settings-panel__field">
          <label className="general-settings-panel__label">
            Temperature ({general.temperature})
          </label>
          <p className="general-settings-panel__hint">
            Controls randomness. Lower = more focused, Higher = more creative (0.0 - 2.0)
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
            Nucleus sampling threshold. Controls diversity of output (0.0 - 1.0)
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
          <label className="general-settings-panel__label">Max Tokens</label>
          <p className="general-settings-panel__hint">
            Maximum length of generated responses (in tokens)
          </p>
          <TextField
            type="number"
            value={general.maxTokens.toString()}
            onChange={(value) => handleFieldChange('maxTokens', parseInt(value) || 2048)}
            placeholder="2048"
          />
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
