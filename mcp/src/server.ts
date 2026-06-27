/**
 * TollRoad vibe-DJ MCP server.
 *
 * Exposes TollRoad's HTTP API as MCP tools for AI agents.
 * Transport: stdio (reads from stdin, writes to stdout).
 *
 * Required env vars:
 *   TOLLROAD_API_BASE  — e.g. https://api.tollroad.music/v1
 *   TOLLROAD_API_KEY   — API key (x-api-key header)
 *
 * Optional:
 *   TOLLROAD_TOKEN     — end-user session JWT (Authorization: Bearer)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { makeClientFromEnv, type TollRoadClient } from "./client.ts";

// ---------------------------------------------------------------------------
// Build the MCP server
// ---------------------------------------------------------------------------

function buildServer(client: TollRoadClient): McpServer {
  const server = new McpServer(
    { name: "tollroad-vibe-dj", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Use these tools to discover and stream music from TollRoad. " +
        "Start with search_music or get_balance, then start_session for a continuous DJ queue.",
    }
  );

  // ---- search_music --------------------------------------------------------
  server.tool(
    "search_music",
    "Search TollRoad's catalog by vibe/mood and optional filters. Returns a list of tracks.",
    {
      vibe: z.string().describe("Mood or vibe to search for, e.g. 'calm focus', 'energetic workout'"),
      limit: z.number().int().min(1).max(50).optional().describe("Max number of tracks to return (default: 10)"),
      allowExplicit: z.boolean().optional().describe("Whether to allow explicit tracks (default: false)"),
    },
    async (args) => {
      const { vibe, limit, allowExplicit } = args;
      const body: Record<string, unknown> = { vibe };
      if (limit !== undefined) body["limit"] = limit;
      if (allowExplicit !== undefined) body["allowExplicit"] = allowExplicit;

      const result = await client.call("POST", "/discover", body);
      return {
        isError: result.status >= 400,
        content: [{ type: "text", text: JSON.stringify({ status: result.status, data: result.data }, null, 2) }],
      };
    }
  );

  // ---- start_session -------------------------------------------------------
  server.tool(
    "start_session",
    "Start a new DJ session queue. Returns a session ID to use with next_track.",
    {
      context: z.string().describe("Description of the listening context or playlist intent, e.g. 'evening chill session'"),
    },
    async ({ context }) => {
      const result = await client.call("POST", "/sessions", { context });
      return {
        isError: result.status >= 400,
        content: [{ type: "text", text: JSON.stringify({ status: result.status, data: result.data }, null, 2) }],
      };
    }
  );

  // ---- next_track ----------------------------------------------------------
  server.tool(
    "next_track",
    "Advance the DJ session to the next track. Returns the next track's info.",
    {
      session: z.string().describe("Session ID returned by start_session"),
      signal: z.string().optional().describe("Optional signal/hint for track selection, e.g. 'more energetic'"),
    },
    async ({ session, signal }) => {
      const body: Record<string, unknown> = {};
      if (signal !== undefined) body["signal"] = signal;

      const result = await client.call("POST", `/sessions/${session}/next`, Object.keys(body).length ? body : undefined);
      return {
        isError: result.status >= 400,
        content: [{ type: "text", text: JSON.stringify({ status: result.status, data: result.data }, null, 2) }],
      };
    }
  );

  // ---- get_stream ----------------------------------------------------------
  server.tool(
    "get_stream",
    "Get a signed streaming URL for a track. Returns the stream URL (or 402 if payment is needed).",
    {
      track_id: z.string().describe("Track ID to stream"),
    },
    async ({ track_id }) => {
      const result = await client.call("GET", `/stream/${track_id}`);
      return {
        isError: result.status >= 400,
        content: [{ type: "text", text: JSON.stringify({ status: result.status, data: result.data }, null, 2) }],
      };
    }
  );

  // ---- get_balance ---------------------------------------------------------
  server.tool(
    "get_balance",
    "Get the current wallet balance for the authenticated user/API key.",
    {},
    async () => {
      const result = await client.call("GET", "/balance");
      return {
        isError: result.status >= 400,
        content: [{ type: "text", text: JSON.stringify({ status: result.status, data: result.data }, null, 2) }],
      };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const client = makeClientFromEnv();
  const server = buildServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until stdin closes or process is killed
}

main().catch((err) => {
  console.error("[tollroad-mcp] Fatal:", err);
  process.exit(1);
});
