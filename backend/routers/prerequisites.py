from fastapi import APIRouter

from schemas import PrereqRequest
from services.prerequisites import get_prerequisites

router = APIRouter(tags=["prerequisites"])


@router.post("/prerequisites")
async def prerequisites(req: PrereqRequest):
    return {"concepts": get_prerequisites(req.paragraph)}