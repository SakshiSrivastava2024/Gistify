import chromadb

from services.llm import generate

client = chromadb.Client()
collection = client.get_or_create_collection("paper_chunks")

NOT_COVERED = "This isn't covered in the paper."


def index_paragraphs(paragraphs: list[dict]) -> None:
    # clear the previous paper before indexing a new one
    existing = collection.get()
    if existing["ids"]:
        collection.delete(ids=existing["ids"])

    if not paragraphs:
        return

    collection.add(
        ids=[str(p["id"]) for p in paragraphs],
        documents=[p["text"] for p in paragraphs],
        metadatas=[{"page": p["page"]} for p in paragraphs],
    )


def ask_question(question: str, top_k: int = 6):
    count = collection.count()
    if count == 0:
        return "Upload a paper first.", []

    results = collection.query(
        query_texts=[question],
        n_results=min(top_k, count),
    )

    found = {
        int(i): (doc, meta["page"])
        for i, doc, meta in zip(
            results["ids"][0], results["documents"][0], results["metadatas"][0]
        )
    }

    # always include the opening chunks (abstract/intro) so broad questions have context
    head = collection.get(ids=[str(i) for i in range(min(3, count))])
    for i, doc, meta in zip(head["ids"], head["documents"], head["metadatas"]):
        found.setdefault(int(i), (doc, meta["page"]))

    ordered = sorted(found.items())  # reading order
    context = "\n\n".join(f"[Page {page}]: {doc}" for _, (doc, page) in ordered)

    prompt = f"""Answer the question using only the context below.
You may summarize and combine what the context says, but do not add outside facts, examples, or guesses.
Only if the context contains nothing relevant to the question, reply with exactly: "{NOT_COVERED}"
Otherwise, answer clearly and mention the page number(s) you used.

Context:
{context}

Question: {question}
"""
    answer = generate(prompt)

    if NOT_COVERED.lower() in answer.lower():
        return answer, []

    sources = [{"id": i, "page": page} for i, (_, page) in ordered]
    return answer, sources


def get_all_paragraphs() -> list[dict]:
    data = collection.get()
    items = [
        {"id": int(i), "page": m["page"], "text": d}
        for i, d, m in zip(data["ids"], data["documents"], data["metadatas"])
    ]
    return sorted(items, key=lambda p: p["id"])  # reading order