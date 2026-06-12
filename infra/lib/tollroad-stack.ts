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

/**
 * TollRoad data + billing layer.
 *
 * The metered-billing DSP for music. See ../../README.md for the product and
 * ../../docs/data-model.md for the full data model. In short:
 *
 *  - One on-demand DynamoDB table `tollroad` is the metering hot path:
 *      • USER#<id> / BAL          — real-time balance, conditional decrement
 *                                   (hard stop-at-zero on /api/renew)
 *      • USER#<id> / EVT#<min>#<t> — metered-minute events (type=METER), with a
 *                                   generous TTL; a NEW_AND_OLD_IMAGES stream
 *                                   drives the rollup.
 *  - Aurora DSQL is the relational system-of-record: catalog, the APPEND-ONLY
 *    royalty ledger (idempotent), and precomputed per-artist/day summaries.
 *  - S3 (SSE-KMS) holds audio; CloudFront (OAC) serves it; the meter gates
 *    access with short-TTL signed cookies (CloudFront key group).
 *  - A Lambda consumes the stream and writes the ledger idempotently.
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

    // Admin connect for the rollup Lambda (writes the ledger + summaries).
    const dsqlConnectAdmin = new iam.PolicyStatement({
      actions: ["dsql:DbConnectAdmin"],
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
      autoDeleteObjects: true,
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
    if (cfPublicKeyPem) {
      const pubKey = new cloudfront.PublicKey(this, "TollroadCfPublicKey", {
        encodedKey: cfPublicKeyPem,
      });
      const keyGroup = new cloudfront.KeyGroup(this, "TollroadCfKeyGroup", {
        items: [pubKey],
      });
      trustedKeyGroups = [keyGroup];
      keyGroupId = keyGroup.keyGroupId;
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

    // CloudFront OAC must be able to decrypt with the audio CMK.
    audioKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudFrontOacDecrypt",
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:SourceArn": `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    // ---------------------------------------------------------------------
    // Lambda — Streams → idempotent royalty rollup into DSQL
    // ---------------------------------------------------------------------
    // The Node 20 runtime bundles AWS SDK v3 but not pg / the DSQL signer; the
    // shared layer carries them.
    const dsqlLayer = new lambda.LayerVersion(this, "DsqlDepsLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "layers", "dsql")),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "pg + @aws-sdk/dsql-signer for the rollup consumer",
    });

    const rollup = new lambda.Function(this, "RollupConsumerFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "rollup")),
      timeout: cdk.Duration.seconds(30),
      layers: [dsqlLayer],
      environment: {
        TABLE_NAME: table.tableName,
        DSQL_ENDPOINT: dsqlEndpoint,
        DSQL_REGION: region,
      },
    });
    table.grantStreamRead(rollup);
    rollup.addToRolePolicy(dsqlConnectAdmin);

    // Only metered-minute events (type=METER) drive the ledger. At-least-once
    // delivery + retries mean duplicates — the handler dedupes on the idempotency
    // key (UNIQUE in DSQL), so retries are safe.
    rollup.addEventSource(
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
    // Outputs
    // ---------------------------------------------------------------------
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
    new cdk.CfnOutput(this, "VercelUserPolicyJson", {
      value: cdk.Stack.of(this).toJsonString(vercelUserPolicy.toJSON()),
      description: "Least-privilege policy to attach to the tollroad-vercel IAM user",
    });
  }
}
