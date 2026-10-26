"use client";
import { useState } from "react";

export default function Home() {
  const [paragraphs, setParagraphs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");

    if (file.type !== "application/pdf") {
      setUploadError("Please upload a PDF file.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setParagraphs(data.paragraphs);
    } catch {
      setUploadError("Something went wrong. Make sure the backend is running.");
    }
    setUploading(false);
  };

  return (
    <main style={{ padding: "2rem", maxWidth: "900px", margin: "0 auto" }}>
      <h1>PaperPath</h1>
      <p>Never leave the paper to understand the paper.</p>

      <input type="file" accept="application/pdf" onChange={handleUpload} />

      {uploadError && <p style={{ color: "#f85149" }}>{uploadError}</p>}
      {uploading && <p>Reading your paper...</p>}

      <div style={{ marginTop: "2rem" }}>
        {paragraphs.map((p) => (
          <div
            key={p.id}
            style={{ marginBottom: "1.5rem", borderBottom: "1px solid #444", paddingBottom: "1rem" }}
          >
            <strong>Page {p.page}:</strong> {p.text}
          </div>
        ))}
      </div>
    </main>
  );
}
