import os
import shutil
from fastapi import APIRouter, UploadFile, File

from config import UPLOAD_DIR
from services.pdf_parser import parse_pdf

router = APIRouter(tags=["papers"])


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    paragraphs = parse_pdf(file_path)
    return {"filename": file.filename, "paragraphs": paragraphs}