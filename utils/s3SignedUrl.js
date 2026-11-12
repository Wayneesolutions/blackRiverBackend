// Short-lived signed links for files in the private S3 bucket. The bucket blocks public
// reads, so a raw S3 URL opens as "AccessDenied" in the browser.
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3ClientForBucket } from '../config/awsConfig.js';

const isS3Url = (url) => typeof url === 'string' && (url.includes('s3.amazonaws.com') || url.includes('.s3.'));

/** Bucket + key from a virtual-hosted (bucket.s3.region.amazonaws.com/key) or path-style URL. */
const parseS3Url = (url) => {
  const u = new URL(url.split('?')[0].split('#')[0]);
  if (u.hostname.includes('.s3.')) {
    return { bucket: u.hostname.split('.s3.')[0], key: decodeURIComponent(u.pathname.slice(1)) };
  }
  const parts = u.pathname.split('/').filter(Boolean);
  return { bucket: parts[0], key: parts.slice(1).map(decodeURIComponent).join('/') };
};

/**
 * Returns a signed GET link (default 1 hour) for an S3 URL. Non-S3 URLs (local uploads) are
 * returned unchanged, and so is the original URL if signing fails.
 */
export const signS3Url = async (url, expiresIn = 3600) => {
  if (!isS3Url(url)) return url;
  try {
    const { bucket, key } = parseS3Url(url);
    const client = await getS3ClientForBucket(bucket, url);
    return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  } catch (err) {
    console.warn('⚠️ Could not sign S3 URL:', err.message);
    return url;
  }
};

/**
 * Adds `viewUrl` (signed) to each entry of `docs` without touching the stored `url`, so a
 * record saved back from the browser never ends up holding an expiring link.
 */
export const withViewUrls = async (docs) => {
  if (!Array.isArray(docs)) return docs;
  return Promise.all(docs.map(async (d) => {
    const plain = d && typeof d.toObject === 'function' ? d.toObject() : d;
    if (!plain || !plain.url) return plain;
    return { ...plain, viewUrl: await signS3Url(plain.url) };
  }));
};
