/**
 * Web search via Brave LLM Context API.
 * Uses the /v1/llm/context endpoint — returns pre-extracted, LLM-optimized content
 * instead of raw search snippets. Much better for grounding AI responses.
 * Optional — only runs when webSearch is enabled and API key is configured.
 */

const BRAVE_LLM_CONTEXT_URL = 'https://api.search.brave.com/res/v1/llm/context';

// Messages too short or too casual to warrant a web search
const MIN_SEARCH_LENGTH = 15;
const CASUAL_PATTERNS = /^(hey|hi|hello|thanks|ok|sure|yes|no|good|great|fine|cool|lol|haha|bye|morning|evening|afternoon|night)\b/i;

/**
 * Check if a message is worth searching the web for.
 * Short greetings and casual chat don't need search results.
 */
export function shouldSearch(text) {
  if (!text || text.trim().length < MIN_SEARCH_LENGTH) return false;
  if (CASUAL_PATTERNS.test(text.trim())) return false;
  if (text.includes('?')) return true;
  if (/\b(who|what|when|where|why|how|latest|current|recent|news|update|search|find|look up)\b/i.test(text)) return true;
  return text.trim().length >= 30;
}

/**
 * Search the web using Brave LLM Context API.
 * Returns pre-extracted content optimized for LLM grounding.
 *
 * @param {string} query - Search query
 * @param {string} apiKey - Brave Search API key
 * @param {Object} options
 * @param {number} options.maxTokens - Max tokens in context (default 4096)
 * @param {number} options.maxUrls - Max URLs to include (default 3)
 * @param {string} options.freshness - Freshness filter: pd (24h), pw (7d), pm (31d), py (365d)
 * @returns {Promise<{ context: string, sources: Array<{ url: string, title: string }> }>}
 */
export async function searchWeb(query, apiKey, { maxTokens = 4096, maxUrls = 3, freshness } = {}) {
  if (!query || !apiKey) return { context: '', sources: [] };

  query = cleanSearchQuery(query);
  console.log(`🔍 Web search query: "${query}"`);

  try {
    const url = new URL(BRAVE_LLM_CONTEXT_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('maximum_number_of_tokens', maxTokens.toString());
    url.searchParams.set('maximum_number_of_urls', maxUrls.toString());
    url.searchParams.set('context_threshold_mode', 'balanced');
    if (freshness) {
      url.searchParams.set('freshness', freshness);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.warn(`Brave LLM Context API error: ${response.status} ${response.statusText}${errorBody ? ' — ' + errorBody.substring(0, 200) : ''}`);
      return { context: '', sources: [] };
    }

    const data = await response.json();

    // Extract grounding content
    const snippets = data.grounding?.snippets || [];
    const context = snippets.map(s => s.text || s.content || '').filter(Boolean).join('\n\n');

    // Extract source metadata
    const sources = [];
    if (data.sources) {
      for (const [sourceUrl, meta] of Object.entries(data.sources)) {
        sources.push({
          url: sourceUrl,
          title: meta.title || sourceUrl,
        });
      }
    }

    return { context, sources };
  } catch (err) {
    console.warn('Web search failed:', err.message);
    return { context: '', sources: [] };
  }
}

/**
 * Format LLM context results as a context block for injection into the prompt.
 *
 * @param {{ context: string, sources: Array<{ url: string, title: string }> }} results
 * @returns {string} Formatted context block
 */
export function formatSearchResults(results) {
  if (!results || !results.context) return '';

  let block = `[Web Search Results — USE THESE AS YOUR PRIMARY SOURCE. Do not rely on training data when search results are available. Cite sources when relevant.]\n\n`;
  block += results.context;

  if (results.sources?.length > 0) {
    block += '\n\nSources:\n';
    block += results.sources.map(s => `- ${s.title}: ${s.url}`).join('\n');
  }

  return block;
}

/**
 * Clean a conversational message into a better search query.
 * Strips filler words, roleplay context, and conversational noise.
 */
function cleanSearchQuery(text) {
  let q = text.trim();

  // Remove roleplay actions in asterisks or parentheses
  q = q.replace(/\*[^*]+\*/g, '').replace(/\([^)]+\)/g, '');

  // Remove conversational filler
  q = q.replace(/\b(well|so|hey|ok|alright|actually|basically|like|just|really|please|can you|could you|tell me|I want to know|I was wondering|do you know)\b/gi, '');

  // Remove "and the year is XXXX" → append year directly
  const yearMatch = q.match(/\b(?:the year is|it's|it is|we're in|this is)\s*(\d{4})\b/i);
  if (yearMatch) {
    q = q.replace(/\b(?:and\s+)?(?:the year is|it's|it is|we're in|this is)\s*\d{4}\b/i, '');
    q = q.trim() + ' ' + yearMatch[1];
  }

  // Remove excessive punctuation and dots
  q = q.replace(/\.{2,}/g, ' ').replace(/[!?]{2,}/g, '?');

  // Collapse whitespace
  q = q.replace(/\s+/g, ' ').trim();

  // Cap at 400 chars (API limit)
  q = q.substring(0, 400);

  if (q.length < 5) return text.trim().substring(0, 400);

  return q;
}
