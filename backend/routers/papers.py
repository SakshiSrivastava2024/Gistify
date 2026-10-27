import os
import shutil
from fastapi import APIRouter, UploadFile, File

from config import UPLOAD_DIR
from services.pdf_parser import parse_pdf
from services.rag import index_paragraphs

router = APIRouter(tags=["papers"])


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    parsed = parse_pdf(file_path, fallback_title=file.filename)

    # only text goes into the search index; figures are shown in the reader
    text_items = [p for p in parsed["paragraphs"] if p["kind"] == "text"]
    index_paragraphs(text_items)

    return {
        "filename": file.filename,
        "title": parsed["title"],
        "paragraphs": parsed["paragraphs"],
    }