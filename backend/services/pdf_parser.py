import base64
import re
from collections import Counter

import pymupdf

MIN_CHUNK = 400
MAX_TITLE_LEN = 150

FIG_DPI = 130
MIN_FIG_W = 60       # points; smaller drawings are rules, underlines, bullets
MIN_FIG_H = 40
MAX_LABEL_LEN = 400  # text longer than this is prose, so the region isn't a figure

REFERENCES_RE = re.compile(r"^(\d+\.?\s*)?(references|bibliography)$", re.I)
ABSTRACT_RE = re.compile(r"^abstract\b[\s.:\-–—]*", re.I)
FOOTNOTE_RE = re.compile(r"^[*∗†‡§¶]")
ARXIV_RE = re.compile(r"arxiv:\s*\d{4}\.\d{4,5}", re.I)
HEADING_RE = re.compile(r"^\d+(\.\d+)*\.?\s+[A-Z].{1,78}$")
KNOWN_HEADINGS = {
    "introduction", "background", "related work", "discussion",
    "conclusion", "conclusions", "acknowledgements", "acknowledgments",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _is_heading(text: str) -> bool:
    if len(text) > 80 or len(text.split()) > 12:
        return False
    if text.endswith((".", ",", ";", ":")):
        return False
    if HEADING_RE.match(text):
        return True
    return text.lower() in KNOWN_HEADINGS


def _find_title(page) -> str:
    """The title is the text with the largest font size on page 1."""
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = span["text"].strip()
                if text:
                    spans.append((span["size"], span["bbox"][1], span["bbox"][0], text))
    if not spans:
        return ""
    biggest = max(s[0] for s in spans)
    top = [s for s in spans if abs(s[0] - biggest) <= 0.5]
    top.sort(key=lambda s: (round(s[1]), s[2]))
    return _clean(" ".join(s[3] for s in top))


def _repeated_snippets(pages_blocks: list, total_pages: int) -> set:
    """Short text that repeats on many pages (running headers/footers, page numbers)."""
    counts = Counter()
    for blocks in pages_blocks:
        seen = set()
        for b in blocks:
            text = _clean(b[4])
            if text and len(text) <= 120:
                seen.add(re.sub(r"\d+", "#", text.lower()))
        counts.update(seen)
    threshold = max(3, int(total_pages * 0.4))
    return {t for t, c in counts.items() if c >= threshold}


# ---------- figures and tables ----------

def _grow(r, d):
    return pymupdf.Rect(r.x0 - d, r.y0 - d, r.x1 + d, r.y1 + d)


def _union(a, b):
    return pymupdf.Rect(min(a.x0, b.x0), min(a.y0, b.y0), max(a.x1, b.x1), max(a.y1, b.y1))


def _merge(rects, gap=6):
    """Merge rectangles that overlap or nearly touch."""
    rects = list(rects)
    changed = True
    while changed:
        changed = False
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                if _grow(rects[i], gap).intersects(rects[j]):
                    rects[i] = _union(rects[i], rects[j])
                    del rects[j]
                    changed = True
                    break
            if changed:
                break
    return rects


def _figure_regions(page, blocks):
    """
    Finds figures, diagrams and tables on a page (embedded images and vector drawings).
    Returns [(rect, {indexes of text blocks that are labels inside the figure})].
    """
    page_rect = page.rect
    rects = [pymupdf.Rect(info["bbox"]) for info in page.get_image_info()]

    if hasattr(page, "cluster_drawings"):
        try:
            rects.extend(page.cluster_drawings(x_tolerance=15, y_tolerance=15))
        except Exception:
            pass

    candidates = []
    for r in rects:
        r = r & page_rect
        if r.is_empty or r.width < MIN_FIG_W or r.height < MIN_FIG_H:
            continue
        if r.width > 0.95 * page_rect.width and r.height > 0.85 * page_rect.height:
            continue  # page border or background
        candidates.append(r)

    regions = []
    for r in _merge(candidates):
        zone = _grow(r, 4)
        absorbed = []
        for idx, b in enumerate(blocks):
            br = pymupdf.Rect(b[:4])
            area = br.width * br.height
            if area <= 0:
                continue
            inter = br & zone
            if not inter.is_empty and inter.width * inter.height >= 0.6 * area:
                absorbed.append(idx)

        # real paragraphs inside the region mean it isn't a figure
        if any(len(_clean(blocks[i][4])) > MAX_LABEL_LEN for i in absorbed):
            continue

        for i in absorbed:  # include labels that stick out a little
            r = _union(r, pymupdf.Rect(blocks[i][:4]))
        regions.append((r, set(absorbed)))
    return regions


def _render_region(page, rect) -> str:
    clip = _grow(rect, 4) & page.rect
    pix = page.get_pixmap(clip=clip, dpi=FIG_DPI)
    return "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode()


# ---------- main parser ----------

def parse_pdf(file_path: str, fallback_title: str = "") -> dict:
    """
    Returns {"title": str, "paragraphs": [items in reading order]}, where an item is
      {"kind": "text", "id", "page", "section", "text"}   or
      {"kind": "figure", "page", "section", "image"}      (a figure/table as a PNG data URI).
    Drops front matter (authors, emails), footnotes, running headers, page numbers,
    and everything from the References heading onward.
    """
    doc = pymupdf.open(file_path)
    pages = list(doc)
    total_pages = len(pages)

    pages_blocks = []
    for page in pages:
        blocks = [b for b in page.get_text("blocks") if b[6] == 0]  # text blocks only
        blocks.sort(key=lambda b: (b[1], b[0]))  # reading order
        pages_blocks.append(blocks)

    title = _find_title(pages[0]) if total_pages else ""
    if not title or len(title) > MAX_TITLE_LEN:
        title = fallback_title

    repeated = _repeated_snippets(pages_blocks, total_pages)

    items: list[dict] = []
    buffer = ""
    buffer_page = 1
    section = ""
    text_id = 0

    def flush():
        nonlocal buffer, text_id
        text = buffer.strip()
        buffer = ""
        if len(text) >= 20:  # skips stray page numbers and tiny leftovers
            items.append(
                {"kind": "text", "id": text_id, "page": buffer_page, "section": section, "text": text}
            )
            text_id += 1

    def add_text(text: str, page_num: int):
        nonlocal buffer, buffer_page
        if not buffer:
            buffer_page = page_num
        buffer = f"{buffer} {text}".strip()
        if len(buffer) >= MIN_CHUNK:
            flush()

    seen_abstract = False
    done = False

    for page_num, (page, blocks) in enumerate(zip(pages, pages_blocks), start=1):
        if done:
            break

        # if page 1 has an abstract, everything before it is front matter
        has_abstract = page_num == 1 and any(
            ABSTRACT_RE.match(_clean(b[4])) for b in blocks
        )

        figures = _figure_regions(page, blocks)
        absorbed = set()
        for _, idxs in figures:
            absorbed |= idxs

        # text blocks and figures, interleaved in reading order
        events = [("text", b[1], b[0], b) for i, b in enumerate(blocks) if i not in absorbed]
        events += [("figure", r.y0, r.x0, r) for r, _ in figures]
        events.sort(key=lambda e: (e[1], e[2]))

        for kind, _, _, payload in events:
            if kind == "figure":
                if has_abstract and not seen_abstract:
                    continue
                flush()
                items.append(
                    {
                        "kind": "figure",
                        "page": page_num,
                        "section": section,
                        "image": _render_region(page, payload),
                    }
                )
                continue

            b = payload
            raw = b[4].strip()
            text = _clean(raw)
            if not text:
                continue

            # the reference list ends the readable paper
            first_line = _clean(raw.split("\n")[0])
            if REFERENCES_RE.match(first_line):
                flush()
                done = True
                break

            if has_abstract and not seen_abstract:
                m = ABSTRACT_RE.match(text)
                if not m:
                    continue  # authors, emails, affiliations, permission notices
                seen_abstract = True
                flush()
                section = "Abstract"
                rest = text[m.end():].strip()
                if rest:
                    add_text(rest, page_num)
                continue

            if (
                text.isdigit()
                or re.sub(r"\d+", "#", text.lower()) in repeated
                or ARXIV_RE.search(text)
                or FOOTNOTE_RE.match(text)
            ):
                continue

            if _is_heading(text):
                flush()  # finish the previous section before switching
                section = text
                continue

            add_text(text, page_num)

    flush()
    doc.close()
    return {"title": title, "paragraphs": items}