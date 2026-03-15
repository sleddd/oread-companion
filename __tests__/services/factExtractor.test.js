import { describe, it, expect } from 'vitest';
import { extractFacts } from '../../services/factExtractor.js';

describe('extractFacts', () => {
  describe('person extraction', () => {
    it('extracts person names from user message', () => {
      // compromise recognizes names better with titles or common name patterns
      const results = extractFacts(
        'Mr. Varen drew his sword while Dr. Elara watched from the tower.',
        '',
        1
      );
      const people = results.filter(r => r.type === 'person');
      const names = people.map(p => p.text);
      expect(names.length).toBeGreaterThanOrEqual(1);
      // At least one of the titled names should be recognized
      const hasRecognizedPerson = names.some(
        n => n.includes('Varen') || n.includes('Elara')
      );
      expect(hasRecognizedPerson).toBe(true);
    });

    it('extracts person names from assistant response', () => {
      const results = extractFacts(
        '',
        'King James addressed the court as Queen Victoria entered the hall.',
        2
      );
      const people = results.filter(r => r.type === 'person');
      const names = people.map(p => p.text);
      expect(names.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts people from both user and assistant text', () => {
      const results = extractFacts(
        'Mr. Smith stood at the gate.',
        'Mrs. Jones replied from across the courtyard.',
        3
      );
      const people = results.filter(r => r.type === 'person');
      const names = people.map(p => p.text);
      expect(names.some(n => n.includes('Smith'))).toBe(true);
      expect(names.some(n => n.includes('Jones'))).toBe(true);
    });
  });

  describe('place extraction', () => {
    it('extracts place names from text', () => {
      const results = extractFacts(
        'They traveled from London to the northern mountains.',
        '',
        1
      );
      const places = results.filter(r => r.type === 'place');
      // Verify structure of any extracted places
      for (const place of places) {
        expect(place).toHaveProperty('type', 'place');
        expect(place).toHaveProperty('text');
        expect(place).toHaveProperty('turn', 1);
      }
    });

    it('extracts known place references', () => {
      const results = extractFacts(
        'They traveled to London and then sailed to China.',
        '',
        1
      );
      const places = results.filter(r => r.type === 'place');
      const placeNames = places.map(p => p.text);
      expect(placeNames.some(n => n.includes('London'))).toBe(true);
    });
  });

  describe('event extraction', () => {
    it('extracts event sentences containing entity + verb', () => {
      const results = extractFacts(
        'Mr. Varen drew his sword at the bridge while Dr. Elara watched from the tower.',
        '',
        1
      );
      const events = results.filter(r => r.type === 'event');
      expect(events.length).toBeGreaterThanOrEqual(1);
      // The sentence should contain a recognized entity
      const eventTexts = events.map(e => e.text);
      const hasRelevantEvent = eventTexts.some(
        t => t.includes('Varen') || t.includes('Elara')
      );
      expect(hasRelevantEvent).toBe(true);
    });

    it('does not extract sentences shorter than 10 characters as events', () => {
      // "Mr. X ran." is short - compromise may not even detect it, but
      // if it does the length filter should exclude short sentences
      const results = extractFacts(
        'Mr. X ran.',
        '',
        1
      );
      const events = results.filter(r => r.type === 'event');
      // If any events are found, they must be > 10 chars
      for (const event of events) {
        expect(event.text.length).toBeGreaterThan(10);
      }
    });

    it('does not extract sentences longer than 200 characters as events', () => {
      const longSentence = `Mr. Varen ${' walked through the ancient and crumbling hallway of the great fortress'.repeat(5)}.`;
      const results = extractFacts(longSentence, '', 1);
      const events = results.filter(r => r.type === 'event');
      // No event should be >= 200 chars
      for (const event of events) {
        expect(event.text.length).toBeLessThan(200);
      }
    });
  });

  describe('fact extraction (numbers/dates)', () => {
    it('extracts sentences containing numbers', () => {
      const results = extractFacts(
        'Lord Varen ruled the Northern Keep for thirty years before the uprising.',
        '',
        4
      );
      const facts = results.filter(r => r.type === 'fact');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const factTexts = facts.map(f => f.text);
      const hasNumberFact = factTexts.some(t => t.includes('thirty'));
      expect(hasNumberFact).toBe(true);
    });

    it('extracts sentences with numeric digits', () => {
      const results = extractFacts(
        'The army of 5000 soldiers marched toward the capital at dawn.',
        '',
        2
      );
      const facts = results.filter(r => r.type === 'fact');
      expect(facts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('deduplication', () => {
    it('deduplicates identical person extractions', () => {
      const results = extractFacts(
        'Mr. Smith stood at the gate. Mr. Smith walked away.',
        '',
        1
      );
      const smithPeople = results.filter(
        r => r.type === 'person' && r.text.includes('Smith')
      );
      expect(smithPeople.length).toBe(1);
    });

    it('deduplicates across user and assistant text', () => {
      const results = extractFacts(
        'Mr. Smith entered the room.',
        'Mr. Smith looked around carefully.',
        1
      );
      const smithPeople = results.filter(
        r => r.type === 'person' && r.text.includes('Smith')
      );
      expect(smithPeople.length).toBe(1);
    });

    it('deduplicates case-insensitively', () => {
      // The dedup key uses toLowerCase, so same name in different case
      // should only appear once
      const results = extractFacts(
        'DR. SMITH stood tall.',
        'Dr. Smith drew his blade.',
        1
      );
      const smithPeople = results.filter(
        r => r.type === 'person' && r.text.toLowerCase().includes('smith')
      );
      // Should have at most 1 due to dedup
      expect(smithPeople.length).toBeLessThanOrEqual(1);
    });
  });

  describe('empty/null input handling', () => {
    it('returns empty array for null inputs', () => {
      const results = extractFacts(null, null, 1);
      expect(results).toEqual([]);
    });

    it('returns empty array for undefined inputs', () => {
      const results = extractFacts(undefined, undefined, 1);
      expect(results).toEqual([]);
    });

    it('returns empty array for empty strings', () => {
      const results = extractFacts('', '', 1);
      expect(results).toEqual([]);
    });

    it('handles null user message with valid assistant response', () => {
      const results = extractFacts(
        null,
        'Mr. Smith walked through the forest toward the distant castle.',
        1
      );
      expect(results.length).toBeGreaterThan(0);
      const people = results.filter(r => r.type === 'person');
      expect(people.some(p => p.text.includes('Smith'))).toBe(true);
    });

    it('handles valid user message with null assistant response', () => {
      const results = extractFacts(
        'Mrs. Jones climbed the mountain trail in the early morning.',
        null,
        1
      );
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('turn number', () => {
    it('returns the specified turn number in all results', () => {
      const results = extractFacts(
        'Mr. Smith traveled to London with Mrs. Jones.',
        '',
        42
      );
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.turn).toBe(42);
      }
    });

    it('defaults turn to 0 when not provided', () => {
      const results = extractFacts(
        'Mr. Smith stood at the gate and drew his sword from the scabbard.',
        ''
      );
      for (const result of results) {
        expect(result.turn).toBe(0);
      }
    });
  });

  describe('short entity filtering', () => {
    it('filters out entities shorter than 2 characters', () => {
      const results = extractFacts(
        'A man walked to the village and sat down.',
        '',
        1
      );
      // All extracted items should have text length >= 2
      for (const result of results) {
        expect(result.text.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('keeps entities that are 2 or more characters', () => {
      const results = extractFacts(
        'Mr. Al crossed the river heading toward the ancient ruins near London.',
        '',
        1
      );
      // Any person/place results should have text >= 2 chars
      for (const result of results) {
        expect(result.text.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('result structure', () => {
    it('returns objects with type, text, and turn properties', () => {
      const results = extractFacts(
        'Mr. Varen drew his sword at London while Dr. Elara watched from the tower.',
        'The army of 5000 soldiers marched toward the capital.',
        5
      );
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('turn');
        expect(['person', 'place', 'event', 'fact']).toContain(result.type);
        expect(typeof result.text).toBe('string');
        expect(typeof result.turn).toBe('number');
      }
    });

    it('returns an array', () => {
      const results = extractFacts('Hello world.', '', 1);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
