import OpenAI from 'openai';

class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  async checkHealth() {
    try {
      await this.client.models.list();
      return { status: 'ok', message: 'OpenAI API is reachable' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async listModels() {
    try {
      const response = await this.client.models.list();
      const chatModels = [];

      for await (const model of response) {
        // Only include GPT and O-series chat models
        if (/^(gpt-|o[134]-|chatgpt-)/.test(model.id)) {
          chatModels.push({
            name: model.id,
            provider: 'openai',
            owned_by: model.owned_by
          });
        }
      }

      // Sort: newest/best models first
      chatModels.sort((a, b) => a.name.localeCompare(b.name));

      return { success: true, models: chatModels };
    } catch (error) {
      throw new Error(`Failed to list OpenAI models: ${error.message}`);
    }
  }

  async *chat(model, messages, options = {}) {
    const requestParams = {
      model,
      messages: [],
      stream: true
    };

    // Prepend system prompt as a system message
    if (options.systemPrompt) {
      requestParams.messages.push({ role: 'system', content: options.systemPrompt });
    }

    requestParams.messages.push(...messages);

    // Map generation options
    if (options.temperature !== undefined) {
      requestParams.temperature = options.temperature;
    }
    if (options.topP !== undefined) {
      requestParams.top_p = options.topP;
    }
    if (options.maxTokens !== undefined) {
      requestParams.max_tokens = options.maxTokens;
    }

    const stream = await this.client.chat.completions.create(requestParams);

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        // Normalize to Ollama chunk format
        yield { message: { content } };
      }
    }
  }
}

export default OpenAIService;
