import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
LLM_MODEL = "openai/gpt-oss-120b"

UPLOAD_DIR = "uploads"
FRONTEND_ORIGIN = "http://localhost:3000"