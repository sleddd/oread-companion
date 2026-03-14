import Button from '../ui/Button';

const PROVIDER_LABELS = {
  ollama: 'Ollama (Local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)'
};

export default function ModelSelector({
  models = [],
  selectedModel = null,
  onSelectModel,
  onRefreshModels
}) {
  // Group models by provider
  const grouped = {};
  for (const model of models) {
    const provider = model.provider || 'ollama';
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push(model);
  }

  // Order: ollama first, then openai, then anthropic
  const providerOrder = ['ollama', 'openai', 'anthropic'];
  const sortedProviders = providerOrder.filter(p => grouped[p]?.length > 0);

  const hasMultipleProviders = sortedProviders.length > 1;

  return (
    <div className="model-selector">
      <div className="model-selector__controls">
        <select
          className="dropdown"
          value={selectedModel || ''}
          onChange={(e) => onSelectModel(e.target.value)}
        >
          <option value="">Choose a model...</option>
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
        <Button onClick={onRefreshModels} variant="secondary">
          Refresh
        </Button>
      </div>
    </div>
  );
}
