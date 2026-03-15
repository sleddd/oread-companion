/**
 * NLP-based fact extraction using compromise.
 * Zero inference — pure rule-based NLP.
 */

import nlp from 'compromise';

/**
 * Extract facts from a user message and assistant response.
 *
 * @param {string} userMessage - The user's message content
 * @param {string} assistantResponse - The assistant's response content
 * @param {number} turn - The turn number for attribution
 * @returns {Array<{type: string, text: string, turn: number}>}
 */
export function extractFacts(userMessage, assistantResponse, turn = 0) {
  const facts = [];
  const seen = new Set();

  const addFact = (type, text) => {
    const normalized = text.trim();
    if (!normalized || normalized.length < 2) return;
    const key = `${type}:${normalized.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ type, text: normalized, turn });
  };

  const texts = [userMessage, assistantResponse].filter(Boolean);

  for (const text of texts) {
    const doc = nlp(text);

    // Extract people (proper nouns tagged as Person)
    const people = doc.people().out('array');
    for (const person of people) {
      if (person.length > 1) {
        addFact('person', person);
      }
    }

    // Extract places
    const places = doc.places().out('array');
    for (const place of places) {
      if (place.length > 1) {
        addFact('place', place);
      }
    }

    // Extract sentences with named entities + verbs (key statements)
    const sentences = doc.sentences();
    sentences.forEach(sentence => {
      const hasEntity = sentence.people().length > 0 || sentence.places().length > 0;
      const hasVerb = sentence.verbs().length > 0;

      if (hasEntity && hasVerb) {
        const sentText = sentence.text().trim();
        // Only keep reasonably-sized statements
        if (sentText.length > 10 && sentText.length < 200) {
          addFact('event', sentText);
        }
      }
    });

    // Extract sentences with numbers/dates
    sentences.forEach(sentence => {
      const hasDates = typeof sentence.dates === 'function' ? sentence.dates().length > 0 : false;
      const hasNumber = sentence.values().length > 0 || hasDates;
      if (hasNumber) {
        const sentText = sentence.text().trim();
        if (sentText.length > 10 && sentText.length < 200) {
          addFact('fact', sentText);
        }
      }
    });
  }

  return facts;
}
