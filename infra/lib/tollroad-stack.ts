import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dsql from "aws-cdk-lib/aws-dsql";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kms from "aws-cdk-lib/aws-kms";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";

/**
 * TollRoad data + billing layer.
 *
 * The metered-billing DSP for music. See ../../README.md for the product and
 * ../../docs/data-model.md for the full data model. In short:
 *
 *  - One on-demand DynamoDB table `tollroad` is the metering hot path:
 *      • USER#<id> / BAL          — real-time balance, conditional decrement
 *                                   (hard stop-at-zero on /api/renew)
 *      • USER#<id> / EVT#<min>#<t> — metered-minute events (type=METER), and
 *                                   USER#<id> / TOPUP#<ref> top-up events
 *                                   (type=TOPUP), with a generous TTL; a
 *                                   NEW_AND_OLD_IMAGES stream drives the projector.
 *  - Aurora DSQL is the relational read side / system-of-record: catalog, the
 *    APPEND-ONLY royalty ledger (idempotent), precomputed per-artist/day
 *    summaries, and the eventually-consistent reconciliation balance.
 *  - S3 (SSE-KMS) holds audio; CloudFront (OAC) serves it; the meter gates
 *    access with short-TTL signed cookies (CloudFront key group).
 *  - A projector Lambda consumes the stream and is the SOLE writer of the DSQL
 *    read models (ledger, summaries, wallet_topups, reconciliation balance).
 *
 * Hackathon posture: everything DESTROYs on teardown. Flip to RETAIN for real.
 */
