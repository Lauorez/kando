import { spawn } from 'node:child_process';
import { once } from 'node:events';

export async function start(database, env = {}) {
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATABASE_PATH: database, MCP_PUBLIC_URL: '', MCP_TOKEN: '', MCP_ALLOWED_HOSTS: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (data) => { errors += data; });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(Error('Server startup timeout: ' + errors)); }, 10000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
  return { url, stop: async () => { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; } };
}
