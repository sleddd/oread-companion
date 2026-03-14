import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock dependencies
vi.mock('../utils/characterAPI', () => ({
  getCharacter: vi.fn(),
  saveCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
}));

vi.mock('../utils/characterConverter', () => ({
  characterFileToSettings: vi.fn((charFile) => charFile.character || charFile),
  generateCharacterId: vi.fn((name) => name.toLowerCase().replace(/\s+/g, '-')),
}));

// Mock UI primitives to avoid SCSS/complex dependencies
vi.mock('../components/ui/TextField', () => ({
  default: ({ value, placeholder }) => (
    <input data-testid="text-field" defaultValue={value} placeholder={placeholder} readOnly />
  ),
}));
vi.mock('../components/ui/TextArea', () => ({
  default: ({ value }) => <textarea data-testid="text-area" defaultValue={value} readOnly />,
}));
vi.mock('../components/ui/ImageUpload', () => ({
  default: () => <div data-testid="image-upload" />,
}));
vi.mock('../components/ui/MultiSelect', () => ({
  default: () => <div data-testid="multi-select" />,
}));
vi.mock('../components/ui/Button', () => ({
  default: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
}));

import { getCharacter } from '../utils/characterAPI';
import { characterFileToSettings } from '../utils/characterConverter';
import CharacterEditor from '../components/settings/CharacterEditor';

describe('CharacterEditor character loading', () => {
  const onCharacterRefChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getCharacter and renders the character name when characterRef is provided and data is returned', async () => {
    const fakeCharFile = { name: 'Echo', age: '25', gender: 'Female', species: 'AI', role: 'Companion',
      avatarImage: '', knowledgeSkills: '', hobbiesInterests: '', thingsToAvoid: '', backstory: '', inventory: '',
      traits: { emotionalExpression: [], socialEnergy: [], thinkingStyle: [], humorPersonality: [],
        coreValues: [], howTheyCare: [], energyPresence: [], lifestyleInterests: [] } };

    getCharacter.mockResolvedValue(fakeCharFile);
    characterFileToSettings.mockReturnValue(fakeCharFile);

    render(<CharacterEditor characterRef="echo" onCharacterRefChange={onCharacterRefChange} />);

    await waitFor(() => {
      expect(getCharacter).toHaveBeenCalledWith('echo');
    });

    // The name field should show 'Echo'
    const nameField = screen.getAllByTestId('text-field')[0];
    expect(nameField).toHaveValue('Echo');
  });

  it('sets character name to characterRef when getCharacter returns null', async () => {
    getCharacter.mockResolvedValue(null);

    render(<CharacterEditor characterRef="unknown-char" onCharacterRefChange={onCharacterRefChange} />);

    await waitFor(() => {
      expect(getCharacter).toHaveBeenCalledWith('unknown-char');
    });

    // When not found, component uses EMPTY_CHARACTER with name = characterRef
    const nameField = screen.getAllByTestId('text-field')[0];
    expect(nameField).toHaveValue('unknown-char');
  });

  it('renders without crashing and shows empty state when getCharacter throws', async () => {
    getCharacter.mockRejectedValue(new Error('Network error'));

    render(<CharacterEditor characterRef="bad-ref" onCharacterRefChange={onCharacterRefChange} />);

    await waitFor(() => {
      expect(getCharacter).toHaveBeenCalledWith('bad-ref');
    });

    // On error, EMPTY_CHARACTER is used — name field should be empty
    const nameField = screen.getAllByTestId('text-field')[0];
    expect(nameField).toHaveValue('');
  });

  it('does not call getCharacter when characterRef is falsy', async () => {
    render(<CharacterEditor characterRef={null} onCharacterRefChange={onCharacterRefChange} />);

    // Give effect time to run
    await waitFor(() => {
      expect(getCharacter).not.toHaveBeenCalled();
    });

    // Name field shows empty
    const nameField = screen.getAllByTestId('text-field')[0];
    expect(nameField).toHaveValue('');
  });
});
