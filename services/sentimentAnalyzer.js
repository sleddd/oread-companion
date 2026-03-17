/**
 * Emotion analysis using GoEmotions dataset (28 fine-grained emotions).
 * Runs locally via @huggingface/transformers (ONNX runtime).
 * Model: SamLowe/roberta-base-go_emotions-onnx (~125MB, cached after first download)
 *
 * Returns: { label: 'joy'|'anger'|..., score: 0.0-1.0 }
 * Full label set (27 emotions + neutral):
 *   admiration, amusement, anger, annoyance, approval, caring, confusion,
 *   curiosity, desire, disappointment, disapproval, disgust, embarrassment,
 *   excitement, fear, gratitude, grief, joy, love, nervousness, optimism,
 *   pride, realization, relief, remorse, sadness, surprise, neutral
 */

let pipeline = null;
let emotionPipeline = null;
let loadingPromise = null;
let loadFailed = false;

const MODEL_NAME = 'SamLowe/roberta-base-go_emotions-onnx';

// Valence groupings for trend detection
const POSITIVE_EMOTIONS = new Set([
  'admiration', 'amusement', 'approval', 'caring', 'curiosity', 'desire',
  'excitement', 'gratitude', 'joy', 'love', 'optimism', 'pride', 'relief', 'surprise'
]);
const NEGATIVE_EMOTIONS = new Set([
  'anger', 'annoyance', 'disappointment', 'disapproval', 'disgust',
  'embarrassment', 'fear', 'grief', 'nervousness', 'remorse', 'sadness'
]);
// Remaining: confusion, realization, neutral → treated as neutral valence

/**
 * Get the valence category of an emotion label.
 * @param {string} label - GoEmotions label
 * @returns {'positive'|'negative'|'neutral'}
 */
export function getValence(label) {
  if (POSITIVE_EMOTIONS.has(label)) return 'positive';
  if (NEGATIVE_EMOTIONS.has(label)) return 'negative';
  return 'neutral';
}

/**
 * Initialize the emotion classification pipeline. Called once on first use.
 * Model is downloaded automatically and cached in ~/.cache/huggingface.
 */
async function loadPipeline() {
  if (emotionPipeline) return emotionPipeline;
  if (loadFailed) return null;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const { pipeline: createPipeline } = await import('@huggingface/transformers');
      pipeline = createPipeline;
      emotionPipeline = await pipeline('text-classification', MODEL_NAME, {
        quantized: true,
      });
      console.log('✅ Emotion model loaded (GoEmotions)');
      return emotionPipeline;
    } catch (err) {
      console.warn('⚠️ Emotion model failed to load (non-critical):', err.message);
      loadFailed = true;
      return null;
    }
  })();

  return loadingPromise;
}

/**
 * Analyze emotion of a text string.
 *
 * @param {string} text - The text to analyze
 * @returns {Promise<{ label: string, score: number }|null>} Emotion result or null if unavailable
 */
export async function analyzeSentiment(text) {
  if (!text || text.trim().length < 3) return null;

  const pipe = await loadPipeline();
  if (!pipe) return null;

  try {
    // Truncate long text — model max is 512 tokens, ~200 words is safe
    const truncated = text.length > 800 ? text.substring(0, 800) : text;
    const results = await pipe(truncated, { top_k: 1 });

    if (results && results.length > 0) {
      const result = results[0];
      return {
        label: result.label,
        score: Math.round(result.score * 100) / 100,
      };
    }
  } catch (err) {
    console.warn('Emotion analysis error:', err.message);
  }

  return null;
}

/**
 * Convert a sentiment trail into a human-readable trajectory description.
 *
 * @param {Array<{ label: string, score: number, turn: number }>} trail - Recent emotion entries
 * @param {number} currentTurn - Current turn number
 * @returns {string} Description like "joy (stable)" or "sadness (shifted from joy 2 turns ago)"
 */
export function describeSentimentTrajectory(trail, currentTurn) {
  if (!trail || trail.length === 0) return '';

  const latest = trail[trail.length - 1];
  const label = latest.label;

  if (trail.length === 1) {
    return `${label} (${latest.score > 0.8 ? 'strong' : 'mild'})`;
  }

  // Check for shifts
  const previous = trail[trail.length - 2];
  if (previous.label !== latest.label) {
    const turnsAgo = currentTurn - previous.turn;
    return `${label} (shifted from ${previous.label} ${turnsAgo} turn${turnsAgo !== 1 ? 's' : ''} ago)`;
  }

  // Check for valence trending across last 3 entries
  if (trail.length >= 3) {
    const valences = trail.slice(-3).map(t => {
      const v = getValence(t.label);
      return v === 'positive' ? 1 : v === 'negative' ? -1 : 0;
    });
    const trend = valences[2] - valences[0];
    if (trend > 0) return `${label} (trending more positive)`;
    if (trend < 0) return `${label} (trending more negative)`;
  }

  return `${label} (stable)`;
}

/**
 * Pre-download the model. Called during install/setup.
 */
export async function preloadModel() {
  console.log('📥 Pre-loading emotion model (GoEmotions)...');
  const pipe = await loadPipeline();
  if (pipe) {
    // Run a warm-up inference
    await analyzeSentiment('Hello, this is a test.');
    console.log('✅ Emotion model ready');
  }
}
