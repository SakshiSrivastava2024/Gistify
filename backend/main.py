from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import FRONTEND_ORIGIN
from db.database import init_db
from routers import papers, explain, chat, prerequisites, progress

app = FastAPI(title="Gistify API")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(papers.router)
app.include_router(explain.router)
app.include_router(chat.router)
app.include_router(prerequisites.router)
app.include_router(progress.router)


@app.get("/health")
def health():
    return {"status": "ok"}