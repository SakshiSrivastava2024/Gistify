from fastapi import APIRouter

from schemas import ExplainRequest
from services.explain import explain_term

router = APIRouter(tags=["explain"])


@router.post("/explain")
async def explain(req: ExplainRequest):
    explanation = explain_term(req.term, req.context)
    return {"explanation": explanation}
