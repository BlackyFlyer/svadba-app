import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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
      });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${slug}/${Date.now()}-${randomId()}-${safeName}`;
    const buffer = Buffer.from(fileBase64, "base64");
    const deleteToken = crypto.randomBytes(24).toString("hex");

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filePath,
        Body: buffer,
        ContentType: fileType,
      })
    );

    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${filePath}`;

    const { data, error: dbError } = await supabase
      .from("wedding_photos")
      .insert({
        event_slug: slug,
        file_path: filePath,
        original_name: fileName,
        uploaded_at: new Date().toISOString(),
        public_url: publicUrl,
        file_size: buffer.length,
        guest_name: guestName || null,
        upload_code: null,
        extension: fileName.split(".").pop()?.toLowerCase() || "jpg",
        delete_token: deleteToken,
      })
      .select("id")
      .single();

    if (dbError) {
      return res.status(500).json({
        error: `Supabase insert error: ${dbError.message}`,
      });
    }

    return res.status(200).json({
      ok: true,
      publicUrl,
      photoId: data.id,
      deleteToken,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Greška kod uploada.",
    });
  }
}