import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const IMAGES_BUCKET = process.env.TOLLROAD_IMAGES_BUCKET;

const CT_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
export function extForContentType(ct: string): string | null {
  return CT_EXT[ct] ?? null;
}
export function buildImageKey(
  prefix: "track-covers" | "artist-avatars", id: string, ext: string, rand: string,
): string {
  return `${prefix}/${id}-${rand}.${ext}`;
}
export function imagesConfigured(): boolean {
  return Boolean(IMAGES_BUCKET);
}
let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}
export async function presignImagePut(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: IMAGES_BUCKET!, Key: key, ContentType: contentType });
  return getSignedUrl(client(), cmd, { expiresIn: 300 });
}
