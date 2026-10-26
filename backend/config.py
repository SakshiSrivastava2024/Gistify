import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEN_MODEL = "gemini-2.5-flash"
EMBED_MODEL = "models/gemini-embedding-001"

UPLOAD_DIR = "uploads"
FRONTEND_ORIGIN = "http://localhost:3000"