// Aurora DSQL access for the backend Lambdas.
//
// Auth model (same as the rollup Lambda + the old Next.js lib/dsql.ts): the
// password is a short-lived IAM token minted by @aws-sdk/dsql-signer, and the
// standard `pg` driver speaks Postgres over TLS. Credentials come from the
// ambient AWS chain (the Lambda execution role in prod, env/profile locally).
//
// UNLIKE the old per-request connect/close, Lambdas reuse a MODULE-SCOPED client
// across warm invocations. The DSQL IAM token has a ~15-min TTL, so we proactively
// rotate the connection well before expiry and reconnect on any connection error.
import { Client, type QueryResult, type QueryResultRow } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";

// Rotate the connection after this long — comfortably under the token's ~15-min TTL.
const TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

let client: Client | null = null;
let connectedAt = 0;
let connecting: Promise<Client> | null = null;

export function dsqlConfigured(): boolean {
  return Boolean(ENDPOINT);
}

async function openClient(): Promise<Client> {
  if (!ENDPOINT) throw new Error("TOLLROAD_DSQL_ENDPOINT is not set");
  const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
  const token = await signer.getDbConnectAdminAuthToken();
  const c = new Client({
    host: ENDPOINT,
    port: 5432,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: true },
  });
  // A dropped connection must not crash the Lambda — drop our cached handle so the
  // next call reconnects.
  c.on("error", () => {
    if (client === c) client = null;
  });
  await c.connect();
  return c;
}

async function getClient(): Promise<Client> {
  const fresh = client && Date.now() - connectedAt < TOKEN_MAX_AGE_MS;
  if (fresh) return client!;

  // Retire a stale (but possibly still-open) connection before reconnecting.
  if (client) {
    const old = client;
    client = null;
    old.end().catch(() => {});
  }
  if (!connecting) {
    connecting = openClient()
      .then((c) => {
        client = c;
        connectedAt = Date.now();
        return c;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

/** One-shot parameterised query on the shared connection. Reconnects once if the
 *  pooled connection has gone away. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  try {
    const c = await getClient();
    return await c.query<T>(sql, params);
  } catch (err) {
    if (isConnectionError(err)) {
      client = null;
      const c = await getClient();
      return c.query<T>(sql, params);
    }
    throw err;
  }
}

/** Run `fn` with the shared client — used for multi-statement transactions
 *  (BEGIN/COMMIT). The client is reused, never closed here. */
export async function withDsql<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const c = await getClient();
  return fn(c);
}

function isConnectionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  // Connection-level pg/network errors — token expiry surfaces as one of these.
  return (
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "57P01" || // admin_shutdown
    code === "08006" || // connection_failure
    code === "08003" || // connection_does_not_exist
    (err as { message?: string })?.message?.includes("Connection terminated") === true
  );
}
