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


def ask_question(question: str, top_k: int = 4):
    count = collection.count()
    if count == 0:
        return "Upload a paper first.", []

    results = collection.query(
        query_texts=[question],
        n_results=min(top_k, count),
    )

    ids = results["ids"][0]
    chunks = results["documents"][0]
    pages = [m["page"] for m in results["metadatas"][0]]

    context = "\n\n".join(
        f"[Page {page}]: {chunk}" for chunk, page in zip(chunks, pages)
    )

    prompt = f"""Answer the question using only the context below.
If the answer is not in the context, reply with exactly: "{NOT_COVERED}"
Otherwise, answer clearly and mention the page number(s) you used.

Context:
{context}

Question: {question}
"""
    answer = generate(prompt)

    if NOT_COVERED.lower() in answer.lower():
        return answer, []

    sources = [{"id": int(i), "page": p} for i, p in zip(ids, pages)]
    return answer, sources