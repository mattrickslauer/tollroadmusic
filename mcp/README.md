# tollroad-mcp

MCP server that exposes TollRoad's HTTP API as tools for AI agents (vibe-DJ mode).

## Environment variables

| Variable            | Required | Description                                         |
|---------------------|----------|-----------------------------------------------------|
| `TOLLROAD_API_BASE` | Yes      | Base URL of the TollRoad API, e.g. `https://api.tollroad.music/v1` |
| `TOLLROAD_API_KEY`  | Yes      | API key sent as `x-api-key` header                  |
| `TOLLROAD_TOKEN`    | No       | End-user session JWT (sent as `Authorization: Bearer`) |

## Running locally

```bash
cd mcp
npm install
TOLLROAD_API_BASE=https://... TOLLROAD_API_KEY=... node --experimental-strip-types src/server.ts
```

## Running tests

```bash
cd mcp
npm test
# or: node --experimental-strip-types --test src/client.test.ts
```

## MCP client config (Claude Desktop / other clients)

Add this to your `claude_desktop_config.json` (or equivalent):

```json
{
  "mcpServers": {
    "tollroad-vibe-dj": {
      "command": "node",
      "args": ["--experimental-strip-types", "/path/to/tollroadmusic/mcp/src/server.ts"],
      "env": {
        "TOLLROAD_API_BASE": "https://api.tollroad.music/v1",
        "TOLLROAD_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

## Available tools

| Tool             | Description                                                         |
|------------------|---------------------------------------------------------------------|
| `search_music`   | Discover tracks by vibe/mood with optional BPM/energy filters       |
| `start_session`  | Start a DJ session queue, returns a `session` ID                    |
| `next_track`     | Advance the session to the next track (optionally with a signal)    |
| `get_stream`     | Get a signed streaming URL for a track                              |
| `get_balance`    | Check the current wallet balance                                    |

## Architecture

```
server.ts          ← MCP tool registrations (stdio transport)
  └─ client.ts     ← thin HTTP client (injectable fetchImpl for tests)
       └─ fetch    ← global fetch (Node 18+) in production
```

`client.ts` is the testable seam: pass `fetchImpl` to mock HTTP in tests without starting a real server.

## Adding a new tool

1. Add the tool call in `server.ts` using `server.tool(name, description, zodSchema, callback)`.
2. In the callback, call `client.call(method, path, body)` to hit the TollRoad API.
3. Return `{ content: [{ type: "text", text: JSON.stringify(result.data) }] }`.
