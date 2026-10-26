from pydantic import BaseModel


class ExplainRequest(BaseModel):
    term: str
    context: str


class AskRequest(BaseModel):
    question: str