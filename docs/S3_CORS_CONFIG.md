# S3 CORS Configuration for Invoice PDFs

For "View Invoice" to work with signed URLs, your S3 bucket must allow CORS from your frontend origin.

## AWS Console Steps

1. Go to **S3** → select your bucket → **Permissions** tab
2. Scroll to **Cross-origin resource sharing (CORS)**
3. Click **Edit** and paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://your-production-domain.com"
    ],
    "ExposeHeaders": []
  }
]
```

4. Replace `https://your-production-domain.com` with your actual frontend URL
5. Save changes

## Environment Variables

Ensure these are set for S3 uploads and signed URLs:

- `AWS_S3_BUCKET_NAME`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

When configured, invoice files are uploaded to S3 and `invoiceSignedUrl` is returned for viewing.

