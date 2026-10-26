"use client";
import { useState } from "react";

export default function Home() {
  const [paragraphs, setParagraphs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [termInputs, setTermInputs] = useState<{ [key: number]: string }>({});
  const [explanations, setExplanations] = useState<{ [key: number]: string }>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);

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
      setExplanations({});
    } catch {
      setUploadError("Something went wrong. Make sure the backend is running.");
    }
    setUploading(false);
  };

  const handleExplain = async (id: number, context: string) => {
    const term = termInputs[id];
    if (!term) return;

    setLoadingId(id);
    try {
      const res = await fetch("http://localhost:8000/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, context }),
      });
      const data = await res.json();
      setExplanations((prev) => ({ ...prev, [id]: data.explanation }));
    } catch {
      setExplanations((prev) => ({ ...prev, [id]: "Could not get an explanation. Try again." }));
    }
    setLoadingId(null);
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
            <p>
              <strong>Page {p.page}:</strong> {p.text}
            </p>

            <input
              type="text"
              placeholder="Term you don't understand"
              value={termInputs[p.id] || ""}
              onChange={(e) =>
                setTermInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
              }
              style={{ marginRight: "0.5rem" }}
            />
            <button onClick={() => handleExplain(p.id, p.text)}>
              {loadingId === p.id ? "Explaining..." : "Explain"}
            </button>

            {explanations[p.id] && (
              <div
                style={{
                  marginTop: "0.5rem",
                  background: "#161b22",
                  border: "1px solid #30363d",
                  padding: "0.75rem",
                  borderRadius: "6px",
                }}
              >
                {explanations[p.id]}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}