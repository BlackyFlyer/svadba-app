import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const { fileName, fileType, fileBase64, guestName, slug } = body;

    if (!fileName || !fileType || !fileBase64 || !slug) {
      return res.status(400).json({
        error: "Nedostaju podaci za upload.",
        debug: {
          hasFileName: Boolean(fileName),
          hasFileType: Boolean(fileType),
          hasFileBase64: Boolean(fileBase64),
          hasSlug: Boolean(slug),
        },
      });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${slug}/${Date.now()}-${randomId()}-${safeName}`;
    const buffer = Buffer.from(fileBase64, "base64");

    console.log("UPLOAD START", {
      fileName,
      fileType,
      slug,
      filePath,
      size: buffer.length,
      bucket: process.env.R2_BUCKET_NAME,
      hasR2AccountId: Boolean(process.env.R2_ACCOUNT_ID),
      hasR2AccessKey: Boolean(process.env.R2_ACCESS_KEY_ID),
      hasR2Secret: Boolean(process.env.R2_SECRET_ACCESS_KEY),
      hasPublicBaseUrl: Boolean(process.env.R2_PUBLIC_BASE_URL),
      hasSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filePath,
        Body: buffer,
        ContentType: fileType,
      })
    );

    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${filePath}`;

    const { error: dbError } = await supabase.from("wedding_photos").insert({
      event_slug: slug,
      file_path: filePath,
      original_name: fileName,
      uploaded_at: new Date().toISOString(),
      public_url: publicUrl,
      file_size: buffer.length,
      guest_name: guestName || null,
      upload_code: null,
      extension: fileName.split(".").pop()?.toLowerCase() || "jpg",
    });

    if (dbError) {
      console.error("SUPABASE INSERT ERROR", dbError);
      return res.status(500).json({
        error: `Supabase insert error: ${dbError.message}`,
      });
    }

    return res.status(200).json({
      ok: true,
      publicUrl,
    });
  } catch (err) {
    console.error("UPLOAD API ERROR", err);

    return res.status(500).json({
      error: err?.message || "Greška kod uploada.",
      stack: err?.stack || null,
    });
  }
}