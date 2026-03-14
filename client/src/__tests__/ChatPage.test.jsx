import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

// Mock child components so ChatPage can render in isolation
vi.mock('../components/chat/ChatInterface', () => ({
  default: () => <div data-testid="chat-interface" />,
}));
vi.mock('../components/chat/AutoUpdateSuggestions', () => ({
  default: () => <div data-testid="auto-update-suggestions" />,
}));

// We need to control currentSessionId between renders, so use a mutable object
const storeState = {
  messages: [],
  selectedModel: 'llama2',
  isSending: false,
  sendMessage: vi.fn(),
  settings: {
    mode: 'normal',
    roleplay: { singleCharacter: null, multipleCharacters: [], characterMode: 'single' },
    meta: { lastModified: '2026-01-01', templateId: null },
  },
  currentSessionId: null,
  createSession: vi.fn(),
  loadMessageHistory: vi.fn(),
};

vi.mock('../store/useStore', () => ({
  default: vi.fn((selector) => selector(storeState)),
}));

import ChatPage from '../pages/ChatPage';
import useStore from '../store/useStore';

describe('ChatPage session-change effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.currentSessionId = null;
    storeState.loadMessageHistory = vi.fn();
    storeState.createSession = vi.fn();
    // Reset useStore mock to use current storeState
    useStore.mockImplementation((selector) => selector(storeState));
  });

  it('calls loadMessageHistory with the session ID when currentSessionId is set on mount', async () => {
    storeState.currentSessionId = 'session-abc';

    await act(async () => {
      render(<ChatPage />);
    });

    expect(storeState.loadMessageHistory).toHaveBeenCalledWith('session-abc');
    expect(storeState.loadMessageHistory).toHaveBeenCalledTimes(1);
  });

  it('calls loadMessageHistory again when currentSessionId changes to a new value', async () => {
    storeState.currentSessionId = 'session-one';

    const { rerender } = await act(async () => render(<ChatPage />));

    expect(storeState.loadMessageHistory).toHaveBeenCalledWith('session-one');
    expect(storeState.loadMessageHistory).toHaveBeenCalledTimes(1);

    // Simulate switching to a different session
    storeState.currentSessionId = 'session-two';
    useStore.mockImplementation((selector) => selector(storeState));

    await act(async () => {
      rerender(<ChatPage />);
    });

    expect(storeState.loadMessageHistory).toHaveBeenCalledWith('session-two');
    expect(storeState.loadMessageHistory).toHaveBeenCalledTimes(2);
  });

  it('does NOT call loadMessageHistory again when re-rendered with the same currentSessionId', async () => {
    storeState.currentSessionId = 'session-same';

    const { rerender } = await act(async () => render(<ChatPage />));

    expect(storeState.loadMessageHistory).toHaveBeenCalledTimes(1);

    // Re-render with the same session ID
    await act(async () => {
      rerender(<ChatPage />);
    });

    // loadMessageHistory should NOT have been called a second time
    expect(storeState.loadMessageHistory).toHaveBeenCalledTimes(1);
  });

  it('does not call loadMessageHistory when currentSessionId is null', async () => {
    storeState.currentSessionId = null;

    await act(async () => {
      render(<ChatPage />);
    });

    expect(storeState.loadMessageHistory).not.toHaveBeenCalled();
  });
});
