#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { TollroadStack } from "../lib/tollroad-stack";

const app = new cdk.App();

// All TollRoad resources live in us-east-1 (co-located with Bedrock on-demand
// and Aurora DSQL). Pass the CloudFront signing public key to enable the
// signed-cookie gate:  cdk deploy -c cfPublicKey="$(cat cf_public_key.pem)"
new TollroadStack(app, "TollroadStack", {
  env: { region: "us-east-1" },
  description:
    "TollRoad billing layer: DynamoDB metering hot path + Aurora DSQL ledger + KMS/CloudFront audio",
});

cdk.Tags.of(app).add("project", "tollroad");
cdk.Tags.of(app).add("app", "tollroad");
