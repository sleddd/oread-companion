import TextArea from '../ui/TextArea';

export default function UtilitySettingsPanel({ settings, onChange }) {
  const { utility } = settings;

  const handleAssistantIdentityChange = (field, value) => {
    onChange({
      ...settings,
      utility: {
        ...utility,
        assistantIdentity: {
          ...utility.assistantIdentity,
          [field]: value
        }
      }
    });
  };

  const handleGuardrailsChange = (field, value) => {
    onChange({
      ...settings,
      utility: {
        ...utility,
        guardrails: {
          ...utility.guardrails,
          [field]: value
        }
      }
    });
  };

  return (
    <div className="utility-settings-panel">
      <div className="utility-settings-panel__section">
        <div className="utility-settings-panel__field">
          <label className="utility-settings-panel__label">Persona & Role</label>
          <TextArea
            value={utility.assistantIdentity.persona}
            onChange={(value) => handleAssistantIdentityChange('persona', value)}
            placeholder="Define the assistant's identity. E.g., 'You are an expert tutor specializing in...'"
            rows={4}
          />
          <p className="utility-settings-panel__hint">
            Who is the assistant? What is its role and expertise?
          </p>
        </div>

        <div className="utility-settings-panel__field">
          <label className="utility-settings-panel__label">Communication Style</label>
          <TextArea
            value={utility.assistantIdentity.communicationStyle}
            onChange={(value) => handleAssistantIdentityChange('communicationStyle', value)}
            placeholder="How should the assistant communicate? Formal, casual, concise, detailed, etc."
            rows={4}
          />
          <p className="utility-settings-panel__hint">
            Describe the desired tone, level of detail, and communication approach.
          </p>
        </div>
      </div>

      <div className="utility-settings-panel__section">
        <h4 className="utility-settings-panel__section-title">Guardrails</h4>

        <div className="utility-settings-panel__field">
          <label className="utility-settings-panel__label">Negative Constraints (Do NOT)</label>
          <TextArea
            value={utility.guardrails.negativeConstraints}
            onChange={(value) => handleGuardrailsChange('negativeConstraints', value)}
            placeholder="Things the assistant should NOT do. E.g., 'Do not provide medical advice', 'Do not be condescending'"
            rows={4}
          />
          <p className="utility-settings-panel__hint">
            Explicitly state what the assistant should avoid or refrain from doing.
          </p>
        </div>

        <div className="utility-settings-panel__field">
          <label className="utility-settings-panel__label">Formatting Preferences</label>
          <TextArea
            value={utility.guardrails.formattingPreferences}
            onChange={(value) => handleGuardrailsChange('formattingPreferences', value)}
            placeholder="Preferred output formatting. E.g., 'Use bullet points for lists', 'Include code blocks for examples'"
            rows={4}
          />
          <p className="utility-settings-panel__hint">
            Specify how responses should be structured and formatted.
          </p>
        </div>
      </div>
    </div>
  );
}
