from groq import Groq

from config import GROQ_API_KEY, LLM_MODEL

client = Groq(api_key=GROQ_API_KEY)


def generate(prompt: str, temperature: float = 0.3) -> str:
    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
    )
    return response.choices[0].message.content