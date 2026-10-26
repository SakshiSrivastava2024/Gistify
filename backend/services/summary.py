from services.llm import generate
from services.rag import get_all_paragraphs

MAX_CHARS = 10000  # keeps the prompt small and within Groq's rate limits


def summarize_paper() -> str:
    paragraphs = get_all_paragraphs()
    if not paragraphs:
        return ""

    text = ""
    for p in paragraphs:
        if len(text) + len(p["text"]) > MAX_CHARS:
            break
        text += f"[Page {p['page']}] {p['text']}\n\n"

    prompt = f"""You are summarizing a technical research paper for a student who has never read it.

Here is the beginning of the paper:
{text}

Write a clear summary using exactly these four headings, in plain text with no markdown symbols:

1. What problem does this paper solve?
(2-3 sentences)

2. What is the key idea?
(3-4 sentences)

3. What are the main results?
(2-3 sentences, with numbers if the text gives them)

4. Why does this matter?
(1-2 sentences)

Use only information from the text above. If a section's answer is not in the text, write "Not stated in the part of the paper I read." Use plain English and briefly explain any jargon.
"""
    return generate(prompt)