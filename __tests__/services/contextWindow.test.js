import { describe, it, expect } from 'vitest';
import { selectMessages } from '../../services/contextWindow.js';

// Helper: estimate tokens the same way the module does
const estimateTokens = (text) => (text ? Math.ceil(text.length / 4) : 0);

// Helper: create a message
const msg = (role, content, pinned = false) => ({ role, content, pinned });

describe('selectMessages', () => {
  // ── 1. Empty session → returns empty array ──
  describe('empty session', () => {
    it('returns empty messages array and empty contextBlock when messages is empty', () => {
      const result = selectMessages({
        messages: [],
        systemPrompt: 'You are helpful.',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 1000,
      });
      expect(result.messages).toEqual([]);
      expect(result.contextBlock).toBe('');
    });

    it('returns empty messages array when messages is null', () => {
      const result = selectMessages({
        messages: null,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 1000,
      });
      expect(result.messages).toEqual([]);
      expect(result.contextBlock).toBe('');
    });

    it('returns empty messages array when messages is undefined', () => {
      const result = selectMessages({
        messages: undefined,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 1000,
      });
      expect(result.messages).toEqual([]);
      expect(result.contextBlock).toBe('');
    });
  });

  // ── 2. All messages fit within budget → returns all messages ──
  describe('all messages fit within budget', () => {
    it('returns all messages when total tokens are within budget', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', 'Hi there!'),
        msg('user', 'How are you?'),
        msg('assistant', 'I am fine.'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: 'Short.',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].content).toBe('Hello');
      expect(result.messages[1].content).toBe('Hi there!');
      expect(result.messages[2].content).toBe('How are you?');
      expect(result.messages[3].content).toBe('I am fine.');
    });

    it('does not insert gap markers when all messages are consecutive', () => {
      const messages = [
        msg('user', 'A'),
        msg('assistant', 'B'),
        msg('user', 'C'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      const gapMarkers = result.messages.filter(
        (m) => m.content === '[...earlier messages omitted...]'
      );
      expect(gapMarkers).toHaveLength(0);
    });
  });

  // ── 3. Anchor selection: first user + first assistant always included ──
  describe('anchor selection', () => {
    it('always includes first user message and first assistant reply', () => {
      const messages = [
        msg('user', 'First user message'),
        msg('assistant', 'First assistant reply'),
        msg('user', 'x'.repeat(100)),
        msg('assistant', 'y'.repeat(100)),
        msg('user', 'z'.repeat(100)),
        msg('assistant', 'w'.repeat(100)),
        msg('user', 'Latest question'),
      ];
      // Budget: system(0) + anchors(~18+~23 tokens) + last msg + a little room
      const anchorTokens =
        estimateTokens('First user message') +
        estimateTokens('First assistant reply');
      const lastMsgTokens = estimateTokens('Latest question');
      // Give just enough for anchors + last message, nothing else
      const budget = anchorTokens + lastMsgTokens + 1;

      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: budget,
      });

      const contents = result.messages.map((m) => m.content);
      expect(contents).toContain('First user message');
      expect(contents).toContain('First assistant reply');
      expect(contents).toContain('Latest question');
    });

    it('handles no user messages gracefully', () => {
      const messages = [
        msg('assistant', 'I speak first'),
        msg('assistant', 'And again'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      // Should still return messages without crashing
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });

  // ── 4. Pinned messages are included (and deduplicated from anchors) ──
  describe('pinned messages', () => {
    it('includes pinned messages in the output', () => {
      const messages = [
        msg('user', 'Start'),
        msg('assistant', 'Reply'),
        msg('user', 'Normal'),
        msg('assistant', 'Also normal'),
        msg('user', 'Important pinned', true),
        msg('assistant', 'Response'),
        msg('user', 'Latest'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      const contents = result.messages.map((m) => m.content);
      expect(contents).toContain('Important pinned');
    });

    it('deduplicates pinned messages that are also anchors', () => {
      // First user message is also pinned
      const messages = [
        msg('user', 'First and pinned', true),
        msg('assistant', 'Reply'),
        msg('user', 'Middle'),
        msg('user', 'Latest'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      // "First and pinned" should appear exactly once
      const count = result.messages.filter(
        (m) => m.content === 'First and pinned'
      ).length;
      expect(count).toBe(1);
    });
  });

  // ── 5. Budget overflow: mandatory messages exceed budget ──
  describe('budget overflow with mandatory messages', () => {
    it('includes anchors first, then pinned newest-first, always includes latest user message', () => {
      const messages = [
        msg('user', 'Anchor user'),          // anchor (idx 0)
        msg('assistant', 'Anchor assistant'), // anchor (idx 1)
        msg('user', 'Old pinned', true),      // pinned (idx 2)
        msg('user', 'New pinned', true),      // pinned (idx 3)
        msg('user', 'Middle filler'),         // normal (idx 4)
        msg('user', 'Latest message'),        // latest (idx 5)
      ];

      // Budget enough for anchors + latest + only one pinned
      const anchorCost =
        estimateTokens('Anchor user') + estimateTokens('Anchor assistant');
      const latestCost = estimateTokens('Latest message');
      const newPinnedCost = estimateTokens('New pinned');
      const budget = anchorCost + latestCost + newPinnedCost + 1;

      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: budget,
      });

      const contents = result.messages.map((m) => m.content);
      // Anchors always present
      expect(contents).toContain('Anchor user');
      expect(contents).toContain('Anchor assistant');
      // Latest always present
      expect(contents).toContain('Latest message');
      // Newest pinned wins when budget is tight
      expect(contents).toContain('New pinned');
      // Old pinned dropped due to budget
      expect(contents).not.toContain('Old pinned');
    });
  });

  // ── 6. System prompt alone exceeds budget → returns last 2 messages only ──
  describe('system prompt exceeds budget', () => {
    it('returns last 2 messages when system prompt exceeds budget', () => {
      const messages = [
        msg('user', 'First'),
        msg('assistant', 'Second'),
        msg('user', 'Third'),
        msg('assistant', 'Fourth'),
        msg('user', 'Fifth'),
      ];
      // System prompt so large it eats the entire budget
      const result = selectMessages({
        messages,
        systemPrompt: 'x'.repeat(10000),
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 100,
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('Fourth');
      expect(result.messages[1].content).toBe('Fifth');
    });

    it('returns last 2 messages when context block + system prompt exceed budget', () => {
      const messages = [
        msg('user', 'A'),
        msg('assistant', 'B'),
        msg('user', 'C'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: 'x'.repeat(200),
        storyNotes: 'y'.repeat(200),
        extractedFacts: [],
        contextBudget: 50,
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('B');
      expect(result.messages[1].content).toBe('C');
    });
  });

  // ── 7. Gap markers inserted between non-consecutive messages ──
  describe('gap markers', () => {
    it('inserts gap markers between non-consecutive selected messages', () => {
      const messages = [
        msg('user', 'First user'),           // anchor (idx 0)
        msg('assistant', 'First assistant'),  // anchor (idx 1)
        msg('user', 'x'.repeat(400)),        // filler (idx 2) - big
        msg('assistant', 'y'.repeat(400)),   // filler (idx 3) - big
        msg('user', 'z'.repeat(400)),        // filler (idx 4) - big
        msg('user', 'Last message'),         // latest (idx 5)
      ];

      // Budget: anchors + last message, but NOT the big fillers
      const anchorCost =
        estimateTokens('First user') + estimateTokens('First assistant');
      const lastCost = estimateTokens('Last message');
      const budget = anchorCost + lastCost + 5;

      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: budget,
      });

      // Should have: anchor1, anchor2, gap marker, last message
      const gapMarkers = result.messages.filter(
        (m) => m.content === '[...earlier messages omitted...]'
      );
      expect(gapMarkers.length).toBeGreaterThanOrEqual(1);
      expect(gapMarkers[0].role).toBe('system');
    });

    it('does not insert gap marker before the first message', () => {
      const messages = [
        msg('user', 'Only user'),
        msg('assistant', 'Only assistant'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      expect(result.messages[0].role).not.toBe('system');
    });
  });

  // ── 8. Context block built from story notes + extracted facts ──
  describe('context block', () => {
    it('builds context block from story notes only', () => {
      const result = selectMessages({
        messages: [msg('user', 'Hi')],
        systemPrompt: '',
        storyNotes: '  The hero is brave.  ',
        extractedFacts: [],
        contextBudget: 10000,
      });
      expect(result.contextBlock).toBe('[Story Notes]\nThe hero is brave.');
    });

    it('builds context block from extracted facts only', () => {
      const result = selectMessages({
        messages: [msg('user', 'Hi')],
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [
          { type: 'person', text: 'Alice', turn: 1 },
          { type: 'place', text: 'Wonderland', turn: 2 },
          { type: 'event', text: 'Tea party', turn: 3 },
          { type: 'fact', text: 'Cats can grin', turn: 4 },
        ],
        contextBudget: 10000,
      });
      expect(result.contextBlock).toContain('[Session Memory]');
      expect(result.contextBlock).toContain('People: Alice');
      expect(result.contextBlock).toContain('Places: Wonderland');
      expect(result.contextBlock).toContain('Events: Tea party');
      expect(result.contextBlock).toContain('Facts: Cats can grin');
    });

    it('builds context block from both story notes and extracted facts', () => {
      const result = selectMessages({
        messages: [msg('user', 'Hi')],
        systemPrompt: '',
        storyNotes: 'A dark forest.',
        extractedFacts: [
          { type: 'person', text: 'Ranger', turn: 1 },
        ],
        contextBudget: 10000,
      });
      expect(result.contextBlock).toContain('[Story Notes]');
      expect(result.contextBlock).toContain('A dark forest.');
      expect(result.contextBlock).toContain('[Session Memory]');
      expect(result.contextBlock).toContain('People: Ranger');
    });

    it('returns empty context block when no story notes or facts', () => {
      const result = selectMessages({
        messages: [msg('user', 'Hi')],
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      expect(result.contextBlock).toBe('');
    });

    it('returns empty context block when storyNotes is whitespace-only', () => {
      const result = selectMessages({
        messages: [msg('user', 'Hi')],
        systemPrompt: '',
        storyNotes: '   ',
        extractedFacts: [],
        contextBudget: 10000,
      });
      expect(result.contextBlock).toBe('');
    });

    it('groups multiple facts of the same type', () => {
      const result = selectMessages({
        messages: [msg('user', 'Hi')],
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [
          { type: 'person', text: 'Alice', turn: 1 },
          { type: 'person', text: 'Bob', turn: 2 },
        ],
        contextBudget: 10000,
      });
      expect(result.contextBlock).toContain('People: Alice, Bob');
    });
  });

  // ── 9. Pinned message that is also anchor → counted once ──
  describe('pinned message that is also anchor', () => {
    it('counts token cost only once for a message that is both anchor and pinned', () => {
      // First user msg is pinned — it's also an anchor. Should not double-count.
      const anchorContent = 'x'.repeat(100); // 25 tokens
      const messages = [
        msg('user', anchorContent, true),     // anchor + pinned
        msg('assistant', 'Short reply'),      // anchor
        msg('user', 'Filler 1'),
        msg('user', 'Filler 2'),
        msg('user', 'Latest'),
      ];

      // If double-counted, fewer recent messages would fit.
      // Budget = anchor(25) + anchor2(~3) + latest(~2) + filler2(~2) + filler1(~2) + some room
      const budget =
        estimateTokens(anchorContent) +
        estimateTokens('Short reply') +
        estimateTokens('Latest') +
        estimateTokens('Filler 1') +
        estimateTokens('Filler 2') +
        2;

      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: budget,
      });

      const contents = result.messages
        .filter((m) => m.role !== 'system')
        .map((m) => m.content);
      // All should fit because pinned-anchor is counted only once
      expect(contents).toContain(anchorContent);
      expect(contents).toContain('Short reply');
      expect(contents).toContain('Filler 1');
      expect(contents).toContain('Filler 2');
      expect(contents).toContain('Latest');
    });
  });

  // ── 10. Recent messages fill remaining budget newest→oldest ──
  describe('recent messages fill newest to oldest', () => {
    it('fills recent messages from newest to oldest after anchors', () => {
      const messages = [
        msg('user', 'Anchor U'),         // idx 0
        msg('assistant', 'Anchor A'),    // idx 1
        msg('user', 'Old msg'),          // idx 2
        msg('user', 'Mid msg'),          // idx 3
        msg('user', 'Recent msg'),       // idx 4
        msg('user', 'Latest msg'),       // idx 5
      ];

      // Budget for anchors + latest + recent + mid, but NOT old
      const budget =
        estimateTokens('Anchor U') +
        estimateTokens('Anchor A') +
        estimateTokens('Latest msg') +
        estimateTokens('Recent msg') +
        estimateTokens('Mid msg') +
        1;

      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: budget,
      });

      const contents = result.messages
        .filter((m) => m.role !== 'system')
        .map((m) => m.content);
      expect(contents).toContain('Recent msg');
      expect(contents).toContain('Mid msg');
      expect(contents).toContain('Latest msg');
      // Old msg should be excluded — budget ran out before reaching it
      expect(contents).not.toContain('Old msg');
    });

    it('preserves conversation order in output even though selection is newest-first', () => {
      const messages = [
        msg('user', 'Anchor U'),
        msg('assistant', 'Anchor A'),
        msg('user', 'Skip me'),
        msg('assistant', 'Also skip'),
        msg('user', 'Keep me'),
        msg('assistant', 'Keep too'),
        msg('user', 'Latest'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });

      // All non-system messages should be in original order
      const nonSystemMessages = result.messages.filter((m) => m.role !== 'system');
      for (let i = 1; i < nonSystemMessages.length; i++) {
        const prevIdx = messages.findIndex((m) => m.content === nonSystemMessages[i - 1].content);
        const currIdx = messages.findIndex((m) => m.content === nonSystemMessages[i].content);
        expect(currIdx).toBeGreaterThan(prevIdx);
      }
    });
  });

  // ── Edge cases ──
  describe('edge cases', () => {
    it('handles a single message', () => {
      const result = selectMessages({
        messages: [msg('user', 'Only one')],
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Only one');
    });

    it('strips pinned flag from output messages', () => {
      const messages = [
        msg('user', 'Hello', true),
        msg('assistant', 'World'),
      ];
      const result = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10000,
      });
      // Output messages only have role and content
      for (const m of result.messages) {
        expect(Object.keys(m).sort()).toEqual(['content', 'role']);
      }
    });

    it('deducts system prompt tokens from the budget', () => {
      const shortContent = 'Hi';
      const messages = [
        msg('user', shortContent),
        msg('assistant', shortContent),
        msg('user', shortContent),
        msg('assistant', shortContent),
        msg('user', shortContent),
      ];
      // With no system prompt, all fit in budget 10
      const resultNoPrompt = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10,
      });
      // With a system prompt eating budget, fewer should fit
      const resultWithPrompt = selectMessages({
        messages,
        systemPrompt: 'x'.repeat(20), // 5 tokens
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 10,
      });
      expect(resultWithPrompt.messages.length).toBeLessThanOrEqual(
        resultNoPrompt.messages.length
      );
    });

    it('deducts context block tokens from the budget', () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        msg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`)
      );
      const resultNoContext = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: '',
        extractedFacts: [],
        contextBudget: 50,
      });
      const resultWithContext = selectMessages({
        messages,
        systemPrompt: '',
        storyNotes: 'x'.repeat(80), // 20 tokens
        extractedFacts: [],
        contextBudget: 50,
      });
      expect(resultWithContext.messages.filter(m => m.role !== 'system').length)
        .toBeLessThanOrEqual(resultNoContext.messages.filter(m => m.role !== 'system').length);
    });
  });
});
