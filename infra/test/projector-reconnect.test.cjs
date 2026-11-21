// Regression test for the projector's cached-client bug: after a failed connect (or a
// connection DSQL later closes), the next warm invocation must reconnect rather
// than reuse the dead client. Stubs pg + the DSQL signer; no network.
const Module = require("node:module");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");

const target = require("node:path").join(__dirname, "..", "lambda", "projector", "index.js");
let connectPlan = []; // per new Client: "fail" | "ok"
let clientsCreated = 0;

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.mode = connectPlan[clientsCreated++] ?? "ok";
    this.dead = false;
  }
  async connect() {
    if (this.mode === "fail") {
      this.dead = true;
      throw Object.assign(new Error("unable to accept connection, access denied"), { code: "28000" });
    }
  }
  async query() {
    if (this.dead) throw new Error("Client was closed and is not queryable");
    return { rows: [], rowCount: 1 };
  }
  async end() { this.dead = true; }
}

const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === "pg") return { Client: FakeClient };
  if (req === "@aws-sdk/dsql-signer")
    return { DsqlSigner: class { async getDbConnectAuthToken() { return "t"; } async getDbConnectAdminAuthToken() { return "t"; } } };
  return origLoad.call(this, req, ...rest);
};

process.env.TOLLROAD_DSQL_ENDPOINT = "x.dsql.us-east-1.on.aws";
const { handler } = require(target);
const meter = {
  Records: [{
    eventName: "INSERT",
    eventSourceARN: "arn:stream",
    dynamodb: { SequenceNumber: "1", NewImage: {
      type: { S: "METER" }, idempotencyKey: { S: "k" }, userId: { S: "u" }, trackId: { S: "t" },
      artistId: { S: "a" }, minuteEpoch: { N: "1" }, amountMillicents: { N: "100" },
    } },
  }],
};

(async () => {
  let failures = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log("PASS", name); }
    catch (e) { failures++; console.log("FAIL", name, "-", e.message); }
  };

  // 1. First connect fails, next warm invocation must get a fresh client.
  connectPlan = ["fail", "ok"];
  await assert.rejects(handler({ Records: [] }));
  await check("reconnects after a failed connect", async () => {
    await handler({ Records: [] });
    assert.equal(clientsCreated, 2, `expected a new client, got ${clientsCreated}`);
  });

  // 2. Connection closed by the server mid-life (DSQL's 60-minute cap).
  await check("reconnects after the server closes the connection", async () => {
    const before = clientsCreated;
    // The server closes the cached connection: the next query on it throws, as
    // pg does once the socket is gone.
    const origQuery = FakeClient.prototype.query;
    let killedOnce = false;
    FakeClient.prototype.query = async function (...a) {
      if (!killedOnce) { killedOnce = true; this.dead = true; }
      return origQuery.apply(this, a);
    };
    await assert.rejects(handler(meter)); // batch fails once; Lambda retries it
    await handler(meter);                 // the retry must succeed on a new client
    FakeClient.prototype.query = origQuery;
    assert.ok(clientsCreated > before, "retry reused the dead client");
  });

  process.exit(failures ? 1 : 0);
})();
