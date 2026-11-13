const localHosts = ['localhost', '127.0.0.1', '[::1]'];

export function createMcpAccess(env = process.env) {
  const allowedHosts = new Set((env.MCP_ALLOWED_HOSTS || localHosts.join(',')).split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
  let publicUrl;
  if (env.MCP_PUBLIC_URL) {
    try { publicUrl = new URL(env.MCP_PUBLIC_URL); } catch { throw Error('MCP_PUBLIC_URL must be a complete HTTPS URL.'); }
    if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/mcp') {
      throw Error('MCP_PUBLIC_URL must be an HTTPS URL with the path /mcp and no credentials, query, or fragment.');
    }
    if (!env.MCP_TOKEN?.trim()) throw Error('MCP_TOKEN is required when MCP_PUBLIC_URL is set.');
    allowedHosts.add(publicUrl.hostname);
  }
  return { allowedHosts, publicUrl, token: env.MCP_TOKEN || '' };
}

export function checkMcpRequest(req, access) {
  // Use configured public URL rather than trusting client-supplied proxy headers.
  // Tunnels may preserve the public Host or rewrite it to an allowed local Host.
  let host;
  try {
    if (typeof req.headers.host !== 'string' || /[\s/@?#,\\]/.test(req.headers.host)) throw Error();
    host = new URL(`http://${req.headers.host}`);
    if (host.pathname !== '/') throw Error();
  } catch { return 'Invalid host.'; }
  if (!access.allowedHosts.has(host.hostname)) return 'Host not allowed.';
  if (req.headers.origin !== undefined) {
    let origin;
    try {
      origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== req.headers.origin) throw Error();
    } catch { return 'Invalid origin.'; }
    const localOrigin = new URL(`${req.socket.encrypted ? 'https:' : 'http:'}//${req.headers.host}`).origin;
    if (origin.origin !== localOrigin && origin.origin !== access.publicUrl?.origin) return 'Origin not allowed.';
  }
  return null;
}
