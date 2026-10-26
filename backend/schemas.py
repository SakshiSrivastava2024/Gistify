from pydantic import BaseModel


class ExplainRequest(BaseModel):
    term: str
    context: str