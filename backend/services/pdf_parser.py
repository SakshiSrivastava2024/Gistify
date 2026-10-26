import fitz  # PyMuPDF


def parse_pdf(file_path: str, min_chunk_size: int = 400):
    """
    Extracts text per page using layout-aware blocks, then merges
    small fragments into readable paragraph-sized chunks.
    Returns a list of dicts: {id, page, text}
    """
    doc = fitz.open(file_path)
    paragraphs = []
    para_id = 0

    for page_num, page in enumerate(doc, start=1):
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))  # reading order

        buffer = ""
        for b in blocks:
            text = b[4].strip()
            if not text:
                continue

            buffer += " " + text

            if len(buffer) >= min_chunk_size:
                paragraphs.append({
                    "id": para_id,
                    "page": page_num,
                    "text": buffer.strip()
                })
                para_id += 1
                buffer = ""

        if buffer.strip():
            paragraphs.append({
                "id": para_id,
                "page": page_num,
                "text": buffer.strip()
            })
            para_id += 1

    doc.close()
    return paragraphs