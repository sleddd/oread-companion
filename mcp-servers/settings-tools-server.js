#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACTIVE_FILE = path.join(__dirname, '..', 'data', 'templates', 'active.json');

class SettingsToolsServer {
  constructor() {
    this.server = new Server({
      name: 'settings-tools-mcp-server',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_character_settings',
          description: 'Get current character settings from roleplay.json',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'analyze_messages',
          description: 'Analyze messages for new character traits, backstory, or knowledge',
          inputSchema: {
            type: 'object',
            properties: {
              messages: {
                type: 'array',
                description: 'Array of messages to analyze',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string' },
                    content: { type: 'string' }
                  }
                }
              },
              focus: {
                type: 'string',
                description: 'What to focus on (personality, backstory, knowledge, etc.)',
                default: 'all'
              }
            },
            required: ['messages']
          }
        },
        {
          name: 'propose_character_update',
          description: 'Propose updates to character settings',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Category to update (personality, backstory, knowledge, etc.)',
                enum: ['personality', 'backstory', 'knowledge', 'appearance', 'voice']
              },
              additions: {
                type: 'string',
                description: 'New content to add'
              },
              confidence: {
                type: 'number',
                description: 'Confidence score 0-1',
                minimum: 0,
                maximum: 1
              }
            },
            required: ['category', 'additions', 'confidence']
          }
        },
        {
          name: 'propose_world_update',
          description: 'Propose updates to world/setting lore',
          inputSchema: {
            type: 'object',
            properties: {
              additions: {
                type: 'string',
                description: 'New lore content to add'
              },
              confidence: {
                type: 'number',
                description: 'Confidence score 0-1',
                minimum: 0,
                maximum: 1
              }
            },
            required: ['additions', 'confidence']
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_character_settings':
            return await this.getCharacterSettings();
          case 'analyze_messages':
            return await this.analyzeMessages(args);
          case 'propose_character_update':
            return await this.proposeCharacterUpdate(args);
          case 'propose_world_update':
            return await this.proposeWorldUpdate(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: error.message })
          }]
        };
      }
    });
  }

  async getCharacterSettings() {
    try {
      const data = await fs.readFile(ACTIVE_FILE, 'utf8');
      const template = JSON.parse(data);
      const roleplay = template.settings?.roleplay;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            characterMode: roleplay?.characterMode,
            singleCharacter: roleplay?.singleCharacter,
            world: roleplay?.world
          })
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message
          })
        }]
      };
    }
  }

  async analyzeMessages(args) {
    const { messages, focus = 'all' } = args;

    // Simple analysis - extract patterns
    const analysis = {
      newTraits: [],
      newBackstory: [],
      newKnowledge: [],
      confidence: 0.5
    };

    // Join all assistant messages
    const assistantMessages = messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join(' ');

    // Simple keyword detection (in real implementation, use LLM)
    const patterns = {
      personality: /I (am|feel|prefer|enjoy|dislike|hate|love)/gi,
      backstory: /I (was|used to|grew up|learned|experienced)/gi,
      knowledge: /(know|understand|familiar with|expert in)/gi
    };

    if (focus === 'all' || focus === 'personality') {
      const matches = assistantMessages.match(patterns.personality);
      if (matches && matches.length > 2) {
        analysis.newTraits.push({
          text: 'Detected personality expressions in conversation',
          confidence: 0.6
        });
      }
    }

    if (focus === 'all' || focus === 'backstory') {
      const matches = assistantMessages.match(patterns.backstory);
      if (matches && matches.length > 2) {
        analysis.newBackstory.push({
          text: 'Detected backstory references in conversation',
          confidence: 0.6
        });
      }
    }

    if (focus === 'all' || focus === 'knowledge') {
      const matches = assistantMessages.match(patterns.knowledge);
      if (matches && matches.length > 2) {
        analysis.newKnowledge.push({
          text: 'Detected knowledge claims in conversation',
          confidence: 0.6
        });
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          analysis
        })
      }]
    };
  }

  async proposeCharacterUpdate(args) {
    const { category, additions, confidence } = args;

    // Return proposal (doesn't actually update - requires user approval)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          proposal: {
            category,
            additions,
            confidence,
            requiresApproval: true
          }
        })
      }]
    };
  }

  async proposeWorldUpdate(args) {
    const { additions, confidence } = args;

    // Return proposal (doesn't actually update - requires user approval)
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          proposal: {
            category: 'world_lore',
            additions,
            confidence,
            requiresApproval: true
          }
        })
      }]
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Settings Tools MCP server running');
  }
}

// Start server
const server = new SettingsToolsServer();
server.start().catch(console.error);
