import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const { photoId, deleteToken } = body;

    if (!photoId || !deleteToken) {
      return res.status(400).json({ error: "Nedostaju podaci za brisanje." });
    }

    const { data: photo, error: fetchError } = await supabase
      .from("wedding_photos")
      .select("id, file_path, delete_token")
      .eq("id", photoId)
      .single();

    if (fetchError || !photo) {
      return res.status(404).json({ error: "Fotografija nije pronađena." });
    }

    if (photo.delete_token !== deleteToken) {
      return res.status(403).json({ error: "Nemaš pravo obrisati ovu fotografiju." });
    }

    await r2.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: photo.file_path,
      })
    );

    const { error: deleteError } = await supabase
      .from("wedding_photos")
      .delete()
      .eq("id", photoId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Greška kod brisanja.",
    });
  }
}