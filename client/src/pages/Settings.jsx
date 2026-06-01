import { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import ModelSelector from '../components/model/ModelSelector';
import ModelDownloader from '../components/model/ModelDownloader';
import TemplateSelector from '../components/settings/TemplateSelector';
import SettingsSection from '../components/settings/SettingsSection';
import CollapsibleSection from '../components/settings/CollapsibleSection';
import WorldSettingsPanel from '../components/settings/WorldSettingsPanel';
import NarrativeSettingsPanel from '../components/settings/NarrativeSettingsPanel';
import CharacterEditor from '../components/settings/CharacterEditor';
import CharacterList from '../components/settings/CharacterList';
import UserPersonaPanel from '../components/settings/UserPersonaPanel';
import GeneralSettingsPanel from '../components/settings/GeneralSettingsPanel';
import Button from '../components/ui/Button';
import Dropdown from '../components/ui/Dropdown';
export default function Settings() {
  // Get state and actions from Zustand store
  const settings = useStore((state) => state.settings);
  const setSettings = useStore((state) => state.setSettings);
  const isSavingSettings = useStore((state) => state.isSavingSettings);
  const lastSaved = useStore((state) => state.lastSaved);
  const models = useStore((state) => state.models);
  const selectedModel = useStore((state) => state.selectedModel);
  const setSelectedModel = useStore((state) => state.setSelectedModel);
  const fetchModels = useStore((state) => state.fetchModels);
  const downloadModel = useStore((state) => state.downloadModel);
  const isDownloading = useStore((state) => state.isDownloading);
  const downloadProgress = useStore((state) => state.downloadProgress);
  const templates = useStore((state) => state.templates);
  const fetchTemplates = useStore((state) => state.fetchTemplates);
  const saveAsTemplate = useStore((state) => state.saveAsTemplate);
  const applyTemplate = useStore((state) => state.applyTemplate);
  const resetSettings = useStore((state) => state.resetSettings);
  const [activeTab, setActiveTab] = useState('roleplay');
  const [showSaveWorldForm, setShowSaveWorldForm] = useState(false);
  const [worldName, setWorldName] = useState('');
  const [worldDescription, setWorldDescription] = useState('');
  const [isSavingWorld, setIsSavingWorld] = useState(false);

  // Re-fetch if initialize() hadn't finished loading templates when this page mounted
  useEffect(() => {
    if (templates.length === 0) fetchTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // tabs: 'roleplay' (world + roleplay), 'persona', 'general', 'integrations'

  // Format last saved time
  const getLastSavedText = () => {
    if (!lastSaved) return '';
    const now = new Date();
    const diff = Math.floor((now - lastSaved) / 1000); // seconds
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    return lastSaved.toLocaleTimeString();
  };

  // Handle template selection — fetches the world's full settings and applies them.
  // The templates list only carries { id, name, isUserTemplate }; applyTemplate()
  // loads the full world via GET /api/templates/:id before applying.
  const handleTemplateSelect = async (template) => {
    await applyTemplate(template || null);
  };

  // Handle character mode toggle (single vs multi)
  const handleCharacterModeChange = (characterMode) => {
    setSettings({
      ...settings,
      roleplay: {
        ...settings.roleplay,
        characterMode
      },
      meta: {
        ...settings.meta,
        lastModified: new Date().toISOString()
      }
    });
  };

  // Handle reset to defaults — clears active settings server-side and re-pulls
  // oread-cli's canonical defaults (no client-side default copy).
  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      const result = await resetSettings();
      alert(result.success ? 'Settings reset to defaults' : `Reset failed: ${result.error}`);
    }
  };

  const handleSaveWorld = async () => {
    if (!worldName.trim()) return;
    setIsSavingWorld(true);
    const result = await saveAsTemplate(worldName.trim(), worldDescription.trim());
    setIsSavingWorld(false);
    if (result.success) {
      setWorldName('');
      setWorldDescription('');
      setShowSaveWorldForm(false);
    }
  };

  return (
    <div className="settings">
      {/* Navigation Tabs */}
      <div className="settings__tabs">
        <button
          className={`settings__tab ${activeTab === 'roleplay' ? 'settings__tab--active' : ''}`}
          onClick={() => setActiveTab('roleplay')}
        >
          Roleplay Settings
        </button>
        <button
          className={`settings__tab ${activeTab === 'persona' ? 'settings__tab--active' : ''}`}
          onClick={() => setActiveTab('persona')}
        >
        You / User
        </button>
        <button
          className={`settings__tab ${activeTab === 'general' ? 'settings__tab--active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          Model
        </button>
      </div>

      {/* Action bar: save status left, save world right */}
      <div className="settings__action-bar">
        <div className="settings__save-status-area">
          {isSavingSettings ? (
            <span className="settings__save-status--saving">Saving changes...</span>
          ) : lastSaved ? (
            <span className="settings__save-status--saved">All changes saved {getLastSavedText()}</span>
          ) : null}
        </div>
        <div className="settings__action-bar-right">
          {!showSaveWorldForm ? (
            <Button
              onClick={() => setShowSaveWorldForm(true)}
              variant="secondary"
              className="settings__save-world-btn"
            >
              Save as World
            </Button>
          ) : (
            <div className="settings__save-world-form">
              <input
                type="text"
                value={worldName}
                onChange={(e) => setWorldName(e.target.value)}
                placeholder="World name..."
                className="settings__save-world-input"
                maxLength={200}
                autoFocus
              />
              <input
                type="text"
                value={worldDescription}
                onChange={(e) => setWorldDescription(e.target.value)}
                placeholder="Description (optional)"
                className="settings__save-world-input"
                maxLength={1000}
              />
              <Button
                onClick={handleSaveWorld}
                variant="primary"
                disabled={!worldName.trim() || isSavingWorld}
              >
                {isSavingWorld ? 'Saving...' : 'Save'}
              </Button>
              <Button
                onClick={() => { setShowSaveWorldForm(false); setWorldName(''); setWorldDescription(''); }}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="settings__content">
        {/* Roleplay Settings Tab (world templates + world/narrative/character config) */}
        {activeTab === 'roleplay' && (
          <div className="settings__tab-content">
            <CollapsibleSection
              title="Choose Your World"
              description="Choose a preset or saved world to quickly configure your settings"
              defaultExpanded={true}
            >
              <TemplateSelector
                selectedTemplateId={settings.meta?.templateId}
                onSelect={handleTemplateSelect}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="World Settings"
              description="Configure the world and setting for roleplay"
              defaultExpanded={false}
            >
              <WorldSettingsPanel
                settings={settings}
                onChange={setSettings}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Narrative Settings"
              description="Configure narrative style, pacing, and rules"
              defaultExpanded={false}
            >
              <NarrativeSettingsPanel
                settings={settings}
                onChange={setSettings}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Character Configuration"
              description="Configure characters for roleplay mode"
              defaultExpanded={false}
            >
              <div className="settings__character-mode">
                <label className="settings__label">Character Mode</label>
                <Dropdown
                  options={[
                    { value: 'single', label: 'Single Character (AI plays one character)' },
                    { value: 'multi', label: 'Multiple Characters (AI plays multiple characters)' }
                  ]}
                  value={settings.roleplay.characterMode}
                  onChange={handleCharacterModeChange}
                />
                <p className="settings__hint">
                  Single: AI embodies one specific character. Multi: AI can play multiple characters as needed.
                </p>
              </div>

              {settings.roleplay.characterMode === 'single' && (
                <div className="settings__single-character">
                  <CharacterEditor
                    inlineCharacter={settings.roleplay.character}
                    onCharacterChange={(updatedCharacter) => {
                      setSettings({
                        ...settings,
                        roleplay: {
                          ...settings.roleplay,
                          character: updatedCharacter
                        }
                      });
                    }}
                    mode="single"
                  />
                </div>
              )}

              {settings.roleplay.characterMode === 'multi' && (
                <div className="settings__multiple-characters">
                  <CharacterList
                    characters={settings.roleplay.characters || []}
                    onCharactersChange={(updatedCharacters) => {
                      setSettings({
                        ...settings,
                        roleplay: {
                          ...settings.roleplay,
                          characters: updatedCharacters
                        }
                      });
                    }}
                    activeCharacterIndex={settings.roleplay.activeCharacterIndex || 0}
                    onActiveCharacterChange={(index) => {
                      setSettings({
                        ...settings,
                        roleplay: {
                          ...settings.roleplay,
                          activeCharacterIndex: index
                        }
                      });
                    }}
                  />
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Reset to Defaults"
              description="Reset all settings to their default values. This action cannot be undone."
              defaultExpanded={false}
            >
              <Button onClick={handleReset} variant="secondary">
                Reset to Defaults
              </Button>
            </CollapsibleSection>
          </div>
        )}

        {/* User Persona Tab */}
        {activeTab === 'persona' && (
          <div className="settings__tab-content">
            <CollapsibleSection
              title="User Persona & Preferences"
              description="Help the AI understand you better across all modes"
              defaultExpanded={true}
            >
              <UserPersonaPanel
                settings={settings}
                onChange={setSettings}
              />
            </CollapsibleSection>
          </div>
        )}

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="settings__tab-content">
            <CollapsibleSection
              title="Generation Parameters"
              description="Configure model behavior and generation settings"
              defaultExpanded={false}
            >
              <GeneralSettingsPanel
                settings={settings}
                onChange={setSettings}
                models={models}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Model Selection"
              description="Select the currently active model for chat"
              defaultExpanded={true}
            >
              <ModelSelector
                models={models}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onRefreshModels={fetchModels}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Download Models"
              description="Download new models from Ollama library or HuggingFace"
              defaultExpanded={false}
            >
              <ModelDownloader
                onDownloadModel={downloadModel}
                isDownloading={isDownloading}
                downloadProgress={downloadProgress}
              />
              <div className="settings__info">
                <p><strong>Ollama Library:</strong> llama2, mistral, codellama, etc.</p>
                <p><strong>HuggingFace:</strong> hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF</p>
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}
