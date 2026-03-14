import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'mcp-config.json');

class MCPClientService {
  constructor() {
    this.clients = {
      vectorStore: null
    };
    this.config = null;
  }

  async initialize() {
    try {
      // Load MCP configuration
      const configData = await fs.readFile(CONFIG_PATH, 'utf8');
      this.config = JSON.parse(configData);

      console.log('🔌 Initializing MCP clients...');

      // Vector Store MCP server is DISABLED - now using SQLite directly
      console.log('ℹ️  Vector storage: SQLite (FAISS removed)');

      console.log('✅ All MCP clients initialized');
      console.log('ℹ️  SQLite and filesystem operations use direct access (not MCP)');
    } catch (error) {
      console.error('❌ MCP client initialization failed:', error);
      throw error;
    }
  }

  async connectToServer(serverName) {
    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      throw new Error(`MCP server configuration not found: ${serverName}`);
    }

    // Create transport - SDK will spawn the process internally
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env || {}
    });

    // Create client
    const client = new Client({
      name: `oread-chat-${serverName}`,
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    // Connect
    await client.connect(transport);

    // Store client
    const key = serverName === 'vector-store' ? 'vectorStore' : serverName;
    this.clients[key] = client;

    return client;
  }

  // SQLite operations (using direct access as bridge until MCP servers are available)
  async querySQLite(sql, params = []) {
    // Import database service dynamically to avoid circular dependency
    const { default: database } = await import('./database.js');
    try {
      return await database.all(sql, params);
    } catch (error) {
      console.error('SQLite query error:', error);
      throw error;
    }
  }

  async executeSQLite(sql, params = []) {
    // Import database service dynamically to avoid circular dependency
    const { default: database } = await import('./database.js');
    try {
      return await database.run(sql, params);
    } catch (error) {
      console.error('SQLite execute error:', error);
      throw error;
    }
  }

  async close() {
    // Close all MCP client connections
    for (const [name, client] of Object.entries(this.clients)) {
      if (client) {
        await client.close();
        console.log(`✅ Closed MCP client: ${name}`);
      }
    }
  }
}

export default new MCPClientService();
