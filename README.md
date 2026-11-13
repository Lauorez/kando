<img src="assets/icon.svg" width="56" height="56" alt="KanDo logo">

# KanDo

A fresh task board for every day, organized by priority, on your own server. KanDo combines a focused daily to-do list with an MCP server so AI clients can plan and manage your tasks.

**Self-hosted · SQLite · Light and dark mode · MCP · Docker**

KanDo is an early version for a personal workspace. User accounts, teams, and real-time synchronization are not available yet. It requires Node.js 24 or later, or Docker with Compose. No frontend build is needed.

## Features

- A separate board for each day, with High, Medium, and Low priority columns
- Unfinished tasks carry forward to today automatically; completed tasks stay on their planned day
- Completion checkboxes, daily progress, and an option to hide completed tasks
- Previous/next day navigation, future planning, and an All tasks view
- Drag-and-drop or a priority selector to move tasks between columns
- A planned day for each task, plus a separate optional deadline and description
- Search task titles and descriptions
- Light and dark themes, following your system by default
- English by default, with German available from the language selector
- Persistent language and theme preferences in your browser
- MCP access for AI clients over Streamable HTTP and stdio

The language selector updates the interface, dialogs, dates, accessibility labels, and errors immediately. Existing task titles and descriptions stay as written. English is the default even if your browser uses German; German is enabled only when you select it. API messages and MCP tool descriptions use English.

## Daily workflow

Open KanDo to see today's board. Add tasks directly to a priority column, then check them off as you finish. Drag a task between columns to change its priority, or use its priority selector. The **Planned for** field determines the daily board; the optional **Due date** is a separate deadline.

Use the date picker or previous/next buttons to plan another day. **All tasks** shows tasks across all dates with their planned days, including older completed work. Search and the completed-task toggle apply to the selected view.

When a new day begins, unfinished tasks from earlier days move to today, retaining their priority, description, and deadline. Completed tasks and future tasks keep their planned date. Reopening a completed task from a past day brings it to today. If KanDo was stopped for several days, unfinished tasks move straight to the current day on the next access. No duplicate tasks or daily reset jobs are created.

Rollover happens on the server when tasks are read or updated through the app, REST API, or MCP. An open, visible board refreshes every minute and on focus; refreshes pause while a task dialog is open to preserve drafts. Set `TZ` to your timezone (for example `Europe/Berlin`). Docker defaults to `Etc/UTC`; direct Node.js runs use the system timezone unless `TZ` is set. The browser follows the server's current day.

Existing databases are upgraded automatically without deleting tasks. On the first upgrade, tasks are assigned to their existing due date or, if no due date exists, today. Unfinished past tasks then carry forward normally. Existing status values remain compatible with MCP clients, but board columns now represent priority.

## Run locally

```sh
git clone https://github.com/Lauorez/kando.git
cd kando
npm ci
npm start
```

Open http://localhost:3000. Both `npm start` and `npm run dev` load an existing `.env` file from the project directory; environment variables take precedence. `npm run dev` restarts the server when its files change.

## Docker

From the cloned project directory:

```sh
docker compose up -d --build
```

Open http://localhost:3000. Data persists in the `kando-data` volume through restarts, updates, and `docker compose down`. Running `docker compose down -v` deletes that data.

The app has one shared personal workspace without user authentication. The local server and Compose port binding use loopback by default. For remote access to the board, use your own reverse proxy with HTTPS and authentication, or a private VPN. `MCP_TOKEN` protects only the MCP endpoint; the web interface and REST API still need authentication at the proxy.

## Connect an MCP client

The MCP server uses the [official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server). Both transports access the same SQLite database as the board. Changes made by other clients appear on the next minute refresh while the board is visible, when you select **Refresh**, refocus the browser window, or reload the page. Refreshing does not interrupt an open editing dialog.

### Streamable HTTP

The MCP endpoint runs alongside the app at:

```text
http://localhost:3000/mcp
```

Add this URL to a client that supports Streamable HTTP. The endpoint is stateless and uses POST; it does not require a persistent SSE channel or session IDs.

Optionally protect local MCP access with a long, random token:

```sh
MCP_TOKEN='your-long-random-token' npm start
```

Configure the client header `Authorization: Bearer your-long-random-token`. This is a static bearer token, not an OAuth login flow. For Docker, set variables in a local `.env` file; see [`.env.example`](.env.example).

Use `MCP_ALLOWED_HOSTS` for additional internal hostnames, without a scheme or port. For a public HTTPS address, follow the tunnel configuration below. Requests from other browser origins are rejected. Without `MCP_TOKEN`, anyone able to reach the local port can access the local MCP endpoint.

### Tunnels and reverse proxies

Set `MCP_PUBLIC_URL` to the full public MCP address. Its hostname is automatically added to the allowed hosts. KanDo accepts both the original public Host header and a Host header rewritten to an allowed internal hostname. The public HTTPS origin is accepted too. KanDo does not trust `Forwarded` or `X-Forwarded-*` for these checks; a wildcard host rule is not needed.

1. Copy `.env.example` to `.env` and configure:

   ```dotenv
   MCP_PUBLIC_URL=https://kando.example.org/mcp
   MCP_TOKEN=replace-with-your-own-long-random-token
   MCP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1]
   ```

   Generate a token locally with `openssl rand -hex 32`. A token is required when the public URL is set; KanDo validates the configuration before starting. The URL must use HTTPS and the path `/mcp`, without credentials, a query, or a fragment. If your tunnel URL changes, update it and restart KanDo.

