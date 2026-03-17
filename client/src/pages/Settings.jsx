import { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import ModelSelector from '../components/model/ModelSelector';
import ModelDownloader from '../components/model/ModelDownloader';
import TemplateSelector from '../components/settings/TemplateSelector';
import ModeSelector from '../components/settings/ModeSelector';
import SettingsSection from '../components/settings/SettingsSection';
import CollapsibleSection from '../components/settings/CollapsibleSection';
import WorldSettingsPanel from '../components/settings/WorldSettingsPanel';
import NarrativeSettingsPanel from '../components/settings/NarrativeSettingsPanel';
import CharacterEditor from '../components/settings/CharacterEditor';
import CharacterList from '../components/settings/CharacterList';
import UtilitySettingsPanel from '../components/settings/UtilitySettingsPanel';
import UserPersonaPanel from '../components/settings/UserPersonaPanel';
import GeneralSettingsPanel from '../components/settings/GeneralSettingsPanel';
import Button from '../components/ui/Button';
import Dropdown from '../components/ui/Dropdown';
import { exportSettings, importSettings, copySettingsToClipboard } from '../utils/settingsImportExport';
import { DEFAULT_SETTINGS } from '../data/defaultSettings';
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
  const [activeTab, setActiveTab] = useState('mode');
  const [showSaveWorldForm, setShowSaveWorldForm] = useState(false);
  const [worldName, setWorldName] = useState('');
  const [worldDescription, setWorldDescription] = useState('');
  const [isSavingWorld, setIsSavingWorld] = useState(false);

  // Re-fetch if initialize() hadn't finished loading templates when this page mounted
  useEffect(() => {
    if (templates.length === 0) fetchTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 'mode', 'roleplay', 'utility', 'persona', 'general', 'sessions', 'integrations'

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

  // Handle template selection — loads the world's full settings.
  // Edits made while a user template is active are saved back to that template
  // automatically via the backend (PUT /api/templates/active propagates to the world file).
  const handleTemplateSelect = async (template) => {
    if (template) {
      setSettings({
        ...template.settings,
        meta: {
          ...template.settings.meta,
          templateId: template.id,
          isUserTemplate: template.isUserTemplate || false,
          lastModified: new Date().toISOString()
        }
      });
    } else {
      // Clear template - reset to defaults but keep user's customizations
      setSettings({
        ...settings,
        meta: {
          ...settings.meta,
          templateId: null,
          lastModified: new Date().toISOString()
        }
      });
    }
  };

  // Handle mode toggle
  const handleModeChange = (mode) => {
    setSettings({
      ...settings,
      mode,
      meta: {
        ...settings.meta,
        lastModified: new Date().toISOString()
      }
    });
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

  // Handle export
  const handleExport = () => {
    const result = exportSettings(settings, 'ollama-chat-settings.json');
    if (result.success) {
      alert('Settings exported successfully!');
    } else {
      alert(`Export failed: ${result.error}`);
    }
  };

  // Handle import
  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const result = await importSettings(file);
    if (result.success) {
      setSettings(result.settings);
      alert('Settings imported successfully!');
    } else {
      alert(`Import failed: ${result.error}`);
    }

    // Reset file input
    event.target.value = '';
  };

  // Handle copy to clipboard
  const handleCopyToClipboard = async () => {
    const result = await copySettingsToClipboard(settings);
    if (result.success) {
      alert('Settings copied to clipboard!');
    } else {
      alert(`Copy failed: ${result.error}`);
    }
  };

  // Handle reset to defaults
  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      setSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      alert('Settings reset to defaults');
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
          className={`settings__tab ${activeTab === 'mode' ? 'settings__tab--active' : ''}`}
          onClick={() => setActiveTab('mode')}
        >
          Mode
        </button>
        <button
          className={`settings__tab ${activeTab === 'roleplay' ? 'settings__tab--active' : ''}`}
          onClick={() => setActiveTab('roleplay')}
        >
          Roleplay Mode
        </button>
        <button
          className={`settings__tab ${activeTab === 'utility' ? 'settings__tab--active' : ''}`}
          onClick={() => setActiveTab('utility')}
        >
         Assistant Mode
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
        <button
          className={`settings__tab ${activeTab === 'integrations' ? 'settings__tab--active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          Integrations
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
        {/* Mode & Templates Tab */}
        {activeTab === 'mode' && (
          <div className="settings__tab-content">
            <CollapsibleSection
              title="Mode Selection"
              description="Choose between Roleplay mode (character-based interaction) or Normal/Utility mode (standard assistant)"
              defaultExpanded={true}
            >
              <ModeSelector
                currentMode={settings.mode}
                onChange={handleModeChange}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Choose Your World"
              description="Choose a preset or saved world to quickly configure your settings"
              defaultExpanded={false}
            >
              <TemplateSelector
                selectedTemplateId={settings.meta.templateId}
                onSelect={handleTemplateSelect}
              />
            </CollapsibleSection>
          </div>
        )}

        {/* Roleplay Settings Tab */}
        {activeTab === 'roleplay' && (
          <div className="settings__tab-content">
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
          </div>
        )}

        {/* Utility Settings Tab */}
        {activeTab === 'utility' && (
          <div className="settings__tab-content">
            <CollapsibleSection
              title="Assistant Mode"
              description="Configure how the assistant behaves in non-roleplay mode"
              defaultExpanded={true}
            >
              <UtilitySettingsPanel
                settings={settings}
                onChange={setSettings}
              />
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

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="settings__tab-content">
            <CollapsibleSection
              title="Import & Export"
              description="Backup, restore, and manage your settings"
              defaultExpanded={true}
            >
              <div className="settings__integration-actions">
                <div className="settings__integration-group">
                  <h4 className="settings__integration-title">Export Settings</h4>
                  <p className="settings__integration-hint">
                    Download your current settings as a JSON file for backup or sharing.
                  </p>
                  <Button onClick={handleExport} variant="secondary">
                    Export Settings
                  </Button>
                </div>

                <div className="settings__integration-group">
                  <h4 className="settings__integration-title">Import Settings</h4>
                  <p className="settings__integration-hint">
                    Load settings from a previously exported JSON file.
                  </p>
                  <label className="btn btn--secondary">
                    Import Settings
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImport}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <div className="settings__integration-group">
                  <h4 className="settings__integration-title">Copy to Clipboard</h4>
                  <p className="settings__integration-hint">
                    Copy your settings as JSON text to paste elsewhere.
                  </p>
                  <Button onClick={handleCopyToClipboard} variant="secondary">
                    Copy to Clipboard
                  </Button>
                </div>

                <div className="settings__integration-group">
                  <h4 className="settings__integration-title">Reset to Defaults</h4>
                  <p className="settings__integration-hint">
                    Reset all settings to their default values. This action cannot be undone.
                  </p>
                  <Button onClick={handleReset} variant="secondary">
                    Reset to Defaults
                  </Button>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}
