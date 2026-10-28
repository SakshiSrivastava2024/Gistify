"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MAX_SELECTION = 200; // a word, phrase, or short sentence

type TextItem = { kind: "text"; id: number; page: number; section: string; text: string };
type FigureItem = { kind: "figure"; page: number; section: string; image: string };
type Item = TextItem | FigureItem;
type Source = { id: number; page: number };
type Chat = { question: string; answer: string; sources: Source[] };
type Concept = { term: string; explanation: string };
type Status = "understood" | "needs_revision";
type Explanation = { id: number; term: string; text: string; loading: boolean };
type Popup = { text: string; paraId: number; x: number; y: number };

const getParaEl = (node: Node | null): HTMLElement | null => {
  const el = node instanceof Element ? node : node?.parentElement;
  return (el?.closest("[data-para-id]") as HTMLElement | null) ?? null;
};

export default function Reader() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [paperName, setPaperName] = useState("");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const [summary, setSummary] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const [popup, setPopup] = useState<Popup | null>(null);
  const [explanations, setExplanations] = useState<Record<number, Explanation[]>>({});

  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<Chat[]>([]);
  const [asking, setAsking] = useState(false);

  const [prereqs, setPrereqs] = useState<Record<number, Concept[]>>({});
  const [prereqLoadingId, setPrereqLoadingId] = useState<number | null>(null);
  const [prereqErrors, setPrereqErrors] = useState<Record<number, string>>({});
  const [progress, setProgress] = useState<Record<string, string>>({});

  // hide the popup when the selection clears or the page scrolls
  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setPopup(null);
    };
    const onScroll = () => setPopup(null);
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", onScroll);
    };
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

  const uploadFile = async (file: File) => {
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

      setItems(data.paragraphs as Item[]);
      setPaperName(data.filename);
      setTitle(data.title || data.filename);
      setExplanations({});
      setPopup(null);
      setChat([]);
      setPrereqs({});
      setPrereqErrors({});
      setProgress({});
      uploaded = true;

      try {
        const progRes = await fetch(`${API}/progress?paper_name=${encodeURIComponent(data.filename)}`);
        if (progRes.ok) setProgress(await progRes.json());
      } catch {
        // saved progress is optional
      }
    } catch {
      setUploadError("Something went wrong. Make sure the backend is running.");
    }
    setUploading(false);
    if (uploaded) void loadSummary(); // the paper shows right away, the summary arrives after
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again
    if (file) void uploadFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  // ---- highlight to explain ----

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
    const y = below > window.innerHeight - 56 ? rect.top - 52 : below;
    setPopup({ text, paraId: Number(startEl.dataset.paraId), x, y });
  };

  const patchExplanation = (paraId: number, entryId: number, patch: Partial<Explanation>) =>
    setExplanations((prev) => ({
      ...prev,
      [paraId]: (prev[paraId] ?? []).map((ex) => (ex.id === entryId ? { ...ex, ...patch } : ex)),
    }));

  const removeExplanation = (paraId: number, entryId: number) =>
    setExplanations((prev) => ({
      ...prev,
      [paraId]: (prev[paraId] ?? []).filter((ex) => ex.id !== entryId),
    }));

  const handleGistify = async () => {
    if (!popup) return;
    const { text, paraId } = popup;
    const para = items.find((p): p is TextItem => p.kind === "text" && p.id === paraId);
    if (!para) return;

    setPopup(null);
    window.getSelection()?.removeAllRanges();

    const already = (explanations[paraId] ?? []).some((ex) => ex.term.toLowerCase() === text.toLowerCase());
    if (already) return;

    const entryId = Date.now();
    setExplanations((prev) => ({
      ...prev,
      [paraId]: [{ id: entryId, term: text, text: "", loading: true }, ...(prev[paraId] ?? [])],
    }));

    try {
      const res = await fetch(`${API}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: text, context: para.text }),
      });
      if (!res.ok) throw new Error("Explain failed");
      const data = await res.json();
      patchExplanation(paraId, entryId, { text: data.explanation, loading: false });
    } catch {
      patchExplanation(paraId, entryId, { text: "Could not get an explanation. Try again.", loading: false });
    }
  };

  // ---- ask the paper ----

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || asking) return;
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
      setChat((prev) => [...prev, { question: q, answer: data.answer, sources: data.sources ?? [] }]);
    } catch {
      setChat((prev) => [...prev, { question: q, answer: "Could not get an answer. Try again.", sources: [] }]);
    }
    setAsking(false);
  };

  // ---- prerequisites + progress ----

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
      if (!data.concepts || data.concepts.length === 0) {
        setPrereqErrors((prev) => ({ ...prev, [id]: "Couldn't find prerequisites for this paragraph. Try again." }));
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

  // one citation chip per page
  const citePages = (sources: Source[]) => {
    const seen = new Map<number, number>();
    for (const s of sources) if (!seen.has(s.page)) seen.set(s.page, s.id);
    return [...seen.entries()].map(([page, id]) => ({ page, id }));
  };

  const marked = Object.entries(progress);

  return (
    <div className="rd">
      <div className="grid-bg" />
      <div className="glow" aria-hidden="true" />

      <header className="rd-top">
        <div className="rd-top-l">
          <Link href="/" className="logo">
            Gistify <span className="spark">✦</span>
          </Link>
          <Link href="/" className="back">
            ← back to landing
          </Link>
        </div>
        <div className="rd-top-r">
          {paperName && <span className="chip file-chip">{paperName}</span>}
          <button className="btn sk" onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={onPick} />
        </div>
      </header>

      <div className="rd-body">
        {items.length === 0 ? (
          <div
            className={`drop${dragging ? " over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <h1>Drop a paper here</h1>
            <p>Any research paper or white paper as a PDF. We&rsquo;ll read it and get it ready.</p>
            <button className="btn btn-cream" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Reading your paper..." : "Choose a PDF"}
            </button>
            {uploadError && <p className="msg err">{uploadError}</p>}
          </div>
        ) : (
          <div className="rd-main">
            <div onMouseUp={handleSelection}>
              {uploadError && <p className="msg err">{uploadError}</p>}
              {uploading && <p className="msg">Reading your paper...</p>}
              {summarizing && <p className="msg">Summarizing the paper...</p>}
              {summaryError && <p className="msg err">{summaryError}</p>}
              {summary && (
                <div className="sum sk">
                  <h3>Summary</h3>
                  <div>{summary}</div>
                </div>
              )}

              <h2 className="paper-title">{title}</h2>
              <p className="tip">Tip: highlight any word or phrase, then click &ldquo;Gistify this&rdquo;.</p>

              {marked.length > 0 && (
                <div className="mastery">
                  Your concepts:
                  {marked.map(([term, status]) => (
                    <span key={term} className={`pill ${status === "understood" ? "on-good" : "on-warn"}`}
                      style={{ minHeight: 28, display: "inline-flex", alignItems: "center", cursor: "default" }}>
                      {term} {status === "understood" ? "✓" : "↻"}
                    </span>
                  ))}
                </div>
              )}

              <article className="paper">
                {items.map((it, idx) => {
                  const showSection = it.section && it.section !== items[idx - 1]?.section;
                  const heading = showSection ? <h3 className="sec">{it.section}</h3> : null;

                  if (it.kind === "figure") {
                    return (
                      <div key={`fig-${idx}`}>
                        {heading}
                        <div className="fig">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={it.image} alt={`Figure from page ${it.page}`} />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={it.id}>
                      {heading}
                      <div id={`para-${it.id}`} className={`para${highlightId === it.id ? " flash" : ""}`}>
                        <p data-para-id={it.id} className="para-text">
                          {it.text}
                        </p>

                        {(explanations[it.id] ?? []).map((ex) => (
                          <div key={ex.id} className="expl">
                            <div className="expl-head">
                              <strong>{ex.term}</strong>
                              <button className="x" aria-label="Dismiss explanation" onClick={() => removeExplanation(it.id, ex.id)}>
                                ×
                              </button>
                            </div>
                            {ex.loading ? <span style={{ color: "var(--muted)" }}>Explaining...</span> : ex.text}
                          </div>
                        ))}

                        <div className="row">
                          <button
                            className="btn sk"
                            onClick={() => handleGetPrereqs(it.id, it.text)}
                            disabled={prereqLoadingId === it.id}
                          >
                            {prereqLoadingId === it.id ? "Finding prerequisites..." : "What should I know first? →"}
                          </button>
                        </div>

                        {prereqErrors[it.id] && <p className="msg err">{prereqErrors[it.id]}</p>}

                        {(prereqs[it.id] ?? []).map((c) => (
                          <div key={c.term} className="concept">
                            <strong>{c.term}</strong>
                            <p>{c.explanation}</p>
                            <div className="row">
                              <button
                                className={`pill${progress[c.term] === "understood" ? " on-good" : ""}`}
                                onClick={() => handleMarkStatus(c.term, "understood")}
                              >
                                {progress[c.term] === "understood" ? "✓ Understood" : "Mark understood"}
                              </button>
                              <button
                                className={`pill${progress[c.term] === "needs_revision" ? " on-warn" : ""}`}
                                onClick={() => handleMarkStatus(c.term, "needs_revision")}
                              >
                                {progress[c.term] === "needs_revision" ? "↻ Needs revision" : "Mark needs revision"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </article>
            </div>

            <aside className="rd-aside">
              <div className="chat-title">Ask the paper</div>
              <div className="ask sk">
                <label htmlFor="q" style={{ position: "absolute", left: -9999 }}>
                  Ask a question about the paper
                </label>
                <input
                  id="q"
                  type="text"
                  placeholder="Ask a question about the paper..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                />
                <button className="btn btn-accent" onClick={handleAsk} disabled={asking}>
                  {asking ? "Thinking..." : "Ask"}
                </button>
              </div>

              {chat.map((c, i) => {
                const none = c.answer.toLowerCase().includes("isn't covered in the paper");
                return (
                  <div key={i}>
                    <p className="q">
                      <b>Q:</b> {c.question}
                    </p>
                    <div className={`ans ${none ? "none" : "sk"}`}>{c.answer}</div>
                    {c.sources.length > 0 && (
                      <div className="cites">
                        {citePages(c.sources).map((s) => (
                          <button key={s.page} className="chip" onClick={() => jumpTo(s.id)}>
                            p. {s.page}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </aside>
          </div>
        )}
      </div>

      {popup && (
        <button
          className="btn btn-cream popup"
          style={{ left: popup.x, top: popup.y }}
          onMouseDown={(e) => e.preventDefault()} // keeps the text highlighted while clicking
          onClick={handleGistify}
        >
          ✦ Gistify this
        </button>
      )}
    </div>
  );
}