// Bedrock Titan v2 text embeddings for TollRoad.
//
// Exposes pure helpers buildTitanBody/parseTitanResponse (no network),
// and an embed() function that invokes amazon.titan-embed-text-v2:0
// via BedrockRuntimeClient + InvokeModelCommand.
// Embeddings are 1024-dimensional.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.TOLLROAD_VECTOR_REGION ?? "us-east-1";
const MODEL_ID = "amazon.titan-embed-text-v2:0";

/**
 * Builds the JSON request body for Titan embeddings.
 * Returns a JSON string with inputText, dimensions (1024), and normalize (true).
 */
export function buildTitanBody(text: string): string {
  return JSON.stringify({
    inputText: text,
    dimensions: 1024,
    normalize: true,
  });
}

/**
 * Parses the Bedrock response and extracts the embedding array.
 */
export function parseTitanResponse(json: unknown): number[] {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid response: expected an object");
  }

  const response = json as Record<string, unknown>;
  const embedding = response.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error("Invalid response: expected embedding array");
  }

  return embedding;
}

/**
 * Calls Amazon Bedrock to generate embeddings for the given text.
 * Returns a 1024-dimensional embedding vector.
 */
export async function embed(text: string): Promise<number[]> {
  const client = new BedrockRuntimeClient({ region: REGION });
  const body = buildTitanBody(text);

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    body,
    contentType: "application/json",
    accept: "application/json",
  });

  const response = await client.send(command);

  // Parse the response body (it's a Uint8Array)
  const responseBody = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(responseBody);

  return parseTitanResponse(parsed);
}
