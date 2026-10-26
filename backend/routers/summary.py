from fastapi import APIRouter

from services.summary import summarize_paper

router = APIRouter(tags=["summary"])


@router.post("/summarize")
async def summarize():
    return {"summary": summarize_paper()}