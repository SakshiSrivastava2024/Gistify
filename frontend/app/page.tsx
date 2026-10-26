"use client";
import { useState } from "react";

type Source = { id: number; page: number };
type Chat = { question: string; answer: string; sources: Source[] };

export default function Home() {
  const [paragraphs, setParagraphs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const [termInputs, setTermInputs] = useState<{ [key: number]: string }>({});
  const [explanations, setExplanations] = useState<{ [key: number]: string }>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<Chat[]>([]);
  const [asking, setAsking] = useState(false);

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
      setChatHistory([]);
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
      if (!res.ok) throw new Error("Explain failed");
      const data = await res.json();
      setExplanations((prev) => ({ ...prev, [id]: data.explanation }));
    } catch {
      setExplanations((prev) => ({
        ...prev,
        [id]: "Could not get an explanation. Try again.",
      }));
    }
    setLoadingId(null);
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    const q = question;
    setAsking(true);
    setQuestion("");

    try {
      const res = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error("Ask failed");
      const data = await res.json();
      setChatHistory((prev) => [
        ...prev,
        { question: q, answer: data.answer, sources: data.sources },
      ]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        { question: q, answer: "Could not get an answer. Try again.", sources: [] },
      ]);
    }
    setAsking(false);
  };

  const jumpTo = (id: number) => {
    const el = document.getElementById(`para-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 2000);
  };

  return (
    <main style={{ padding: "2rem", maxWidth: "1300px", margin: "0 auto" }}>
      <h1>Gistify</h1>
      <p>Never leave the paper to understand the paper.</p>

      <input type="file" accept="application/pdf" onChange={handleUpload} />

      {uploadError && <p style={{ color: "#f85149" }}>{uploadError}</p>}
      {uploading && <p>Reading your paper...</p>}

      {paragraphs.length > 0 && (
        <div style={{ marginTop: "2rem", display: "flex", gap: "2rem" }}>
          {/* Left: paper reader */}
          <div style={{ flex: 2, maxHeight: "80vh", overflowY: "auto", paddingRight: "1rem" }}>
            {paragraphs.map((p) => (
              <div
                key={p.id}
                id={`para-${p.id}`}
                style={{
                  marginBottom: "1.5rem",
                  borderBottom: "1px solid #444",
                  paddingBottom: "1rem",
                  background: highlightId === p.id ? "#3b3200" : "transparent",
                  transition: "background 0.4s",
                }}
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
                  onKeyDown={(e) => e.key === "Enter" && handleExplain(p.id, p.text)}
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

          {/* Right: ask the paper */}
          <div style={{ flex: 1, borderLeft: "1px solid #444", paddingLeft: "1.5rem" }}>
            <h3>Ask the paper</h3>

            <div style={{ maxHeight: "60vh", overflowY: "auto", marginBottom: "1rem" }}>
              {chatHistory.map((c, i) => {
                const notCovered = c.answer.toLowerCase().includes("isn't covered in the paper");
                return (
                  <div key={i} style={{ marginBottom: "1rem" }}>
                    <p>
                      <strong>Q:</strong> {c.question}
                    </p>
                    <p
                      style={{
                        background: notCovered ? "#2d1b1b" : "#161b22",
                        color: notCovered ? "#f85149" : "inherit",
                        fontStyle: notCovered ? "italic" : "normal",
                        border: "1px solid #30363d",
                        padding: "0.5rem",
                        borderRadius: "6px",
                      }}
                    >
                      {c.answer}
                    </p>
                    {c.sources.length > 0 && (
                      <div>
                        {c.sources.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => jumpTo(s.id)}
                            style={{ marginRight: "0.4rem", fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                          >
                            p. {s.page}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <input
              type="text"
              placeholder="Ask a question about the paper"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
            <button onClick={handleAsk} disabled={asking}>
              {asking ? "Thinking..." : "Ask"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}