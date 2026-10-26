from fastapi import APIRouter

from db.database import get_progress, save_progress
from schemas import ProgressRequest

router = APIRouter(tags=["progress"])


@router.post("/progress")
async def update_progress(req: ProgressRequest):
    save_progress(req.paper_name, req.term, req.status)
    return {"ok": True}


@router.get("/progress")
async def read_progress(paper_name: str):
    return get_progress(paper_name)