export class TollroadStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const region = cdk.Stack.of(this).region;

    // ---------------------------------------------------------------------
    // DynamoDB — single table `tollroad` (metering hot path)
    // ---------------------------------------------------------------------
    const table = new dynamodb.Table(this, "TollroadTable", {
      tableName: "tollroad",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI1 — reverse lookups (e.g. ARTIST#<id> → recent metered events). Sparse:
    // only items that set GSI1PK/GSI1SK are indexed.
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ---------------------------------------------------------------------
    // Aurora DSQL — relational system-of-record (catalog · ledger · summaries)
    // ---------------------------------------------------------------------
    const dsqlCluster = new dsql.CfnCluster(this, "TollroadDsql", {
      deletionProtectionEnabled: false, // hackathon
    });
    // Standard DSQL endpoint host. DDL lives in docs/data-model.md; apply it with
    // scripts/migrate-dsql.mjs once the cluster is up.
    const dsqlEndpoint = `${dsqlCluster.attrIdentifier}.dsql.${region}.on.aws`;

    // Admin connect for the API Lambda (catalog/auth/library DDL + reads).
    const dsqlConnectAdmin = new iam.PolicyStatement({
      actions: ["dsql:DbConnectAdmin"],
      resources: [dsqlCluster.attrResourceArn],
    });
    // Least-privilege connect for the projector Lambda: dsql:DbConnect (NOT admin).
    // It authenticates as a dedicated DML-only role provisioned by the additive
    // migration; this is the only writer of the DSQL read models.
    const dsqlConnectProjector = new iam.PolicyStatement({
      actions: ["dsql:DbConnect"],
      resources: [dsqlCluster.attrResourceArn],
    });

    // ---------------------------------------------------------------------
    // KMS — the CMK that protects audio at rest (the "stream keys")
    // ---------------------------------------------------------------------
    // SSE-KMS on the audio bucket. CloudFront (via OAC) decrypts transparently —
    // our code never calls KMS per play — so the CDN stays hot. Key rotation is
    // managed by KMS, not by hand.
    const audioKey = new kms.Key(this, "TollroadAudioKey", {
      alias: "alias/tollroad-audio",
      description: "SSE-KMS CMK for TollRoad audio objects",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------------
    // S3 — audio objects (encrypted at rest with the CMK, fully private)
    // ---------------------------------------------------------------------
    // Audio is permanent catalog content (no expiry). The browser uploads via a
    // presigned PUT minted by the app; reads only ever go through CloudFront.
    const audioBucket = new s3.Bucket(this, "TollroadAudioBucket", {
      bucketName: `tollroad-audio-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: audioKey,
      enforceSSL: true,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ["http://localhost:3000"], // add the Vercel origin post-deploy
          exposedHeaders: ["ETag"],
          maxAge: 3600,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // NOTE: autoDeleteObjects intentionally omitted. Its custom resource +
      // bucket-policy edits form a circular dependency with the SSE-KMS key and
      // the CloudFront OAC bucket policy (CFN rejects the changeset). On destroy,
      // empty the bucket first. Audio is permanent catalog content anyway.
    });

    // ---------------------------------------------------------------------
    // CloudFront — OAC origin + signed-cookie gate (the meter's enforcement)
    // ---------------------------------------------------------------------
    // The meter authorizes a stream by issuing a short-TTL signed cookie; without
    // it, CloudFront refuses the segments. Signing uses a CloudFront key group:
    // the operator generates an RSA keypair, keeps the private key in the app's
    // env (TOLLROAD_CF_PRIVATE_KEY) to sign cookies, and registers the PUBLIC key
    // here. Pass the PEM via `-c cfPublicKey="$(cat public_key.pem)"`.
    const cfPublicKeyPem = this.node.tryGetContext("cfPublicKey") as string | undefined;
    let trustedKeyGroups: cloudfront.IKeyGroup[] | undefined;
    let keyGroupId = "(none — pass -c cfPublicKey to enable signed cookies)";
    // The PublicKey id doubles as the CloudFront key-pair id the API uses to sign
    // stream URLs (TOLLROAD_CF_KEY_PAIR_ID).
    let cfKeyPairId: string | undefined;
    if (cfPublicKeyPem) {
      const pubKey = new cloudfront.PublicKey(this, "TollroadCfPublicKey", {
        encodedKey: cfPublicKeyPem,
      });
      const keyGroup = new cloudfront.KeyGroup(this, "TollroadCfKeyGroup", {
        items: [pubKey],
      });
      trustedKeyGroups = [keyGroup];
      keyGroupId = keyGroup.keyGroupId;
      cfKeyPairId = pubKey.publicKeyId;
    }

    // OAC S3 origin: CloudFront authenticates to the private bucket and is granted
    // kms:Decrypt on the CMK so SSE-KMS objects are served transparently.
    const distribution = new cloudfront.Distribution(this, "TollroadCdn", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(audioBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // Signed cookies are the gate. With no key group (no PEM passed) the
        // distribution is open — fine for first bring-up, lock down before demo.
        trustedKeyGroups,
      },
      comment: "TollRoad audio delivery (OAC + SSE-KMS, signed-cookie gated)",
    });

    // ---------------------------------------------------------------------
    // S3 + CloudFront — public images bucket (cover art + avatars)
    // ---------------------------------------------------------------------
    // Not sensitive: no KMS, no signed URLs. CloudFront (OAC) serves it
    // publicly; the API presigns PUTs for browser uploads.
    const imagesBucket = new s3.Bucket(this, "TollroadImagesBucket", {
      bucketName: `tollroad-images-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // public read is via CloudFront OAC, not the bucket
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [{
        allowedHeaders: ["*"],
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
        allowedOrigins: ["http://localhost:3000", "https://www.tollroadmusic.xyz"],
        exposedHeaders: ["ETag"],
        maxAge: 3600,
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const imagesDistribution = new cloudfront.Distribution(this, "TollroadImagesCdn", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(imagesBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // No trustedKeyGroups: images are public.
      },
      comment: "TollRoad images (cover art + avatars, public via OAC)",
    });

    // CloudFront OAC must be able to decrypt with the audio CMK.
    // Scope by account (wildcard distribution id), NOT distribution.distributionId:
    // referencing the concrete id makes the KMS key depend on the distribution,
    // which depends on the bucket, which depends on the key — a circular
    // dependency CFN rejects. The wildcard keeps the grant OAC-only while
    // breaking the cycle (matches CDK's own auto-generated OAC key policy).
    audioKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudFrontOacDecrypt",
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": cdk.Aws.ACCOUNT_ID,
          },
          ArnLike: {
            "aws:SourceArn": `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/*`,
          },
        },
      })
    );

    // ---------------------------------------------------------------------
    // Lambda — Streams → CQRS projector (the SOLE writer of the DSQL read models)
    // ---------------------------------------------------------------------
    // Under polyglot CQRS the command path writes only to DynamoDB; this consumer
    // projects METER/TOPUP events into the DSQL ledger, summaries, wallet_topups
    // and the reconciliation balance. The Node 20 runtime bundles AWS SDK v3 but
    // not pg / the DSQL signer; the shared layer carries them.
    const dsqlLayer = new lambda.LayerVersion(this, "DsqlDepsLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "layers", "dsql")),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "pg + @aws-sdk/dsql-signer for the projector consumer",
    });

    const projector = new lambda.Function(this, "ProjectorConsumerFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "projector")),
      timeout: cdk.Duration.seconds(30),
      layers: [dsqlLayer],
      environment: {
        TOLLROAD_DSQL_ENDPOINT: dsqlEndpoint,
        TOLLROAD_DSQL_REGION: region,
        // DML-only role, not admin (see dsqlConnectProjector). Provisioned by the
        // additive migration; override to "admin" only for a quick laptop demo.
        TOLLROAD_DSQL_USER: "projector",
      },
    });
    table.grantStreamRead(projector);
    projector.addToRolePolicy(dsqlConnectProjector);

    // METER + TOPUP inserts drive the read models. At-least-once delivery + retries
    // mean duplicates — the projector dedupes on the idempotency key / payment ref
    // (PRIMARY KEY in DSQL), so retries are safe. Two filter patterns OR together:
    // INSERT AND type IN (METER, TOPUP).
    projector.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        retryAttempts: 3,
        bisectBatchOnError: true,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("INSERT"),
            dynamodb: { NewImage: { type: { S: lambda.FilterRule.isEqual("METER") } } },
          }),
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("INSERT"),
            dynamodb: { NewImage: { type: { S: lambda.FilterRule.isEqual("TOPUP") } } },
          }),
        ],
      })
    );

    // ---------------------------------------------------------------------
    // IAM — least-privilege policy for the Vercel app (managed outside CDK)
    // ---------------------------------------------------------------------
    // The Next.js server routes on Vercel run the hot path (/api/renew: balance
    // decrement + metered event), presign audio uploads, and read catalog /
    // summaries from DSQL. Attach this to the tollroad-vercel IAM user.
    const vercelUserPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          sid: "TollroadMeterHotPath",
          actions: [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:Query",
          ],
          resources: [table.tableArn, `${table.tableArn}/index/*`],
        }),
        new iam.PolicyStatement({
          sid: "TollroadAudioUpload",
          actions: ["s3:PutObject"],
          resources: [audioBucket.arnForObjects("audio/*")],
        }),
        new iam.PolicyStatement({
          sid: "TollroadAudioUploadKms",
          actions: ["kms:GenerateDataKey", "kms:Decrypt"],
          resources: [audioKey.keyArn],
        }),
        new iam.PolicyStatement({
          sid: "TollroadDsqlConnect",
          actions: ["dsql:DbConnect"], // create a scoped DB role for app reads
          resources: [dsqlCluster.attrResourceArn],
        }),
      ],
    });

    // ---------------------------------------------------------------------
    // API — the standalone backend (API Gateway REST + a single proxy Lambda)
    // ---------------------------------------------------------------------
    // One Lambda runs the whole backend router (../../backend/src/lambda.ts); it
    // dispatches every /v1 route, so we need just one function + one proxy
    // resource. The front-end, third-party apps, and AI agents are all clients of
    // this API. Secrets are supplied at deploy time via context (-c name=value)
    // or edited on the function afterwards.
    const ctx = (name: string): string | undefined => this.node.tryGetContext(name) as string | undefined;

    const apiEnv: Record<string, string> = {
      NODE_ENV: "production",
      TOLLROAD_DSQL_ENDPOINT: dsqlEndpoint,
      TOLLROAD_DSQL_REGION: region,
      TOLLROAD_CDN_DOMAIN: distribution.distributionDomainName,
      TOLLROAD_IMAGES_BUCKET: imagesBucket.bucketName,
      // The command path runs the balance debit + meter/top-up events on this
      // table; the Streams → projector pipeline then builds the DSQL read models
      // (backend/src/domain/wallet-store.ts).
      TOLLROAD_TABLE: table.tableName,
    };
    // Prefer a freshly-minted key group (when -c cfPublicKey is passed); otherwise
    // reuse an existing key-pair id supplied via -c TOLLROAD_CF_KEY_PAIR_ID. Without
    // this fallback a plain deploy drops the var from the Lambda and breaks signed
    // streaming (the CF signing setup lives outside CDK).
    const cfKeyPairIdCtx = ctx("TOLLROAD_CF_KEY_PAIR_ID");
    if (cfKeyPairId) apiEnv.TOLLROAD_CF_KEY_PAIR_ID = cfKeyPairId;
    else if (cfKeyPairIdCtx) apiEnv.TOLLROAD_CF_KEY_PAIR_ID = cfKeyPairIdCtx;
    for (const k of [
      "TOLLROAD_SESSION_SECRET",
      "TOLLROAD_CF_PRIVATE_KEY",
      // OTP email goes out via ZeptoMail SMTP (backend/src/domain/email.ts). Only
      // the API token is secret; host/port/user/sender default in code. Supplied
      // at deploy via -c and dropped on a plain redeploy, so keep them in
      // backend/.env as the restore source.
      "TOLLROAD_SMTP_PASS",
      "TOLLROAD_SMTP_HOST",
      "TOLLROAD_SMTP_PORT",
      "TOLLROAD_SMTP_USER",
      "TOLLROAD_SMTP_SENDER",
      "TOLLROAD_ALLOWED_ORIGINS",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      // Telegram sign-up notifications (backend/src/domain/notify.ts). No IAM
      // needed — the bot is reached over plain HTTPS. Like the other secrets,
      // supplied at deploy via -c and dropped on a plain redeploy, so keep them
      // in backend/.env as the restore source.
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
    ]) {
      const v = ctx(k);
      if (v) apiEnv[k] = v;
    }

    const apiFn = new NodejsFunction(this, "ApiFn", {
      functionName: "tollroad-api",
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "..", "backend", "src", "lambda.ts"),
      // The backend is a sibling package of infra/; bundle it from its own root
      // (where esbuild + its deps live).
      projectRoot: path.join(__dirname, "..", "..", "backend"),
      depsLockFilePath: path.join(__dirname, "..", "..", "backend", "package-lock.json"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: apiEnv,
      bundling: {
        format: OutputFormat.ESM,
        target: "node20",
        // The Node 20 runtime ships the AWS SDK v3 — don't bundle it.
        externalModules: ["@aws-sdk/*"],
        // pg (and other CJS deps) call require() of Node builtins; under ESM
        // output esbuild stubs require() with a thrower ("Dynamic require of
        // 'events' is not supported"). Re-create a real require so they work.
        banner: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
      },
    });
    // The API reads catalog/ledger/library on DSQL and runs the DynamoDB command
    // path (balance debit + meter/top-up events); it generates the IAM auth token
    // itself (DbConnectAdmin). Under CQRS it no longer writes the DSQL ledger — the
    // projector does. Email sign-in codes go out via ZeptoMail SMTP (plain
    // HTTPS/SMTP, no IAM needed), so SES permissions are no longer granted.
    apiFn.addToRolePolicy(dsqlConnectAdmin);
    // Bedrock: embed text for vibe discovery (Task 4).
    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [`arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`],
    }));
    // The command path runs entirely on DynamoDB: conditional balance debit/credit
    // (UpdateItem), real-time balance read (GetItem), recent-meter gate (Query on
    // GSI1), and the METER/TOPUP event writes (PutItem) that drive the stream →
    // projector. Scope to the table + its indexes.
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "TollroadCommandPath",
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
        ],
        resources: [table.tableArn, `${table.tableArn}/index/*`],
      })
    );
    // Grant the API Lambda write access to the images bucket for presigned PUTs.
    imagesBucket.grantPut(apiFn);

    // REST API. Stage `v1` ⇒ invoke URL .../v1/<route>. The proxy ANY method
    // requires an API key (usage-plan attribution + throttling) — the metering/
    // monetization surface for the public API. The front-end proxy and agents
    // both present a key. CORS preflight (OPTIONS) and the Stripe webhook are
    // key-exempt. End-user identity is the session JWT, verified inside the
    // handlers (see backend/src/lib/http.ts); a per-route Gateway authorizer
    // (backend/src/handlers/authorizer.ts) is available if stricter gating is
    // wanted later.
    const allowedOrigins = (ctx("TOLLROAD_ALLOWED_ORIGINS") ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const api = new apigw.RestApi(this, "TollroadApi", {
      restApiName: "tollroad-api",
      description: "TollRoad metered streaming API (x402-style)",
      binaryMediaTypes: ["audio/mpeg", "application/octet-stream"],
      deployOptions: {
        stageName: "v1",
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization", "x-api-key", "stripe-signature", "Range"],
        allowCredentials: true,
      },
    });

    const lambdaIntegration = new apigw.LambdaIntegration(apiFn);

    // Stripe can't send an API key — give the webhook its own key-exempt path.
    const stripeRes = api.root.addResource("stripe").addResource("webhook");
    stripeRes.addMethod("POST", lambdaIntegration, { apiKeyRequired: false });

    // Everything else flows through the keyed proxy.
    api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
      defaultMethodOptions: { apiKeyRequired: true },
    });

    // Usage plan + keys: one for the consumer app, one for the demo agent. Real
    // third parties would each get their own key + plan tier.
    const plan = api.addUsagePlan("TollroadUsagePlan", {
      name: "tollroad-standard",
      throttle: { rateLimit: 50, burstLimit: 100 },
      quota: { limit: 1_000_000, period: apigw.Period.MONTH },
    });
    plan.addApiStage({ stage: api.deploymentStage });
    const appKey = api.addApiKey("TollroadAppKey", { apiKeyName: "tollroad-app" });
    const agentKey = api.addApiKey("TollroadAgentKey", { apiKeyName: "tollroad-demo-agent" });
    plan.addApiKey(appKey);
    plan.addApiKey(agentKey);

    // ---------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------
    new cdk.CfnOutput(this, "ApiBaseUrl", {
      value: api.url, // ends with /v1/
      description: "Set as NEXT_PUBLIC_API_BASE (the front-end + agents call this)",
    });
    new cdk.CfnOutput(this, "AppApiKeyId", {
      value: appKey.keyId,
      description: "Front-end app API key id — fetch the value via `aws apigateway get-api-key --include-value`",
    });
    new cdk.CfnOutput(this, "AgentApiKeyId", {
      value: agentKey.keyId,
      description: "Demo-agent API key id (for scripts/agent-demo.mjs)",
    });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "TableStreamArn", { value: table.tableStreamArn ?? "" });
    new cdk.CfnOutput(this, "DsqlClusterArn", { value: dsqlCluster.attrResourceArn });
    new cdk.CfnOutput(this, "DsqlEndpoint", {
      value: dsqlEndpoint,
      description: "Set as TOLLROAD_DSQL_ENDPOINT for the app + migration",
    });
    new cdk.CfnOutput(this, "AudioBucketName", {
      value: audioBucket.bucketName,
      description: "Set as TOLLROAD_AUDIO_BUCKET for presigned uploads",
    });
    new cdk.CfnOutput(this, "AudioKeyArn", { value: audioKey.keyArn });
    new cdk.CfnOutput(this, "CdnDomain", {
      value: distribution.distributionDomainName,
      description: "CloudFront domain for audio (set as TOLLROAD_CDN_DOMAIN)",
    });
    new cdk.CfnOutput(this, "CdnDistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "CfKeyGroupId", { value: keyGroupId });
    new cdk.CfnOutput(this, "ImagesCdnDomain", {
      value: imagesDistribution.distributionDomainName,
      description: "CloudFront domain for images (set frontend NEXT_PUBLIC_IMAGES_BASE = https://<this>)",
    });
    new cdk.CfnOutput(this, "ImagesBucketName", { value: imagesBucket.bucketName });
    new cdk.CfnOutput(this, "VercelUserPolicyJson", {
      value: cdk.Stack.of(this).toJsonString(vercelUserPolicy.toJSON()),
      description: "Least-privilege policy to attach to the tollroad-vercel IAM user",
    });
  }
}
