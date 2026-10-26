from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import FRONTEND_ORIGIN
from routers import papers, explain, chat

app = FastAPI(title="Gistify API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(papers.router)
app.include_router(explain.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok"}