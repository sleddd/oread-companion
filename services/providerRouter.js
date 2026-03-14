import OpenAIService from './openaiService.js';
import AnthropicService from './anthropicService.js';
import ollamaService from './ollama.js';

// Cache provider instances by key hash to avoid re-instantiation
const instanceCache = new Map();

/**
 * Infer provider from model name
 */
export function getProviderFromModel(modelName) {
  if (!modelName) return 'ollama';
  if (/^(gpt-|o[134]-|chatgpt-)/.test(modelName)) return 'openai';
  if (/^claude-/.test(modelName)) return 'anthropic';
  return 'ollama';
}

/**
 * Get a provider service instance.
 * For Ollama, returns the singleton. For cloud providers, creates/caches by API key.
 */
export function getProviderService(provider, apiKey) {
  if (provider === 'ollama') {
    return ollamaService;
  }

  if (!apiKey) {
    throw new Error(`API key required for ${provider}`);
  }

  // Simple cache key: provider + first/last 4 chars of key
  const cacheKey = `${provider}:${apiKey.slice(0, 4)}:${apiKey.slice(-4)}`;

  if (instanceCache.has(cacheKey)) {
    return instanceCache.get(cacheKey);
  }

  let service;
  switch (provider) {
    case 'openai':
      service = new OpenAIService(apiKey);
      break;
    case 'anthropic':
      service = new AnthropicService(apiKey);
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  instanceCache.set(cacheKey, service);
  return service;
}

/**
 * Clear cached instances (e.g. when API key changes)
 */
export function clearProviderCache(provider) {
  for (const key of instanceCache.keys()) {
    if (key.startsWith(`${provider}:`)) {
      instanceCache.delete(key);
    }
  }
}
