// Aurora DSQL access for Next.js route handlers.
//
// Same auth model as the rollup Lambda (infra/lambda/rollup/index.js): the
// password is a short-lived IAM token minted by @aws-sdk/dsql-signer, and the
// standard `pg` driver speaks Postgres over TLS. Credentials come from the
// ambient AWS chain (env vars / profile locally, the Vercel IAM user in prod).
//
// Route handlers are short-lived and may run on many lambdas, so we connect
// per request and close — no warm-pool assumptions, no stale 15-min tokens.

import { Client, type QueryResult, type QueryResultRow } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";

export function dsqlConfigured(): boolean {
  return Boolean(ENDPOINT);
}

/** Open a fresh, authenticated DSQL connection. Caller must `end()` it. */
export async function connect(): Promise<Client> {
  if (!ENDPOINT) {
    throw new Error("TOLLROAD_DSQL_ENDPOINT is not set");
  }
  const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
  const token = await signer.getDbConnectAdminAuthToken();
  const client = new Client({
    host: ENDPOINT,
    port: 5432,
    user: "admin",
    database: "postgres",
    password: token,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  return client;
}

/** Run `fn` against a connection, always closing it afterward. */
export async function withDsql<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = await connect();
  try {
    return await fn(db);
  } finally {
    await db.end().catch(() => {});
  }
}

/** One-shot parameterised query on a fresh connection. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return withDsql((db) => db.query<T>(sql, params));
}
