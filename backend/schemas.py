from typing import Literal

from pydantic import BaseModel


class ExplainRequest(BaseModel):
    term: str
    context: str


class AskRequest(BaseModel):
    question: str


class PrereqRequest(BaseModel):
    paragraph: str


class ProgressRequest(BaseModel):
    paper_name: str
    term: str
    status: Literal["understood", "needs_revision"]