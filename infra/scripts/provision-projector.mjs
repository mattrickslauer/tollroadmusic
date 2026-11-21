#!/usr/bin/env node
// Provision the least-privilege DSQL role the CQRS projector Lambda connects as.
//
// WHY THIS EXISTS: the stack gives the projector Lambda `dsql:DbConnect` (NOT
// DbConnectAdmin) and sets TOLLROAD_DSQL_USER=projector, so the Lambda MUST
// authenticate as a dedicated DSQL role that is IAM-bound to its execution role.
// That role is NOT created by `cdk deploy` and NOT created by a default
// `npm run migrate` — the block in migrate-dsql.mjs is gated on
// TOLLROAD_PROJECTOR_ROLE_ARN, which nothing in the pipeline ever sets.
//
// When the role is missing, DSQL rejects the Lambda with
//   error: unable to accept connection, access denied   (SQLSTATE 28000)
// on every single record. Nothing else fails loudly — charges still debit on the
// DynamoDB command path — so the royalty ledger, artist_daily_summary and the
// leaderboard just quietly stop advancing. This script is the missing step, made
// runnable and idempotent so it can't be forgotten again.
//
// Usage:
//   node scripts/provision-projector.mjs [--check]
//     --check   report what exists and what's missing; change nothing
//
// The projector execution-role ARN is discovered from the deployed Lambda, so
// there is nothing to copy by hand. Override with TOLLROAD_PROJECTOR_ROLE_ARN.
// DSQL endpoint/region come from the env (backend/.env is the canonical source):
//   node --env-file=../backend/.env scripts/provision-projector.mjs

import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { DsqlSigner } from "@aws-sdk/dsql-signer";

const ENDPOINT = process.env.TOLLROAD_DSQL_ENDPOINT;
const REGION = process.env.TOLLROAD_DSQL_REGION || "us-east-1";
const DB_USER = process.env.TOLLROAD_PROJECTOR_DB_USER || "projector";
const checkOnly = process.argv.slice(2).includes("--check");

// Tables the projector writes: the ledger + top-ups it inserts, the summaries and
// listener profile it upserts, and its own stream checkpoint. DML only, no DDL.
const GRANT_TABLES = [
  "royalty_ledger",
  "artist_daily_summary",
  "listener_profiles",
  "wallet_topups",
  "projector_checkpoint",
];

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!ENDPOINT) {
  die(
    "TOLLROAD_DSQL_ENDPOINT is unset.\n" +
      "  Pass the env file the rest of the tooling uses:\n" +
      "    node --env-file=../backend/.env scripts/provision-projector.mjs",
  );
}

// --- discover the projector Lambda's execution role ------------------------
// Hand-copying this ARN is how it goes stale: the role changes whenever the
// function is replaced, and a stale IAM GRANT fails exactly like a missing one.
function discoverRoleArn() {
  if (process.env.TOLLROAD_PROJECTOR_ROLE_ARN) return process.env.TOLLROAD_PROJECTOR_ROLE_ARN;
  const aws = (args) =>
    execFileSync("aws", [...args, "--output", "text"], { encoding: "utf8" }).trim();
  let fn;
  try {
    fn = aws([
      "lambda",
      "list-functions",
      "--query",
      "Functions[?contains(FunctionName,'ProjectorConsumerFn')].FunctionName",
    ]).split(/\s+/)[0];
  } catch (err) {
    die(`could not list Lambda functions (is the AWS CLI configured?): ${err.message}`);
  }
  if (!fn) {
    die(
      "no deployed function matching 'ProjectorConsumerFn' found.\n" +
        "  Deploy the stack first (npm run deploy), or set TOLLROAD_PROJECTOR_ROLE_ARN.",
    );
  }
  console.log(`✓ projector fn:    ${fn}`);
  return aws(["lambda", "get-function-configuration", "--function-name", fn, "--query", "Role"]);
}

const ROLE_ARN = discoverRoleArn();
console.log(`✓ execution role:  ${ROLE_ARN}`);
console.log(`✓ dsql endpoint:   ${ENDPOINT} (${REGION})`);

// --- connect as admin (the only role that can CREATE ROLE / IAM GRANT) ------
const signer = new DsqlSigner({ hostname: ENDPOINT, region: REGION });
const client = new Client({
  host: ENDPOINT,
  port: 5432,
  user: "admin",
  database: "postgres",
  password: await signer.getDbConnectAdminAuthToken(),
  ssl: { rejectUnauthorized: true },
});
await client.connect();

const roleExists = async () =>
  (await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [DB_USER])).rowCount > 0;

// Every GRANT target must exist first, or the GRANT aborts and leaves a login
// role with no privileges — which fails at INSERT time instead of connect time
// and is much harder to read from the logs.
const present = (
  await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)",
    [GRANT_TABLES],
  )
).rows.map((r) => r.tablename);
const missingTables = GRANT_TABLES.filter((t) => !present.includes(t));
if (missingTables.length) {
  await client.end();
  die(
    `these tables don't exist yet: ${missingTables.join(", ")}\n` +
      `  Run the schema migration first:  npm run migrate`,
  );
}
console.log(`✓ grant targets:   ${GRANT_TABLES.length}/${GRANT_TABLES.length} tables present`);

if (checkOnly) {
  console.log(
    `\n--check: role "${DB_USER}" ${(await roleExists()) ? "EXISTS" : "is MISSING — projector cannot connect"}`,
  );
  await client.end();
  process.exit(0);
}

// --- apply: additive and idempotent ----------------------------------------
// A re-run hits "role already exists" (SQLSTATE 42710); GRANT and AWS IAM GRANT
// are naturally no-ops when already held, so this is safe to run every deploy.
const statements = [
  `CREATE ROLE ${DB_USER} WITH LOGIN`,
  `GRANT SELECT, INSERT, UPDATE ON ${GRANT_TABLES.join(", ")} TO ${DB_USER}`,
  `AWS IAM GRANT ${DB_USER} TO '${ROLE_ARN}'`,
];

console.log("");
for (const sql of statements) {
  const label = sql.slice(0, 72);
  try {
    await client.query(sql);
    console.log("ok:  ", label);
  } catch (err) {
    if (err?.code === "42710" || /already exists|duplicate/i.test(err?.message ?? "")) {
      console.log("skip:", label, "(already present)");
      continue;
    }
    await client.end();
    die(`${label}\n  -> ${err?.code ?? ""} ${err?.message ?? err}`);
  }
}

if (!(await roleExists())) {
  await client.end();
  die(`role "${DB_USER}" still does not exist after provisioning — check the errors above.`);
}
await client.end();

console.log(
  `\n✓ done. The projector authenticates as "${DB_USER}".\n` +
    `  Verify with:  aws logs tail /aws/lambda/<ProjectorConsumerFn> --since 10m\n` +
    `  A 28000 "access denied" should no longer appear.`,
);
