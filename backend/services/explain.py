from services.llm import generate


def explain_term(term: str, context: str) -> str:
    prompt = f"""You are helping a student understand a research paper.

The student doesn't understand this term: "{term}"

Here is the paragraph it appears in:
"{context}"

Explain the term in simple, plain English (2-3 sentences).
Then explain how it is specifically being used in this paragraph (1-2 sentences).
Do not use other jargon in your explanation. If you must use a technical word, briefly define it too.
"""
    return generate(prompt)