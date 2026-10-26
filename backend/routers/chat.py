from fastapi import APIRouter

from schemas import AskRequest
from services.rag import ask_question

router = APIRouter(tags=["chat"])


@router.post("/ask")
async def ask(req: AskRequest):
    answer, sources = ask_question(req.question)
    return {"answer": answer, "sources": sources}