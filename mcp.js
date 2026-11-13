import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createMcpAccess, checkMcpRequest } from './mcp-access.js';

const status = z.enum(['backlog', 'todo', 'doing', 'done']);
const priority = z.enum(['low', 'medium', 'high']);
const fields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10000).optional(),
  status: status.optional(),
  priority: priority.optional(),
  dueDate: z.string().describe('YYYY-MM-DD oder leer, um das Datum zu entfernen.').optional(),
};
const id = z.string().uuid().describe('ID der Aufgabe.');
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
export function createMcpServer(store) {
  const server = new McpServer({ name: 'kando', version: '0.2.0' }, { maxToolInputElements: 100 });
  const tool = (name, description, inputSchema, annotations, run) => server.registerTool(name, { description, inputSchema, annotations }, async (input) => {
    try {
      const result = await run(input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const message = error.code?.startsWith('ERR_SQLITE') ? 'Datenbankfehler.' : error.message;
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  tool('list_tasks', 'Aufgaben lesen, nach Titel/Beschreibung suchen und nach Status oder Priorität filtern.', { query: z.string().optional(), status: status.optional(), priority: priority.optional() }, readOnly, (input) => ({
    tasks: store.list().filter((task) => (!input.status || task.status === input.status) && (!input.priority || task.priority === input.priority) && (!input.query || `${task.title} ${task.description}`.toLocaleLowerCase('de').includes(input.query.toLocaleLowerCase('de')))),
  }));
  tool('get_task', 'Eine Aufgabe anhand ihrer ID lesen.', { id }, readOnly, ({ id }) => ({ task: store.get(id) }));
  tool('create_task', 'Neue Aufgabe erstellen. Standard: todo, Priorität medium.', fields, write, (input) => ({ task: store.create(input) }));
  tool('update_task', 'Felder einer Aufgabe ändern. Nicht angegebene Felder bleiben erhalten.', { id, ...fields, title: fields.title.optional() }, { ...write, idempotentHint: true }, ({ id, ...input }) => ({ task: store.update(id, input) }));
  tool('move_task', 'Aufgabe in eine Kanban-Spalte verschieben: backlog, todo, doing oder done.', { id, status }, { ...write, idempotentHint: true }, ({ id, status }) => ({ task: store.update(id, { status }) }));
  tool('delete_task', 'Eine Aufgabe dauerhaft löschen.', { id }, { ...write, destructiveHint: true, idempotentHint: true }, ({ id }) => store.delete(id));
  return server;
}

export async function handleMcp(req, res, store, access = createMcpAccess()) {
  const reject = (code, message) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }));
  };
  const accessError = checkMcpRequest(req, access);
  if (accessError) return reject(403, accessError);
  const token = access.token;
  if (token) {
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(req.headers.authorization || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="KanDo MCP"');
      return reject(401, 'MCP-Token erforderlich.');
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reject(405, 'Dieser zustandslose MCP-Endpunkt unterstützt POST.');
  }
  const server = createMcpServer(store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.once('close', () => { void server.close().catch(console.error); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