2. Start KanDo with `npm start` or `docker compose up -d --build`. Forward **only `/mcp`** to `http://127.0.0.1:3000/mcp`. HTTPS terminates at the tunnel; the local hop to KanDo uses HTTP. `HOST=0.0.0.0` is not needed when the tunnel runs on the same machine.

3. In your MCP client, select **Streamable HTTP**, use `https://kando.example.org/mcp`, and set `Authorization: Bearer <your-token>`. The tunnel must preserve the Authorization header. KanDo uses a static bearer token and does not provide OAuth login.

A template for an existing, locally managed Cloudflare Tunnel is available in [`examples/cloudflared.yml`](examples/cloudflared.yml). Replace the UUID, credentials path, and hostname. The tunnel and its DNS mapping must already exist. Then, for example:

```sh
cloudflared tunnel --config /absolute/path/cloudflared.yml ingress validate
cloudflared tunnel --config /absolute/path/cloudflared.yml run
```

The template routes only `/mcp`; other paths return 404. This keeps the board and REST API out of that tunnel. The configuration and path rules follow the [Cloudflare documentation](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/).

For another tunnel provider or reverse proxy, apply the same path restriction. If the proxy sends an internal header such as `Host: kando:3000`, add `kando` to `MCP_ALLOWED_HOSTS`. A tunnel running in its own container must target the KanDo service in a shared Docker network; `127.0.0.1` would refer to the tunnel container itself. The included template assumes the tunnel process runs on the host.

KanDo provides the MCP endpoint. You operate the tunnel with your chosen provider; the app does not start a tunnel automatically.

### Local stdio access

After `npm ci`, clients can launch the MCP server as a local process. Replace the example path with the absolute path of your clone:

```json
{
  "mcpServers": {
    "kando": {
      "command": "node",
      "args": ["/absolute/path/to/kando/mcp-stdio.js"]
    }
  }
}
```

The web app does not need to be running. Both processes can access the same database concurrently. The default database path is relative to the project, regardless of the client's working directory. To use another database, set `DATABASE_PATH` in the MCP client's `env` configuration. For Docker installations, prefer HTTP access to use the container's data volume.

Run manually with `node mcp-stdio.js` or `npm run --silent mcp`. stdout is reserved for MCP messages.

### Tools

| Tool | Purpose |
| --- | --- |
| `list_tasks` | List tasks; optional `day` (`today` or `YYYY-MM-DD`), `priority`, `status`, and `query` filters |
| `get_task` | Read a task by `id` |
| `create_task` | Create a task on today’s board; requires `title`; use `scheduledFor` for another day |
| `update_task` | Update only the fields provided |
| `move_task` | Change a task’s `priority`, `scheduledFor`, and/or `status` by `id` |
| `delete_task` | Permanently delete a task by `id` |

Priorities: `high`, `medium`, `low`. New tasks default to today in the server timezone, `medium` priority, and `todo` status. Set `scheduledFor` (`YYYY-MM-DD`) to plan another day. `description` and `dueDate` are optional; an empty `dueDate` removes the deadline. An unfinished task assigned to a past day is carried forward to today.

Set `status: "done"` to complete a task and `status: "todo"` to reopen it. The older `backlog` and `doing` status values remain supported and count as unfinished. Failures are returned as MCP tool errors. Read-only and destructive tools are annotated accordingly.

Examples of MCP tool arguments:

```json
[
  {"name":"list_tasks","arguments":{"day":"today","priority":"high"}},
  {"name":"create_task","arguments":{"title":"Send the invoice","priority":"high"}},
  {"name":"move_task","arguments":{"id":"<task-id>","priority":"low"}},
  {"name":"update_task","arguments":{"id":"<task-id>","status":"done"}}
]
```

To plan a future task, also provide `scheduledFor`, for example `"2027-01-15"`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP bind address (`0.0.0.0` inside Docker) |
| `PORT` | `3000` | HTTP port |
| `TZ` | System timezone; `Etc/UTC` in Compose | Timezone for daily rollover |
| `DATABASE_PATH` | `data/kando.sqlite` in the project | SQLite database path |
| `MCP_TOKEN` | empty | Bearer token for `/mcp`; required with a public URL |
| `MCP_PUBLIC_URL` | empty | Public HTTPS MCP address, including `/mcp` |
| `MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Allowed HTTP MCP hostnames |

## Backups

Before updating, stop the app and any stdio processes. Copy the entire data directory or Docker volume; SQLite uses WAL. Restart the processes afterwards. To restore a backup, stop all processes and replace the data directory with the backup.

## Development

```sh
npm ci
npm run dev
```

Run tests:

```sh
npm test
```

Tests use temporary databases and cover daily rollover, completed-task history, migration from existing databases, date planning, priority changes, completion, REST CRUD, validation, persistence across restarts, HTTP and stdio MCP clients, shared data access, MCP access controls, tunnel forwarding, public URL configuration, theme preferences, and language selection. Language tests cover English defaults, German persistence, interface translation, date formatting, errors, and preserving task content and drafts. The tunnel tests simulate the HTTP hop after TLS termination. Tests do not verify a live public tunnel, browser layout, or a running Docker container.

Frontend: HTML, CSS, and JavaScript. Backend: Node.js HTTP server and `node:sqlite`. MCP: `@modelcontextprotocol/sdk` with Zod schemas. DOM tests use jsdom as a development dependency.

## Feedback

Report bugs and feature requests in [GitHub Issues](https://github.com/Lauorez/kando/issues). Include your Node.js version, deployment method (direct or Docker), and reproduction steps. Remove credentials and personal task data from logs before sharing them.
