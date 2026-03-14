import { useState } from 'react';
import useStore from '../../store/useStore';
import Button from '../ui/Button';
import TextField from '../ui/TextField';
import { saveApiKey, deleteApiKey, verifyApiKey } from '../../utils/apiKeyAPI';

function ProviderKeySection({ provider, label, configured, onUpdate }) {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState(null); // 'saving' | 'verifying' | 'success' | 'error'
  const [statusMessage, setStatusMessage] = useState('');

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setStatus('saving');
    setStatusMessage('');

    try {
      const result = await saveApiKey(provider, apiKey.trim());
      if (result.success) {
        setApiKey('');
        setStatus('success');
        setStatusMessage('API key saved');
        onUpdate();
      } else {
        setStatus('error');
        setStatusMessage(result.error || 'Failed to save');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage(error.message);
    }
  };

  const handleDelete = async () => {
    setStatus('saving');
    try {
      await deleteApiKey(provider);
      setStatus('success');
      setStatusMessage('API key removed');
      onUpdate();
    } catch (error) {
      setStatus('error');
      setStatusMessage(error.message);
    }
  };

  const handleVerify = async () => {
    setStatus('verifying');
    setStatusMessage('');
    try {
      const result = await verifyApiKey(provider);
      if (result.success) {
        setStatus('success');
        setStatusMessage('API key is valid');
      } else {
        setStatus('error');
        setStatusMessage(result.message || 'Verification failed');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage(error.message);
    }
  };

  return (
    <div className="api-key-section">
      <div className="api-key-section__header">
        <h4 className="api-key-section__title">
          <span className={`api-key-section__status-dot ${configured ? 'api-key-section__status-dot--active' : ''}`} />
          {label}
        </h4>
        <span className="api-key-section__status-text">
          {configured ? 'Configured' : 'Not configured'}
        </span>
      </div>

      <div className="api-key-section__input-row">
        <TextField
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder={configured ? 'Enter new key to replace...' : 'Enter API key...'}
        />
      </div>

      <div className="api-key-section__actions">
        <Button
          onClick={handleSave}
          variant="primary"
          disabled={!apiKey.trim() || status === 'saving'}
        >
          {status === 'saving' ? 'Saving...' : 'Save Key'}
        </Button>

        {configured && (
          <>
            <Button
              onClick={handleVerify}
              variant="secondary"
              disabled={status === 'verifying'}
            >
              {status === 'verifying' ? 'Verifying...' : 'Verify'}
            </Button>
            <Button
              onClick={handleDelete}
              variant="secondary"
            >
              Remove Key
            </Button>
          </>
        )}
      </div>

      {statusMessage && (
        <p className={`api-key-section__message api-key-section__message--${status}`}>
          {statusMessage}
        </p>
      )}
    </div>
  );
}

export default function ApiKeyPanel() {
  const configuredProviders = useStore((state) => state.configuredProviders);
  const fetchConfiguredProviders = useStore((state) => state.fetchConfiguredProviders);
  const fetchModels = useStore((state) => state.fetchModels);

  const handleUpdate = () => {
    fetchConfiguredProviders();
    // Re-fetch models to include/exclude cloud models
    fetchModels();
  };

  return (
    <div className="api-key-panel">
      <p className="api-key-panel__description">
        Add API keys for cloud AI providers. Keys are encrypted and stored securely on the server.
        They are never sent back to the browser after saving.
      </p>

      <ProviderKeySection
        provider="openai"
        label="OpenAI"
        configured={configuredProviders.openai}
        onUpdate={handleUpdate}
      />

      <ProviderKeySection
        provider="anthropic"
        label="Anthropic (Claude)"
        configured={configuredProviders.anthropic}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
