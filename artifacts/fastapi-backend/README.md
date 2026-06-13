# FastAPI Toy RAG + Function Calling Backend

This is your learning backend. It implements the full pipeline pattern used in production AI systems — without requiring a real API key.

## How to run

```bash
uvicorn artifacts.fastapi-backend.main:app --reload --port 8000
```

Or via the workflow (already configured).

## Endpoints to explore

| Method | Path | What it teaches |
|--------|------|----------------|
| `GET`  | `/chat-api/` | Health check, FastAPI basics |
| `GET`  | `/chat-api/products?limit=5` | Query params, response models |
| `GET`  | `/chat-api/products/{id}` | Path params, 404 handling |
| `GET`  | `/chat-api/tool-definition` | What a function-calling schema looks like |
| `POST` | `/chat-api/chat` | Full RAG + tool-use pipeline |

## Interactive docs

FastAPI generates these automatically:
- Swagger UI: `/chat-api/docs`
- ReDoc: `/chat-api/redoc`
- OpenAPI JSON: `/chat-api/openapi.json`

## The pipeline (what happens on POST /chat-api/chat)

```
User types "42"
        │
        ▼
Step 1: AI THINKING
  "I need to call get_product(id=42) to fetch context before answering."
        │
        ▼
Step 2: TOOL CALL  ← this is "function calling"
  get_product(id=42) → returns the product dict from PRODUCTS[42]
        │
        ▼
Step 3: RAG CONTEXT  ← this is "retrieval-augmented generation"
  "Retrieved 1 document. Injecting into prompt."
        │
        ▼
Step 4: AI RESPONSE  ← grounded in the retrieved document
  "Based on retrieved context: [product info]"
```

## Key FastAPI concepts in this file

- **Pydantic models** (`BaseModel`): automatic validation + serialization
- **Lifespan events** (`@asynccontextmanager`): startup/shutdown hooks
- **Async routes** (`async def`): non-blocking I/O
- **Path params** (`/products/{id}`): typed URL segments
- **Query params** (`limit: int = 10`): typed with defaults
- **CORS middleware**: allowing cross-origin requests from the frontend
- **Response models** (`response_model=ChatResponse`): enforced output shape
- **HTTPException**: proper error responses with status codes
