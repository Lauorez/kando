import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpAccess, checkMcpRequest } from '../mcp-access.js';

const publicEnv = { MCP_PUBLIC_URL: 'https://kando.example.org/mcp', MCP_TOKEN: 'test-token' };
const request = (headers) => ({ headers, socket: {} });

test('public MCP URL configuration validates early and adds only the exact host', () => {
  const access = createMcpAccess(publicEnv);
  assert.equal(access.allowedHosts.has('kando.example.org'), true);
  assert.equal(access.allowedHosts.has('localhost'), true);
  assert.equal(access.allowedHosts.has('other.example.org'), false);
  assert.throws(() => createMcpAccess({ MCP_PUBLIC_URL: publicEnv.MCP_PUBLIC_URL }), /MCP_TOKEN/);
  for (const url of ['invalid', 'http://kando.example.org/mcp', 'https://user:pass@kando.example.org/mcp', 'https://kando.example.org/', 'https://kando.example.org/mcp?token=x', 'https://kando.example.org/mcp#x']) {
    assert.throws(() => createMcpAccess({ ...publicEnv, MCP_PUBLIC_URL: url }), /MCP_PUBLIC_URL/);
  }
});

test('tunnel requests support preserved and rewritten hosts without trusting forwarded headers', () => {
  const access = createMcpAccess(publicEnv);
  assert.equal(checkMcpRequest(request({ host: 'kando.example.org', origin: 'https://kando.example.org' }), access), null);
  assert.equal(checkMcpRequest(request({ host: 'localhost:3000', origin: 'https://kando.example.org' }), access), null);
  assert.equal(checkMcpRequest(request({ host: 'localhost:3000' }), access), null);
  assert.equal(checkMcpRequest(request({ host: 'localhost:3000', origin: 'http://localhost:3000' }), access), null);
  assert.equal(checkMcpRequest(request({ host: 'localhost:80', origin: 'http://localhost' }), access), null);
  assert.equal(checkMcpRequest(request({ host: 'internal', origin: 'https://kando.example.org' }), access), 'Host nicht erlaubt.');
  assert.equal(checkMcpRequest(request({ host: 'evil.example.org', 'x-forwarded-host': 'kando.example.org', 'x-forwarded-proto': 'https' }), access), 'Host nicht erlaubt.');
  assert.equal(checkMcpRequest(request({ host: 'localhost', origin: 'https://evil.example.org', 'x-forwarded-host': 'evil.example.org' }), access), 'Origin nicht erlaubt.');
  assert.equal(checkMcpRequest(request({ host: 'localhost', origin: 'http://kando.example.org' }), access), 'Origin nicht erlaubt.');
  assert.equal(checkMcpRequest(request({ host: 'localhost', origin: 'https://kando.example.org:444' }), access), 'Origin nicht erlaubt.');
  for (const host of [undefined, 'localhost/path', 'localhost@evil.example', 'localhost,evil.example']) assert.equal(checkMcpRequest(request({ host }), access), 'Ungültiger Host.');
  assert.equal(checkMcpRequest(request({ host: 'localhost', origin: 'null' }), access), 'Ungültiger Origin.');
  assert.equal(checkMcpRequest(request({ host: 'localhost', origin: 'https://kando.example.org' }), createMcpAccess({})), 'Origin nicht erlaubt.');
});
