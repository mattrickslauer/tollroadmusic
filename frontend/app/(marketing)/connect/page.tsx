import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Connect Claude — TollRoad",
  description:
    "Connect Claude to the TollRoad vibe-DJ MCP server — search, queue, and stream licensed music by the minute, paid from a wallet.",
};

const INSTALL = `cd mcp
npm install`;

const DESKTOP_CONFIG = `{
  "mcpServers": {
    "tollroad-vibe-dj": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "/path/to/tollroadmusic/mcp/src/server.ts"
      ],
      "env": {
        "TOLLROAD_API_BASE": "https://api.tollroad.music/v1",
        "TOLLROAD_API_KEY": "<your-api-key>"
      }
    }
  }
}`;

const CLI_ADD = `claude mcp add tollroad-vibe-dj \\
  --env TOLLROAD_API_BASE=https://api.tollroad.music/v1 \\
  --env TOLLROAD_API_KEY=<your-api-key> \\
  -- node --experimental-strip-types /path/to/tollroadmusic/mcp/src/server.ts`;

const TRY_PROMPT = `Find a tense 140 BPM synthwave track and play it.`;

const TOOLS: { name: string; desc: string }[] = [
  { name: "search_music", desc: "Discover tracks by vibe/mood — returns ranked, licensed results." },
  { name: "start_session", desc: "Start a DJ session queue; returns a session id." },
  { name: "next_track", desc: "Advance the session to the next track (optionally with a signal hint)." },
  { name: "get_stream", desc: "Get a signed streaming URL — or 402 Payment Required if the wallet is empty." },
  { name: "get_balance", desc: "Check the current wallet balance for the authenticated key." },
];

export default function ConnectPage() {
  return (
    <main className="section dev-page">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="mono-label kicker amber">Connect Claude &middot; MCP</span>
          <h1>Connect Claude to TollRoad.</h1>
          <p className="dev-lede">
            Point Claude at the vibe-DJ MCP server and it can search the catalog,
            queue a session, and stream licensed music by describing a vibe —
            paid per minute from a wallet, no login.
          </p>
        </Reveal>

        <Reveal className="connect-status">
          <span className="mono-label amber">Heads up</span>
          <p>
            Today the server runs <strong>locally</strong> — Claude spawns it from
            the repo. A hosted endpoint, an <code>npx</code> package, and
            self-serve API keys are on the way. You&rsquo;ll need the{" "}
            <code>mcp/</code> server, Node&nbsp;22+, and a TollRoad API key
            (issued by us for now).
          </p>
        </Reveal>

        <ol className="connect-steps">
          <Reveal className="connect-step">
            <span className="connect-num">1</span>
            <div className="connect-body">
              <h2>Get the server</h2>
              <p>From the TollRoad repo, install the MCP server&rsquo;s dependencies.</p>
              <div className="dev-code"><pre><code>{INSTALL}</code></pre></div>
            </div>
          </Reveal>

          <Reveal className="connect-step" delay={80}>
            <span className="connect-num">2</span>
            <div className="connect-body">
              <h2>Set your credentials</h2>
              <p>
                The server reads two required environment variables (and one
                optional):
              </p>
              <ul className="connect-vars">
                <li>
                  <code>TOLLROAD_API_BASE</code> — the API base URL, e.g.{" "}
                  <code>https://api.tollroad.music/v1</code> (no trailing slash).
                </li>
                <li>
                  <code>TOLLROAD_API_KEY</code> — your key, sent as the{" "}
                  <code>x-api-key</code> header; it resolves to a wallet.
                </li>
                <li>
                  <code>TOLLROAD_TOKEN</code> <em>(optional)</em> — an end-user
                  session JWT for user-scoped sessions.
                </li>
              </ul>
            </div>
          </Reveal>

          <Reveal className="connect-step" delay={160}>
            <span className="connect-num">3</span>
            <div className="connect-body">
              <h2>Register it with Claude</h2>
              <p className="connect-sub">Claude Desktop — add to <code>claude_desktop_config.json</code>:</p>
              <div className="dev-code"><pre><code>{DESKTOP_CONFIG}</code></pre></div>
              <p className="connect-sub">Claude Code — run:</p>
              <div className="dev-code"><pre><code>{CLI_ADD}</code></pre></div>
              <p className="connect-note">
                Use the absolute path to <code>mcp/src/server.ts</code> on your
                machine.
              </p>
            </div>
          </Reveal>

          <Reveal className="connect-step" delay={240}>
            <span className="connect-num">4</span>
            <div className="connect-body">
              <h2>Restart Claude</h2>
              <p>
                Restart Claude Desktop (or reload your Claude Code session) so it
                picks up the new server. You should see{" "}
                <code>tollroad-vibe-dj</code> in the MCP tool list.
              </p>
            </div>
          </Reveal>

          <Reveal className="connect-step" delay={320}>
            <span className="connect-num">5</span>
            <div className="connect-body">
              <h2>Try it</h2>
              <p>Ask Claude for music — it will search, pick, and play:</p>
              <div className="dev-code"><pre><code>{TRY_PROMPT}</code></pre></div>
            </div>
          </Reveal>
        </ol>

        <Reveal className="connect-tools">
          <h2>The tools Claude gets</h2>
          <div className="connect-tool-grid">
            {TOOLS.map((t) => (
              <div className="connect-tool" key={t.name}>
                <code>{t.name}</code>
                <span>{t.desc}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="connect-soon">
          <span className="mono-label amber">Coming soon</span>
          <ul>
            <li>A published <code>npx tollroad-mcp</code> — no repo clone.</li>
            <li>A hosted remote MCP endpoint — nothing to run locally.</li>
            <li>Self-serve API keys + wallet top-up.</li>
          </ul>
        </Reveal>

        <Reveal className="hero-cta dev-cta">
          <Cta href={ROUTES.browse}>Hear it live →</Cta>
          <Cta href={ROUTES.developers} variant="ghost">← Developers</Cta>
        </Reveal>
      </div>
    </main>
  );
}
