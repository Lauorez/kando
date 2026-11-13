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
  dueDate: z.string().describe('YYYY-MM-DD, or an empty string to remove the due date.').optional(),
};
const id = z.string().uuid().describe('Task ID.');
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
export function createMcpServer(store) {
  const server = new McpServer({ name: 'kando', version: '0.2.0' }, { maxToolInputElements: 100 });
  const tool = (name, description, inputSchema, annotations, run) => server.registerTool(name, { description, inputSchema, annotations }, async (input) => {
    try {
      const result = await run(input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const message = error.code?.startsWith('ERR_SQLITE') ? 'Database error.' : error.message;
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  tool('list_tasks', 'List tasks, search their titles and descriptions, and filter by status or priority.', { query: z.string().optional(), status: status.optional(), priority: priority.optional() }, readOnly, (input) => ({
    tasks: store.list().filter((task) => (!input.status || task.status === input.status) && (!input.priority || task.priority === input.priority) && (!input.query || `${task.title} ${task.description}`.toLowerCase().includes(input.query.toLowerCase()))),
  }));
  tool('get_task', 'Read a task by ID.', { id }, readOnly, ({ id }) => ({ task: store.get(id) }));
  tool('create_task', 'Create a task. Defaults: todo status and medium priority.', fields, write, (input) => ({ task: store.create(input) }));
  tool('update_task', 'Update task fields. Fields not provided are preserved.', { id, ...fields, title: fields.title.optional() }, { ...write, idempotentHint: true }, ({ id, ...input }) => ({ task: store.update(id, input) }));
  tool('move_task', 'Move a task to a Kanban column: backlog, todo, doing, or done.', { id, status }, { ...write, idempotentHint: true }, ({ id, status }) => ({ task: store.update(id, { status }) }));
  tool('delete_task', 'Permanently delete a task.', { id }, { ...write, destructiveHint: true, idempotentHint: true }, ({ id }) => store.delete(id));
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
      return reject(401, 'MCP token required.');
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reject(405, 'This stateless MCP endpoint supports POST.');
  }
  const server = createMcpServer(store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.once('close', () => { void server.close().catch(console.error); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
