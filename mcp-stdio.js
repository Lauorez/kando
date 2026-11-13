import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp.js';
import { createStore } from './store.js';
import { fileURLToPath } from 'node:url';

// Absolute default ensures every client opens the same database regardless of cwd.
const store = createStore(process.env.DATABASE_PATH || fileURLToPath(new URL('./data/kando.sqlite', import.meta.url)));
const server = createMcpServer(store);
await server.connect(new StdioServerTransport());
server.server.onclose = () => { store.close(); };
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
