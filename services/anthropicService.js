import Anthropic from '@anthropic-ai/sdk';

// Anthropic doesn't have a list-models endpoint, so we maintain a known list
const CLAUDE_MODELS = [
  { name: 'claude-sonnet-4-20250514', provider: 'anthropic', description: 'Claude Sonnet 4' },
  { name: 'claude-opus-4-20250514', provider: 'anthropic', description: 'Claude Opus 4' },
  { name: 'claude-haiku-4-5-20251001', provider: 'anthropic', description: 'Claude Haiku 4.5' },
  { name: 'claude-3-5-sonnet-20241022', provider: 'anthropic', description: 'Claude 3.5 Sonnet' },
  { name: 'claude-3-5-haiku-20241022', provider: 'anthropic', description: 'Claude 3.5 Haiku' },
];

class AnthropicService {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  async checkHealth() {
    try {
      // Minimal request to verify the key works
      await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      });
      return { status: 'ok', message: 'Anthropic API is reachable' };
    } catch (error) {
      // 401 = bad key, anything else might still be a valid connection
      if (error.status === 401) {
        return { status: 'error', message: 'Invalid API key' };
      }
      // Rate limit or other errors still mean the key works
      if (error.status === 429 || error.status === 400) {
        return { status: 'ok', message: 'Anthropic API is reachable' };
      }
      return { status: 'error', message: error.message };
    }
  }

  async listModels() {
    return { success: true, models: [...CLAUDE_MODELS] };
  }

  async *chat(model, messages, options = {}) {
    const requestParams = {
      model,
      messages: [],
      max_tokens: options.maxTokens || 2048,
      stream: true
    };

    // Anthropic requires system as a top-level param, not a message
    if (options.systemPrompt) {
      requestParams.system = options.systemPrompt;
    }

    // Filter out system messages and add the rest
    // Anthropic doesn't allow system role in messages array
    for (const msg of messages) {
      if (msg.role !== 'system') {
        requestParams.messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Map generation options
    if (options.temperature !== undefined) {
      requestParams.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      requestParams.top_p = options.topP;
    }

    const stream = await this.client.messages.stream(requestParams);

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        // Normalize to Ollama chunk format
        yield { message: { content: event.delta.text } };
      }
    }
  }
}

export default AnthropicService;
