import json

from services.llm import generate


def get_prerequisites(paragraph: str) -> list[dict]:
    prompt = f"""You are helping a student understand a research paper.

Here is a paragraph from the paper:
"{paragraph}"

Identify 3 to 5 prerequisite concepts a reader needs to understand this paragraph.
For each concept give:
- "term": the concept name
- "explanation": a short, simple explanation (2-3 sentences) with no unexplained jargon

Return only a JSON object in exactly this format:
{{"concepts": [{{"term": "concept name", "explanation": "simple explanation"}}]}}
"""
    raw = generate(prompt, json_mode=True)

    try:
        data = json.loads(raw)
        return [
            {"term": str(c["term"]), "explanation": str(c["explanation"])}
            for c in data.get("concepts", [])
            if "term" in c and "explanation" in c
        ]
    except (json.JSONDecodeError, TypeError, AttributeError):
        return []