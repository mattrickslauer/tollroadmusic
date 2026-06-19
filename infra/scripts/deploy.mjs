#!/usr/bin/env node
// Guarded `cdk deploy` for the TollRoad stack.
//
// WHY THIS EXISTS: the Lambda's secrets (session secret, CloudFront signing key,
// Stripe, Telegram, …) live OUTSIDE CloudFormation — the stack only writes them
// to the function when they're handed in via `-c name=value` context
// (infra/lib/tollroad-stack.ts). A bare `cdk deploy` silently OMITS every one of
// them, which wipes them from the live Lambda. The classic symptom is auth dying:
// TOLLROAD_SESSION_SECRET disappears → sessionConfigured() is false →
// /auth/me returns {account:null, authConfigured:false} and OTP sign-in 503s.
//
// This script refuses to deploy unless every required secret is present in
// backend/.env (the canonical restore source), then passes them all through as
// context. So `npm run deploy` can never accidentally strip them again.
//
// Usage:
//   node scripts/deploy.mjs [--check] [-- <extra cdk args>]
//     --check         validate the env file and print the plan, but DON'T deploy
//     anything after a literal `--` is forwarded verbatim to `cdk deploy`
//                     (e.g. --profile prod, --require-approval never, StackName)
//
// Override the env file location with TOLLROAD_ENV_FILE=/path/to/.env

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const infraDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(infraDir, "..");
const envFile = process.env.TOLLROAD_ENV_FILE ?? path.join(repoRoot, "backend", ".env");

// Out-of-band context vars, mirroring the loop in tollroad-stack.ts. REQUIRED
// ones must be present (a missing one is exactly what breaks prod); OPTIONAL
// ones are forwarded only when set.
const REQUIRED = [
  "TOLLROAD_SESSION_SECRET",
  "TOLLROAD_CF_KEY_PAIR_ID",
  "TOLLROAD_CF_PRIVATE_KEY",
  "TOLLROAD_SES_SENDER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
];
const OPTIONAL = ["TOLLROAD_ALLOWED_ORIGINS", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"];

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// --- parse args: anything after `--` is forwarded to cdk untouched ----------
const argv = process.argv.slice(2);
const sepIdx = argv.indexOf("--");
const ours = sepIdx === -1 ? argv : argv.slice(0, sepIdx);
const passthrough = sepIdx === -1 ? [] : argv.slice(sepIdx + 1);
const checkOnly = ours.includes("--check");
const unknown = ours.filter((a) => a !== "--check");
if (unknown.length) die(`unknown option(s): ${unknown.join(", ")} — forward cdk args after a literal --`);

// --- load + validate the env file ------------------------------------------
if (!existsSync(envFile)) {
  die(
    `env file not found: ${envFile}\n` +
      `  This holds the Lambda secrets. Restore it (it's gitignored) before deploying,\n` +
      `  or point TOLLROAD_ENV_FILE at the right path.`,
  );
}
// Use Node's native parser — the SAME one the dev server uses (--env-file), so a
// quoted multiline value like the CF private key is read identically. First drop
// any pre-exported copies of these keys: loadEnvFile() will NOT override an
// existing process.env value, and backend/.env must be the source of truth (a
// stale secret left in the shell would otherwise be deployed instead).
for (const key of [...REQUIRED, ...OPTIONAL]) delete process.env[key];
process.loadEnvFile(envFile);

const missing = [];
for (const key of REQUIRED) {
  const v = process.env[key];
  if (!v || !v.trim()) missing.push(key);
}
if (missing.length) {
  die(
    `${missing.length} required secret(s) missing/empty in ${envFile}:\n` +
      missing.map((k) => `    - ${k}`).join("\n") +
      `\n  Refusing to deploy: a bare deploy would WIPE these from the live Lambda.`,
  );
}
// The silent killer: the session module rejects secrets under 32 chars
// (backend/src/lib/jwt.ts), so the var would be "set" yet auth still dead.
const secretLen = (process.env.TOLLROAD_SESSION_SECRET ?? "").length;
if (secretLen < 32) {
  die(`TOLLROAD_SESSION_SECRET is only ${secretLen} chars; must be >= 32 or auth stays broken.`);
}

// --- build the cdk command --------------------------------------------------
const contextArgs = [];
for (const key of [...REQUIRED, ...OPTIONAL]) {
  const v = process.env[key];
  if (!v || !v.trim()) continue;
  // cdk's `-c key=value` parser TRUNCATES the value at the first newline, so a
  // multiline PEM (TOLLROAD_CF_PRIVATE_KEY) would arrive as just its header line
  // and fail to decode (ERR_OSSL_UNSUPPORTED -> stream 503). Collapse real
  // newlines to the literal "\n" escape; the Lambda's normalizePem() in
  // backend/src/domain/streaming.ts converts them back. No-op for single-line
  // secrets.
  contextArgs.push("-c", `${key}=${v.replace(/\n/g, "\\n")}`);
}

const present = [...REQUIRED, ...OPTIONAL].filter((k) => process.env[k]?.trim());
const skipped = OPTIONAL.filter((k) => !process.env[k]?.trim());
console.log(`✓ env file:        ${envFile}`);
console.log(`✓ secrets passed:  ${present.join(", ")}`);
if (skipped.length) console.log(`· optional skipped: ${skipped.join(", ")}`);
console.log(`✓ session secret:  ${secretLen} chars`);

if (checkOnly) {
  console.log(`\n--check: validation passed. Would run:`);
  console.log(`  cdk deploy ${present.map((k) => `-c ${k}=***`).join(" ")} ${passthrough.join(" ")}`.trim());
  process.exit(0);
}

const cdkArgs = ["deploy", ...contextArgs, ...passthrough];
console.log(`\n→ cdk deploy (${present.length} secrets via context)${passthrough.length ? ` + ${passthrough.join(" ")}` : ""}\n`);
try {
  // Spawn via argv (no shell) so multiline values survive unescaped. Resolve cdk
  // from the local install; fall back to npx.
  const localCdk = path.join(infraDir, "node_modules", ".bin", "cdk");
  const bin = existsSync(localCdk) ? localCdk : "npx";
  const finalArgs = bin === "npx" ? ["cdk", ...cdkArgs] : cdkArgs;
  execFileSync(bin, finalArgs, { cwd: infraDir, stdio: "inherit" });
} catch (err) {
  process.exit(err?.status ?? 1);
}
