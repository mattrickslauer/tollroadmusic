import { Client } from "pg";
import { Signer } from "@aws-sdk/rds-signer";

const HOST = process.env.TOLLROAD_VECTOR_HOST;
const PORT = Number(process.env.TOLLROAD_VECTOR_PORT ?? "5432");
const DB = process.env.TOLLROAD_VECTOR_DB ?? "tollroad";
const USER = process.env.TOLLROAD_VECTOR_USER ?? "vector_app";
const REGION = process.env.TOLLROAD_VECTOR_REGION ?? "us-east-1";

export function vectorConfigured(): boolean {
  return !!process.env.TOLLROAD_VECTOR_HOST;
}

export function toVectorLiteral(e: number[]): string {
  return `[${e.join(",")}]`;
}

let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;
  if (!HOST) throw new Error("TOLLROAD_VECTOR_HOST is not set");
  const signer = new Signer({
    hostname: HOST,
    port: PORT,
    username: USER,
    region: REGION,
  });
  const token = await signer.getAuthToken();
  const c = new Client({
    host: HOST,
    port: PORT,
    user: USER,
    database: DB,
    password: token,
    // TODO: pin RDS CA bundle for cert verification
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  client = c;
  return c;
}

export async function vquery<T = any>(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[] }> {
  try {
    return await (await getClient()).query<T>(sql, params);
  } catch (err: any) {
    if (
      /ECONNRESET|terminat|Connection terminated|timeout/i.test(
        String(err?.message),
      )
    ) {
      client = null;
      return await (await getClient()).query<T>(sql, params);
    }
    throw err;
  }
}
