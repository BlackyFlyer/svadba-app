import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const BUCKET_NAME = "wedding-photos";

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  const [eventName] = useState("Monika & Mario");
  const [slug] = useState("monika-mario-svatovi");
  const [guestName, setGuestName] = useState("");
  const [photos, setPhotos] = useState([]);
  const [progress, setProgress] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showAdmin] = useState(window.location.search.includes("admin=1"));
  const fileInputRef = useRef(null);

  const isConfigured = Boolean(supabase);
  const uploadUrl = useMemo(() => `${window.location.origin}/${slug}`, [slug]);

  useEffect(() => {
    QRCode.toDataURL(uploadUrl, {
      width: 900,
      margin: 2,
      color: {
        dark: "#b9922f",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch((err) => console.error("QR ERROR:", err));
  }, [uploadUrl]);

  useEffect(() => {
    function handleEsc(event) {
      if (event.key === "Escape") setSelectedPhoto(null);
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  async function loadPhotos() {
    if (!supabase) return;

    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("wedding_photos")
      .select("*")
      .eq("event_slug", slug)
      .order("uploaded_at", { ascending: false });

    if (error) {
      setError(`Greška kod dohvaćanja fotografija: ${error.message}`);
      setPhotos([]);
      setLoading(false);
      return;
    }

    setPhotos(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadPhotos();
  }, [slug]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/")
    );

    if (!files.length) {
      setError("Odaberi barem jednu fotografiju.");
      return;
    }

    if (!supabase) {
      setError("Nedostaje Supabase konfiguracija.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");
    setProgress(0);

    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const filePath = `${slug}/${Date.now()}-${randomId()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        setError(`Greška kod uploada u storage: ${uploadError.message}`);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl || "";

      const insertPayload = {
        event_slug: slug,
        file_path: filePath,
        original_name: file.name,
        uploaded_at: new Date().toISOString(),
        public_url: publicUrl,
        file_size: file.size,
        guest_name: guestName || null,
        extension: file.name.split(".").pop()?.toLowerCase() || "jpg",
      };

      const { error: insertError } = await supabase
        .from("wedding_photos")
        .insert(insertPayload);

      if (insertError) {
        setError(`Greška baze: ${insertError.message}`);
        continue;
      }

      successCount += 1;
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    await loadPhotos();

    if (successCount > 0) {
      setSuccess(`Spremljeno fotografija: ${successCount}`);
    }

    setUploading(false);
    setTimeout(() => setProgress(0), 1000);
  }

  async function removePhoto(photo) {
    if (!supabase) return;

    setError("");
    setSuccess("");

    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([photo.file_path]);

    if (storageError) {
      setError(`Nisam uspio obrisati sliku: ${storageError.message}`);
      return;
    }

    const { error: dbError } = await supabase
      .from("wedding_photos")
      .delete()
      .eq("id", photo.id);

    if (dbError) {
      setError(
        `Slika je obrisana iz storagea, ali ne i iz baze: ${dbError.message}`
      );
      return;
    }

    setPhotos((prev) => prev.filter((item) => item.id !== photo.id));
    setSuccess("Fotografija je obrisana.");
    if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${slug}-qr.png`;
    a.click();
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap');

        :root {
          --gold: #b89a3a;
          --gold-deep: #9b7a1b;
          --gold-soft: #d9c486;
          --ink: #403a3b;
          --muted: #6d6668;
          --line: #eadfd6;
          --white: rgba(255,255,255,0.82);
          --shadow: 0 18px 48px rgba(66, 49, 36, 0.08);
        }

        * { box-sizing: border-box; }
        html, body, #root { min-height: 100%; }

        body {
          margin: 0;
          color: var(--ink);
          font-family: "Playfair Display", serif;
          background:
            linear-gradient(rgba(255,255,255,0.76), rgba(255,255,255,0.86)),
            url('/svecana_dvorana_stross_djakovo.jpg') center -120px / cover no-repeat fixed;
          position: relative;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background: url('/svecana_dvorana_stross_djakovo.jpg') center -120px / cover no-repeat;
          opacity: 0.24;
          filter: contrast(1.06) saturate(0.94) brightness(1.03);
          pointer-events: none;
          z-index: -2;
        }

        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,252,247,0.18), rgba(255,255,255,0.32));
          pointer-events: none;
          z-index: -1;
        }

        button, input { font: inherit; }

        .page {
          min-height: 100vh;
          animation: fadeInPage 0.8s ease;
        }

        .shell {
          width: min(920px, calc(100% - 24px));
          margin: 0 auto;
          padding: 18px 0 44px;
        }

        .hero {
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          border: 1px solid rgba(227, 213, 189, 0.92);
          background: linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.64) 54%, rgba(255,255,255,0.78) 100%);
          min-height: 300px;
          box-shadow: var(--shadow);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 26px;
          backdrop-filter: blur(1.5px);
        }

        .heroCard {
          width: 100%;
          max-width: 760px;
          min-height: 150px;
          margin: 0 auto;
          text-align: center;
          background: rgba(255,255,255,0.42);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(184,154,58,0.22);
          border-radius: 28px;
          padding: 16px 22px;
          box-shadow: 0 10px 30px rgba(91, 72, 34, 0.05);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .eyebrow {
          color: var(--gold);
          letter-spacing: 3px;
          text-transform: uppercase;
          font-size: 18px;
          margin-bottom: 6px;
        }

        .titleLogo {
          display: block;
          width: min(100%, 880px);
          height: auto;
          margin: 0 auto;
          object-fit: contain;
        }

        .subtitle {
          margin: 4px 0 0;
          color: var(--muted);
          font-size: 26px;
          line-height: 1.55;
          max-width: 720px;
        }

        .uploadWrap {
          margin-top: 22px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 22px;
        }

        .card {
          background: var(--white);
          border: 1px solid rgba(234, 223, 214, 0.95);
          border-radius: 28px;
          padding: 24px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(6px);
        }

        .cardTitle {
          margin: 0 0 18px;
          font-size: 30px;
          color: var(--ink);
          font-weight: 500;
          text-align: center;
        }

        .field { margin-bottom: 16px; }

        .label {
          display: block;
          margin-bottom: 8px;
          color: var(--muted);
          font-size: 14px;
        }

        .input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid #ddd5cc;
          background: rgba(255,255,255,0.92);
          color: var(--ink);
          outline: none;
        }

        .input:focus {
          border-color: var(--gold-soft);
          box-shadow: 0 0 0 3px rgba(184,154,58,0.12);
        }

        .dropzone {
          border: 2px dashed #dbc99b;
          border-radius: 30px;
          padding: 24px 18px;
          text-align: center;
          background: linear-gradient(180deg, rgba(255,253,248,0.84) 0%, rgba(255,255,255,0.92) 100%);
          cursor: pointer;
        }

        .dropTitle {
          margin: 0;
          color: var(--gold);
          font-size: 30px;
          font-style: italic;
          font-weight: 500;
        }

        .dropText {
          margin: 10px 0 16px;
          color: var(--muted);
          line-height: 1.7;
        }

        .btnPrimary,
        .btnDelete,
        .btnClose,
        .btnGhost {
          border-radius: 999px;
          padding: 12px 18px;
          cursor: pointer;
          transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease;
          font-weight: 600;
        }

        .btnPrimary:hover,
        .btnDelete:hover,
        .btnClose:hover,
        .btnGhost:hover { transform: translateY(-1px); }

        .btnPrimary {
          border: none;
          background: linear-gradient(135deg, #ceb45d 0%, #a88723 100%);
          color: white;
          box-shadow: 0 12px 24px rgba(168, 135, 35, 0.22), inset 0 1px 0 rgba(255,255,255,0.25);
        }

        .btnDelete {
          width: 100%;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.88);
          color: #8a6b2c;
          margin-top: 12px;
        }

        .btnClose,
        .btnGhost {
          border: 1px solid #e2d4a8;
          background: rgba(255,255,255,0.92);
          color: #8a6b2c;
        }

        .qrBox {
          display: grid;
          grid-template-columns: 150px 1fr;
          gap: 14px;
          align-items: center;
          background: linear-gradient(180deg, rgba(255,254,251,0.76) 0%, rgba(250,246,239,0.82) 100%);
          border: 1px solid #efe2cb;
          border-radius: 24px;
          padding: 16px;
          margin-top: 20px;
        }

        .qrImg {
          width: 140px;
          max-width: 100%;
          display: block;
          margin: 0 auto;
          background: white;
          border-radius: 18px;
          padding: 10px;
          border: 1px solid #f0e3c8;
        }

        .smallLabel {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--gold);
          margin-bottom: 8px;
        }

        .linkText {
          font-size: 16px;
          font-weight: 600;
          color: var(--ink);
          word-break: break-word;
        }

        .helperText {
          margin-top: 10px;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .progressWrap {
          width: 100%;
          height: 10px;
          background: #eee4cf;
          border-radius: 999px;
          overflow: hidden;
          margin-top: 16px;
        }

        .progressBar {
          height: 100%;
          background: linear-gradient(135deg, #c5a64b 0%, #a88723 100%);
          transition: width .2s ease;
        }

        .message {
          margin-top: 16px;
          padding: 14px 16px;
          border-radius: 16px;
          font-size: 15px;
        }

        .message.error {
          background: rgba(255,242,242,0.92);
          border: 1px solid #f1c9c9;
          color: #b44343;
        }

        .message.success {
          background: rgba(244,251,245,0.92);
          border: 1px solid #d6ead8;
          color: #2d8a47;
        }

        .galleryCard { margin-top: 22px; }

        .galleryHead {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .countPill {
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(252,247,235,0.9);
          border: 1px solid #efe0b9;
          color: #98781f;
          font-size: 14px;
        }

        .galleryGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 18px;
        }

        .photoCard {
          background: rgba(255,255,255,0.96);
          border: 1px solid var(--line);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(77, 60, 48, 0.06);
          animation: fadeInUp .35s ease;
        }

        .photoImg {
          width: 100%;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          display: block;
          cursor: pointer;
        }

        .photoBody { padding: 14px; }

        .photoName {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .photoMeta {
          margin-top: 6px;
          color: var(--muted);
          font-size: 13px;
        }

        .emptyState {
          text-align: center;
          padding: 42px 18px;
          border: 1px dashed #e5d7b8;
          border-radius: 24px;
          background: rgba(255,253,250,0.72);
          color: var(--muted);
        }

        .lightbox {
          position: fixed;
          inset: 0;
          background: rgba(30, 24, 18, 0.82);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 9999;
          animation: fadeInPage .2s ease;
        }

        .lightboxInner {
          max-width: min(92vw, 1000px);
          max-height: 90vh;
          text-align: center;
        }

        .lightboxImage {
          max-width: 100%;
          max-height: calc(90vh - 70px);
          border-radius: 20px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.35);
        }

        .lightboxTop {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 14px;
        }

        @keyframes fadeInPage {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 900px) {
          .hero {
            min-height: 300px;
            padding: 18px;
          }

          .heroCard { padding: 20px 16px; min-height: 140px; }
          .subtitle { font-size: 22px; }
          .qrBox { grid-template-columns: 1fr; text-align: center; }
        }

        @media (max-width: 640px) {
          .shell {
            width: min(100% - 14px, 100%);
            padding: 8px 0 24px;
          }

          .hero {
            min-height: 260px;
            border-radius: 24px;
            padding: 14px;
          }

          .heroCard,
          .card { border-radius: 22px; }

          .heroCard { min-height: 118px; }
          .card { padding: 18px; }
          .eyebrow { font-size: 15px; margin-bottom: 4px; }
          .subtitle { font-size: 20px; margin-top: 4px; }
          .cardTitle { font-size: 24px; margin-bottom: 14px; }
          .dropzone { padding: 24px 14px; }
          .dropTitle { font-size: 24px; }
          .galleryGrid { grid-template-columns: 1fr 1fr; gap: 12px; }
        }

        @media (max-width: 430px) {
          .galleryGrid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="page">
        <div className="shell">
          <section className="hero">
            <div className="heroCard">
              <div className="eyebrow">Svadbeni foto kutak</div>
              <img className="titleLogo" src="/monika-mario-logo-gold.png" alt={eventName} />
              <p className="subtitle">
                Podijelite najljepše trenutke sa svadbe i pošaljite svoje
                fotografije mladencima.
              </p>
            </div>
          </section>

          {showAdmin ? (
            <section className="card" style={{ marginTop: 22 }}>
              <h2 className="cardTitle">Admin QR za ispis</h2>
              <div className="qrBox" style={{ marginTop: 0 }}>
                <div>
                  {qrDataUrl ? <img className="qrImg" src={qrDataUrl} alt="QR kod" /> : null}
                </div>
                <div>
                  <div className="smallLabel">Link za goste</div>
                  <div className="linkText">{uploadUrl}</div>
                  <div className="helperText">
                    Ovaj QR je vidljiv samo na admin linku i služi za ispis na stolove.
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button className="btnGhost" onClick={downloadQR}>Preuzmi QR</button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="uploadWrap">
            <div className="card">
              <h2 className="cardTitle">Pošalji fotografije</h2>

              <div className="field">
                <label className="label">Ime gosta (opcionalno)</label>
                <input
                  className="input"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Npr. Ivana"
                />
              </div>

              <div
                className="dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                <h3 className="dropTitle">Dodaj svoje uspomene</h3>
                <div className="dropText">
                  Klikni ovdje i odaberi jednu ili više fotografija.
                </div>
                <button
                  className="btnPrimary"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={!isConfigured || uploading}
                  style={{ opacity: !isConfigured || uploading ? 0.55 : 1 }}
                >
                  {uploading ? "Uploadam..." : "Odaberi fotografije"}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                }}
              />

              {progress > 0 ? (
                <div className="progressWrap">
                  <div className="progressBar" style={{ width: `${progress}%` }} />
                </div>
              ) : null}

              {error ? <div className="message error">{error}</div> : null}
              {success ? <div className="message success">{success}</div> : null}
            </div>
          </section>

          <section className="card galleryCard">
            <div className="galleryHead">
              <div>
                <h2 className="cardTitle" style={{ marginBottom: 4 }}>
                  Galerija uspomena
                </h2>
              </div>
              <div className="countPill">Ukupno: {photos.length}</div>
            </div>

            {loading ? (
              <p>Učitavam...</p>
            ) : photos.length === 0 ? (
              <div className="emptyState">
                Još nema fotografija. Prve uspomene pojavit će se ovdje.
              </div>
            ) : (
              <div className="galleryGrid">
                {photos.map((photo) => (
                  <div className="photoCard" key={photo.id}>
                    <img
                      className="photoImg"
                      src={photo.public_url}
                      alt={photo.original_name}
                      onClick={() => setSelectedPhoto(photo)}
                    />
                    <div className="photoBody">
                      <div className="photoName">{photo.original_name}</div>
                      <div className="photoMeta">{formatBytes(photo.file_size)}</div>
                      {photo.guest_name ? (
                        <div className="photoMeta">Poslao/la: {photo.guest_name}</div>
                      ) : null}
                      <button className="btnDelete" onClick={() => removePhoto(photo)}>
                        Obriši
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {selectedPhoto ? (
          <div className="lightbox" onClick={() => setSelectedPhoto(null)}>
            <div className="lightboxInner" onClick={(e) => e.stopPropagation()}>
              <div className="lightboxTop">
                <button className="btnClose" onClick={() => setSelectedPhoto(null)}>
                  Zatvori
                </button>
              </div>
              <img
                className="lightboxImage"
                src={selectedPhoto.public_url}
                alt={selectedPhoto.original_name}
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}