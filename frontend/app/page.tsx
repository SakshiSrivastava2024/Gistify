"use client";
import { useEffect, useState } from "react";

type Source = { id: number; page: number };
type Chat = { question: string; answer: string; sources: Source[] };
type Concept = { term: string; explanation: string };
type Status = "understood" | "needs_revision";
type Explanation = { id: number; term: string; text: string; loading: boolean };
type Popup = { text: string; paraId: number; x: number; y: number };

const API = "http://localhost:8000";
const MAX_SELECTION = 200; // a word, phrase, or short sentence
const UI_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const getParaEl = (node: Node | null): HTMLElement | null => {
  const el = node instanceof Element ? node : node?.parentElement;
  return (el?.closest("[data-para-id]") as HTMLElement | null) ?? null;
};

export default function Home() {
  // items are text paragraphs or figures, in reading order
  const [paragraphs, setParagraphs] = useState<any[]>([]);
  const [paperName, setPaperName] = useState("");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);

  // summary
  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  // highlight-to-explain
  const [popup, setPopup] = useState<Popup | null>(null);
  const [explanations, setExplanations] = useState<{ [paraId: number]: Explanation[] }>({});

  // ask the paper
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<Chat[]>([]);
  const [asking, setAsking] = useState(false);

  // prerequisites + progress
  const [prereqs, setPrereqs] = useState<{ [key: number]: Concept[] }>({});
  const [prereqLoadingId, setPrereqLoadingId] = useState<number | null>(null);
  const [prereqErrors, setPrereqErrors] = useState<{ [key: number]: string }>({});
  const [progress, setProgress] = useState<{ [term: string]: string }>({});

  // hide the popup when the selection is cleared (e.g. click elsewhere)
  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setPopup(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const loadSummary = async () => {
    setSummary("");
    setSummaryError("");
    setSummarizing(true);
    try {
      const res = await fetch(`${API}/summarize`, { method: "POST" });
      if (!res.ok) throw new Error("Summary failed");
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      setSummaryError("Couldn't generate a summary. You can still read and ask questions.");
    }
    setSummarizing(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");

    if (file.type !== "application/pdf") {
      setUploadError("Please upload a PDF file.");
      return;
    }

    setUploading(true);
    let uploaded = false;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setParagraphs(data.paragraphs);
      setPaperName(data.filename);
      setTitle(data.title || data.filename);
      setExplanations({});
      setPopup(null);
      setChatHistory([]);
      setPrereqs({});
      setPrereqErrors({});
      setProgress({});
      uploaded = true;

      try {
        const progRes = await fetch(
          `${API}/progress?paper_name=${encodeURIComponent(data.filename)}`
        );
        if (progRes.ok) setProgress(await progRes.json());
      } catch {
        // progress is optional, ignore failures
      }
    } catch {
      setUploadError("Something went wrong. Make sure the backend is running.");
    }

    setUploading(false);
    if (uploaded) loadSummary();
  };

  // --- highlight to explain ---

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPopup(null);
      return;
    }

    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text || text.length > MAX_SELECTION) {
      setPopup(null);
      return;
    }

    // the selection must stay inside one paragraph
    const startEl = getParaEl(sel.anchorNode);
    const endEl = getParaEl(sel.focusNode);
    if (!startEl || startEl !== endEl) {
      setPopup(null);
      return;
    }

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 80), window.innerWidth - 80);
    const below = rect.bottom + 8;
    const y = below > window.innerHeight - 48 ? rect.top - 44 : below;

    setPopup({ text, paraId: Number(startEl.dataset.paraId), x, y });
  };

  const updateExplanation = (paraId: number, entryId: number, patch: Partial<Explanation>) => {
    setExplanations((prev) => ({
      ...prev,
      [paraId]: (prev[paraId] || []).map((ex) =>
        ex.id === entryId ? { ...ex, ...patch } : ex
      ),
    }));
  };

  const removeExplanation = (paraId: number, entryId: number) => {
    setExplanations((prev) => ({
      ...prev,
      [paraId]: (prev[paraId] || []).filter((ex) => ex.id !== entryId),
    }));
  };

  const handleGistify = async () => {
    if (!popup) return;
    const { text, paraId } = popup;
    const para = paragraphs.find((p) => p.kind === "text" && p.id === paraId);
    if (!para) return;

    setPopup(null);
    window.getSelection()?.removeAllRanges();

    // don't ask twice for the same term in the same paragraph
    const already = (explanations[paraId] || []).some(
      (ex) => ex.term.toLowerCase() === text.toLowerCase()
    );
    if (already) return;

    const entryId = Date.now();
    setExplanations((prev) => ({
      ...prev,
      [paraId]: [{ id: entryId, term: text, text: "", loading: true }, ...(prev[paraId] || [])],
    }));

    try {
      const res = await fetch(`${API}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: text, context: para.text }),
      });
      if (!res.ok) throw new Error("Explain failed");
      const data = await res.json();
      updateExplanation(paraId, entryId, { text: data.explanation, loading: false });
    } catch {
      updateExplanation(paraId, entryId, {
        text: "Could not get an explanation. Try again.",
        loading: false,
      });
    }
  };

  // --- ask the paper ---

  const handleAsk = async () => {
    if (!question.trim()) return;
    const q = question;
    setAsking(true);
    setQuestion("");

    try {
      const res = await fetch(`${API}/ask`, {
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

  // --- prerequisites + progress ---

  const handleGetPrereqs = async (id: number, paragraph: string) => {
    setPrereqLoadingId(id);
    setPrereqErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`${API}/prerequisites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paragraph }),
      });
      if (!res.ok) throw new Error("Prerequisites failed");
      const data = await res.json();

      if (data.concepts.length === 0) {
        setPrereqErrors((prev) => ({
          ...prev,
          [id]: "Couldn't find prerequisites for this paragraph. Try again.",
        }));
      } else {
        setPrereqs((prev) => ({ ...prev, [id]: data.concepts }));
      }
    } catch {
      setPrereqErrors((prev) => ({ ...prev, [id]: "Something went wrong. Try again." }));
    }
    setPrereqLoadingId(null);
  };

  const handleMarkStatus = async (term: string, status: Status) => {
    try {
      const res = await fetch(`${API}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_name: paperName, term, status }),
      });
      if (res.ok) setProgress((prev) => ({ ...prev, [term]: status }));
    } catch {
      // keep the old status if saving fails
    }
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
      <p style={{ color: "#8b949e", marginTop: 0 }}>
        Never leave the paper to understand the paper.
      </p>

      <input type="file" accept="application/pdf" onChange={handleUpload} />

      {uploadError && <p style={{ color: "#f85149" }}>{uploadError}</p>}
      {uploading && <p style={{ color: "#8b949e" }}>Reading your paper...</p>}

      {summarizing && <p style={{ color: "#8b949e" }}>Summarizing the paper...</p>}
      {summaryError && <p style={{ color: "#f85149" }}>{summaryError}</p>}
      {summary && (
        <div
          style={{
            marginTop: "1rem",
            background: "#161b22",
            border: "1px solid #30363d",
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            whiteSpace: "pre-line",
            lineHeight: 1.6,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Summary</h3>
          {summary}
        </div>
      )}

      {paragraphs.length > 0 && (
        <p style={{ color: "#8b949e", fontSize: "0.85rem", marginTop: "1.5rem", marginBottom: 0 }}>
          Tip: highlight any word or phrase in the paper, then click "Gistify this".
        </p>
      )}

      {paragraphs.length > 0 && (
        <div style={{ marginTop: "1rem", display: "flex", gap: "2rem" }}>
          {/* Left: paper reader */}
          <div
            onMouseUp={handleSelection}
            onScroll={() => setPopup(null)}
            style={{
              flex: 2,
              maxHeight: "80vh",
              overflowY: "auto",
              paddingRight: "1.5rem",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "1.05rem",
            }}
          >
            <h2 style={{ fontSize: "1.7rem", lineHeight: 1.3, marginTop: 0 }}>{title}</h2>

            {paragraphs.map((p, idx) => {
              const showSection = p.section && p.section !== paragraphs[idx - 1]?.section;
              const heading = showSection ? (
                <h3
                  style={{
                    fontFamily: UI_FONT,
                    fontSize: "1.2rem",
                    margin: "1.75rem 0 0.75rem",
                  }}
                >
                  {p.section}
                </h3>
              ) : null;

              // figures and tables come through as images, in reading order
              if (p.kind === "figure") {
                return (
                  <div key={`fig-${idx}`}>
                    {heading}
                    <div style={{ margin: "1.25rem 0", textAlign: "center" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image}
                        alt={`Figure from page ${p.page}`}
                        style={{
                          maxWidth: "100%",
                          background: "#fff",
                          borderRadius: "6px",
                          padding: "6px",
                        }}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div key={p.id}>
                  {heading}

                  <div
                    id={`para-${p.id}`}
                    style={{
                      marginBottom: "1.25rem",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                      background: highlightId === p.id ? "#3b3200" : "transparent",
                      transition: "background 0.4s",
                    }}
                  >
                    <p data-para-id={p.id} style={{ lineHeight: 1.8, margin: 0 }}>
                      {p.text}
                    </p>

                    {/* explanations from highlighted text */}
                    {(explanations[p.id] || []).map((ex) => (
                      <div
                        key={ex.id}
                        style={{
                          marginTop: "0.5rem",
                          fontFamily: UI_FONT,
                          fontSize: "0.95rem",
                          background: "#161b22",
                          border: "1px solid #30363d",
                          borderLeft: "3px solid #388bfd",
                          padding: "0.75rem",
                          borderRadius: "6px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                          <strong>{ex.term}</strong>
                          <button
                            onClick={() => removeExplanation(p.id, ex.id)}
                            style={{ background: "transparent", color: "#8b949e", padding: "0 0.4rem" }}
                            aria-label="Dismiss explanation"
                          >
                            ×
                          </button>
                        </div>
                        <div style={{ marginTop: "0.25rem", lineHeight: 1.5 }}>
                          {ex.loading ? (
                            <span style={{ color: "#8b949e" }}>Explaining...</span>
                          ) : (
                            ex.text
                          )}
                        </div>
                      </div>
                    ))}

                    {/* prerequisites */}
                    <div style={{ marginTop: "0.5rem" }}>
                      <button
                        onClick={() => handleGetPrereqs(p.id, p.text)}
                        disabled={prereqLoadingId === p.id}
                      >
                        {prereqLoadingId === p.id
                          ? "Finding prerequisites..."
                          : "What should I know first?"}
                      </button>
                    </div>

                    {prereqErrors[p.id] && (
                      <p style={{ color: "#f85149", marginTop: "0.5rem", fontFamily: UI_FONT }}>
                        {prereqErrors[p.id]}
                      </p>
                    )}

                    {prereqs[p.id] && (
                      <div style={{ marginTop: "0.5rem" }}>
                        {prereqs[p.id].map((c, i) => (
                          <div
                            key={i}
                            style={{
                              fontFamily: UI_FONT,
                              fontSize: "0.95rem",
                              background: "#161b22",
                              border: "1px solid #30363d",
                              padding: "0.75rem",
                              borderRadius: "6px",
                              marginBottom: "0.5rem",
                            }}
                          >
                            <strong>{c.term}</strong>
                            <p style={{ margin: "0.25rem 0 0.5rem" }}>{c.explanation}</p>

                            <button
                              onClick={() => handleMarkStatus(c.term, "understood")}
                              style={{
                                marginRight: "0.5rem",
                                background: progress[c.term] === "understood" ? "#238636" : "#30363d",
                              }}
                            >
                              {progress[c.term] === "understood" ? "✅ Understood" : "Mark Understood"}
                            </button>
                            <button
                              onClick={() => handleMarkStatus(c.term, "needs_revision")}
                              style={{
                                background: progress[c.term] === "needs_revision" ? "#9e6a03" : "#30363d",
                              }}
                            >
                              {progress[c.term] === "needs_revision"
                                ? "🔁 Needs Revision"
                                : "Mark Needs Revision"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: ask the paper */}
          <div style={{ flex: 1, borderLeft: "1px solid #30363d", paddingLeft: "1.5rem" }}>
            <h3 style={{ marginTop: 0 }}>Ask the paper</h3>

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
                        lineHeight: 1.5,
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
                            style={{
                              marginRight: "0.4rem",
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                            }}
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
              style={{ width: "100%", boxSizing: "border-box", marginBottom: "0.5rem" }}
            />
            <button onClick={handleAsk} disabled={asking}>
              {asking ? "Thinking..." : "Ask"}
            </button>
          </div>
        </div>
      )}

      {/* floating "Gistify this" button, shown next to the highlighted text */}
      {popup && (
        <button
          onMouseDown={(e) => e.preventDefault()} // keeps the text highlighted while clicking
          onClick={handleGistify}
          style={{
            position: "fixed",
            left: popup.x,
            top: popup.y,
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "#388bfd",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            padding: "0.45rem 0.9rem",
            borderRadius: "999px",
            fontWeight: 600,
          }}
        >
          Gistify this
        </button>
      )}
    </main>
  );
}