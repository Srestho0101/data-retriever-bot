# AI Pipeline Debugger — Architecture Documentation

This document teaches you the architecture of this project. Not syntax. Not "what does `async def` mean." Architecture: **why each piece exists, what job it does, how the pieces talk to each other, and what you would swap out when you move to a real API key.**

Read this while your code is open. Every section points to a specific file and a specific line.

---

## Table of Contents

1. [The Big Picture — What This System Is](#1-the-big-picture)
2. [The Physical Layout — Where Things Live](#2-the-physical-layout)
3. [The Proxy Layer — Development vs. Production](#3-the-proxy-layer)
4. [The FastAPI Backend — Your Main Learning Surface](#4-the-fastapi-backend)
5. [The Data Contract — The JSON Shape That Connects Everything](#5-the-data-contract)
6. [The React Frontend — How the UI Consumes the API](#6-the-react-frontend)
7. [The Full Request Lifecycle — Tracing "42" from Input to Screen](#7-the-full-request-lifecycle)
8. [What Is Real vs. Simulated — And Why It Doesn't Matter](#8-what-is-real-vs-simulated)
9. [Upgrade Path — Swapping in a Real AI API](#9-upgrade-path)

---

## 1. The Big Picture

This system has two environments that work differently. Understanding both is important.

### Development (inside Replit)

Three layers run together on one machine. A built-in proxy routes by path.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: FRONTEND (React + Vite)                               │
│  artifacts/chat-ui/  —  port 24918                              │
│  The user types a number. The UI sends an HTTP request.         │
└────────────────────────────┬────────────────────────────────────┘
                             │  POST /chat-api/chat  (relative path)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: REVERSE PROXY (Replit path router)                    │
│  artifact.toml — routes /chat-api/* to port 8000                │
│  The browser never talks to a port directly.                    │
└────────────────────────────┬────────────────────────────────────┘
                             │  forwarded to localhost:8000
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: FASTAPI BACKEND (Python + uvicorn)                    │
│  artifacts/fastapi-backend/main.py  —  port 8000                │
│  Validates the request. Runs the pipeline. Returns JSON.        │
└─────────────────────────────────────────────────────────────────┘
```

### Production (deployed)

The frontend and backend are now on completely separate servers and separate domains. There is no proxy — the frontend talks to the backend directly across the internet.

```
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND — GitHub Pages                                           │
│  https://srestho0101.github.io/data-retriever-bot/                │
│  Static files only. No server. No Python. No Node.                │
│  Built once from the React source, served as HTML/CSS/JS.         │
└──────────────────────────────┬─────────────────────────────────────┘
                               │  POST https://data-retriever-bot.onrender.com/chat-api/chat
                               │  Cross-origin request (different domain)
                               │  CORS header allows it
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  BACKEND — Render                                                  │
│  https://data-retriever-bot.onrender.com                          │
│  FastAPI running on Python. Always on, waiting for requests.      │
└────────────────────────────────────────────────────────────────────┘
```

This is the standard split-deployment pattern used in almost every real-world web application. Your frontend (React, Angular, Vue) lives on a CDN or static host. Your backend (FastAPI, Express, Django) lives on a server. They communicate over HTTP.

---

## 2. The Physical Layout

```
workspace/
├── artifacts/
│   ├── fastapi-backend/       ← The Python API server
│   │   ├── main.py            ← Every backend concept lives here
│   │   └── requirements.txt   ← Python dependencies
│   │
│   ├── chat-ui/               ← The React frontend
│   │   └── src/
│   │       ├── App.tsx        ← Routing and top-level providers
│   │       ├── pages/
│   │       │   └── chat.tsx   ← The entire UI lives here
│   │       └── index.css      ← Theme: fonts, colors, dark mode
│   │
│   └── api-server/            ← A Node/Express server (not used in this app)
│       └── .replit-artifact/
│           └── artifact.toml  ← The proxy routing rules ← IMPORTANT
│
└── pnpm-workspace.yaml        ← Monorepo: declares all packages
```

**Why a monorepo?**
Both the frontend and backend live in one repository. This matters because:
- One `git push` deploys everything together
- Shared tooling (TypeScript, linting) runs from the root
- The proxy router can see all services and route between them

The `pnpm-workspace.yaml` tells pnpm "these are all different packages, but treat them as one project." Each `artifacts/` directory is one deployable unit called an **artifact**.

---

## 3. The Proxy Layer — Development vs. Production

How a request from the browser reaches FastAPI is completely different between development and production. This is one of the most important things to understand about deploying web applications.

### In Development (Replit)

**File:** `artifacts/api-server/.replit-artifact/artifact.toml`

```toml
[[services]]
localPort = 8000
name = "FastAPI Backend"
paths = ["/chat-api"]

[[services]]
name = "web"
paths = ["/"]
localPort = 24918
```

The frontend uses **relative paths** in its fetch calls:

```typescript
fetch("/chat-api/chat")   // no domain, just the path
```

The browser sends this to the same domain the page came from. Replit's proxy intercepts it, reads the path, and forwards it to the right port internally:

```
Browser on srestho0101.replit.app
     │
     ├── GET /           → port 24918 (React dev server)
     └── POST /chat-api/ → port 8000  (FastAPI)
```

Frontend and backend appear to be on the same domain. The browser never knows there are two separate servers. This is the reverse proxy pattern.

**Paths are NOT rewritten.** When a request for `/chat-api/chat` arrives at FastAPI, it arrives as `/chat-api/chat` — not just `/chat`. This is why all routes in `main.py` are written with the full prefix:

```python
@app.get("/chat-api/")          # not just "/"
@app.post("/chat-api/chat")     # not just "/chat"
```

### In Production (GitHub Pages + Render)

There is no proxy. The frontend and backend are on different domains. The frontend must use **absolute URLs**:

```typescript
fetch("https://data-retriever-bot.onrender.com/chat-api/chat")
```

The browser sends this request directly to Render. Because the page is served from `srestho0101.github.io` and the request goes to `onrender.com` — a different domain — this is called a **cross-origin request**. The browser only allows it if the backend explicitly permits it via CORS headers.

This is handled in FastAPI by the CORS middleware (see Section 4.3). The backend responds with:

```
Access-Control-Allow-Origin: *
```

The browser sees this header and allows the request to complete. Without it, the browser would silently block the request — you'd see "Failed to fetch" in the console and the chat UI would break.

### How the Frontend Switches Between the Two

**File:** `artifacts/chat-ui/src/config.ts`

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function apiUrl(path: string): string {
  return API_BASE_URL + path;
}
```

- In development: `VITE_API_BASE_URL` is empty, so `apiUrl("/chat-api/chat")` returns `"/chat-api/chat"` — a relative path that goes through the Replit proxy
- In production: `VITE_API_BASE_URL=https://data-retriever-bot.onrender.com`, so `apiUrl("/chat-api/chat")` returns the full absolute URL

The `VITE_` prefix is required. Vite only exposes environment variables to the frontend bundle if they start with `VITE_`. Other env vars (like `PORT` or `DATABASE_URL`) stay server-side only and are never exposed to the browser.

The value is baked into the JavaScript bundle at build time — it is not read at runtime. This means you must rebuild the frontend any time the backend URL changes.

---

## 4. The FastAPI Backend

**File:** `artifacts/fastapi-backend/main.py`

This is your primary study target. Read through each section in order.

### 4.1 The Application Object

```python
app = FastAPI(
    title="Toy RAG + Function Calling API",
    description="...",
    version="1.0.0",
    lifespan=lifespan,
)
```

`FastAPI()` creates the application object. It's the thing that registers routes, middleware, and lifecycle hooks. It also automatically generates OpenAPI documentation at `/chat-api/docs`.

The `lifespan=lifespan` parameter connects the startup/shutdown hook. This is important.

### 4.2 The Lifespan Hook (Startup Event)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Everything before yield runs on startup
    async with httpx.AsyncClient() as client:
        response = await client.get("https://dummyjson.com/products?limit=100&...")
        PRODUCTS = response.json()["products"]
    print("✅ Knowledge base loaded: 100 products indexed.")
    
    yield   # ← The app runs here, serving requests
    
    # Everything after yield runs on shutdown
    print("Shutting down.")
```

**Why lifespan matters:** You only want to download 100 products once — when the server starts — not on every request. This hook runs once at startup, stores the data in the `PRODUCTS` list in memory, and then every request reads from that list instantly.

In a real RAG system, this is where you would:
- Connect to a vector database (Pinecone, Qdrant, Weaviate)
- Load embedding models into GPU memory
- Initialize a connection pool to PostgreSQL

The `yield` keyword is the pivot point: before it is startup, after it is shutdown. This is a Python context manager pattern.

### 4.3 CORS Middleware

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**CORS (Cross-Origin Resource Sharing)** is a browser security rule. When your WordPress site at `mysite.com` tries to call your API at `yourproject.replit.app`, the browser blocks the request unless your server explicitly says "I allow requests from other origins."

`allow_origins=["*"]` means "I allow any website to call me." For a learning/toy API, this is fine. In production, you'd restrict this to specific domains:

```python
allow_origins=["https://mywordpresssite.com", "https://myapp.com"]
```

**Important:** CORS is only enforced by browsers. When you call your API from Python, curl, or a WordPress PHP backend, CORS does not apply. It only matters for JavaScript running in a browser.

### 4.4 Pydantic Models — The Contract Enforcement Layer

```python
class ChatRequest(BaseModel):
    message: str

class ToolCall(BaseModel):
    tool_definition: dict
    args: dict
    result: dict

class ChatResponse(BaseModel):
    user_message: str
    step_1_ai_thinking: str
    step_2_tool_call: ToolCall
    step_3_rag_context: str
    step_4_ai_response: str
    knowledge_base_size: int
    error: bool = False
```

This is one of FastAPI's most important features. These classes do four things simultaneously:

1. **Validate incoming data** — if a POST body is missing `message`, FastAPI automatically returns a `422 Unprocessable Entity` error with a description of what's wrong
2. **Validate outgoing data** — if your route function tries to return something that doesn't match `ChatResponse`, it raises an error at the server before it reaches the client
3. **Document the API** — Pydantic models become the schemas in `/chat-api/docs` automatically
4. **Deserialize JSON** — `req.message` is a Python string, not a raw dictionary lookup

Think of Pydantic as a contract between the frontend and backend. Both sides agree on a shape. If either side breaks the shape, it fails loudly and immediately — not silently in production.

### 4.5 The Tool Definition

```python
TOOL_DEFINITION = {
    "name": "get_product",
    "description": "Retrieve a product record from the company knowledge base by its index.",
    "parameters": {
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "Zero-based index of the product to retrieve (0–99).",
            }
        },
        "required": ["id"],
    },
}
```

This JSON object is a function schema in the format that OpenAI, Anthropic, and most AI APIs understand. In a real system, you put this in the `tools` array when calling the AI:

```python
response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Tell me about product 42"}],
    tools=[{"type": "function", "function": TOOL_DEFINITION}]  # ← same format
)
```

The model reads the `name` and `description` and decides when to call it. It then returns `{"name": "get_product", "arguments": {"id": 42}}` and you execute the actual function yourself. This is called **function calling** or **tool use**.

In this project, the model's decision step is simulated (we always call it). But the schema, the execution logic, and the response format are identical to production.

### 4.6 The Tool Implementation

```python
def get_product(product_id: int) -> dict:
    if not PRODUCTS:
        return {"error": "Knowledge base not loaded yet."}
    if product_id < 0 or product_id >= len(PRODUCTS):
        return {"error": f"Index {product_id} is out of range."}
    return PRODUCTS[product_id]
```

Notice: this is a regular Python function, not an async route. Tools are always plain functions. The AI API tells you to call it; you call it; you send the result back to the AI.

The pattern is:
```
AI says "call get_product(42)"
    → you call get_product(42) in Python
    → you send {"role": "tool", "content": result} back to the AI
    → the AI generates a final answer using that result
```

This function reads from `PRODUCTS`, which is the in-memory list loaded at startup. In a real RAG system, this function would:
- Query a vector database for semantically similar documents
- Run a SQL query for structured data
- Call an external API
- Search a file system

### 4.7 The Routes

```python
@app.get("/chat-api/")
async def health():
    return {"status": "ok", "knowledge_base_size": len(PRODUCTS)}
```

```python
@app.get("/chat-api/products")
async def list_products(limit: int = 10, offset: int = 0):
    subset = PRODUCTS[offset : offset + limit]
    return {"total": len(PRODUCTS), "offset": offset, "limit": limit, "products": subset}
```

```python
@app.get("/chat-api/products/{product_id}")
async def get_product_by_id(product_id: int):
    result = get_product(product_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
```

```python
@app.post("/chat-api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    ...
```

**Three route patterns to understand:**

| Pattern | Example | What it is |
|---|---|---|
| `@app.get(...)` | `/chat-api/` | Query params only — data in the URL |
| `@app.get(".../{id}")` | `/chat-api/products/42` | Path param — part of the URL itself |
| `@app.post(...)` | `/chat-api/chat` | Request body — data in the JSON body |

**`response_model=ChatResponse`** on the POST route tells FastAPI to validate the return value against `ChatResponse` before sending it to the client. This catches bugs where your function returns the wrong shape.

**`async def`** — all route handlers are async. This means while waiting for network I/O (the DummyJSON download, a database query), the server can handle other requests. This is why FastAPI can handle thousands of concurrent requests on a single thread.

### 4.8 The Chat Pipeline (The Core Function)

```python
@app.post("/chat-api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    # Step 1: Parse — validate the input is a number
    product_id = int(req.message)

    # Step 2: AI Thinking — what would the model decide to do?
    thinking = random.choice(AI_THINKING_TEMPLATES).format(id=product_id)

    # Step 3: Execute the tool call
    tool_result = get_product(product_id)

    # Step 4: RAG context — describe what was retrieved
    rag_context = f"Retrieved 1 document from knowledge base (index {product_id})..."

    # Step 5: Build the grounded response
    ai_response = f"{prefix}\n\n**{product['title']}**..."

    # Step 6: Return everything — all 4 steps
    return ChatResponse(
        user_message=req.message,
        step_1_ai_thinking=thinking,
        step_2_tool_call=ToolCall(...),
        step_3_rag_context=rag_context,
        step_4_ai_response=ai_response,
        knowledge_base_size=len(PRODUCTS),
    )
```

The function doesn't just return the final answer. It returns **every step of the pipeline**. This is the architectural choice that makes this a learning tool. In production you'd return only `step_4_ai_response`. Here you return all four so you can see the machinery.

---

## 5. The Data Contract

The contract is the JSON shape that `ChatResponse` defines. Both sides of the system are built around it.

```
Backend defines it:          Frontend reads it:
─────────────────            ────────────────────────
ChatResponse                 interface ChatTurn {
  user_message: str    ←→      user_message: string
  step_1_ai_thinking   ←→      step_1_ai_thinking?: string
  step_2_tool_call     ←→      step_2_tool_call?: ToolCall
  step_3_rag_context   ←→      step_3_rag_context?: string
  step_4_ai_response   ←→      step_4_ai_response?: string
  knowledge_base_size  ←→      // used for the status bar
  error: bool          ←→      error?: boolean
                              }
```

**File:** `artifacts/fastapi-backend/main.py` — `class ChatResponse`
**File:** `artifacts/chat-ui/src/pages/chat.tsx` — `interface ChatTurn`

These two definitions must stay in sync. If you add a field to `ChatResponse` in Python, you need to add it to `ChatTurn` in TypeScript if you want to display it. If they drift apart, the app silently ignores the extra data.

In a larger production system, this contract would be defined in one place — an OpenAPI spec — and both sides would generate code from it automatically. The `/chat-api/openapi.json` endpoint already produces this spec; you could use it to generate a TypeScript client that's always in sync.

---

## 6. The React Frontend

**File:** `artifacts/chat-ui/src/App.tsx`

```tsx
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

This file is a stack of **providers**. Each provider wraps all child components and gives them access to something:

- `QueryClientProvider` — gives access to TanStack Query (caching, loading states, refetching) for all API calls
- `TooltipProvider` — gives access to hover tooltips
- `WouterRouter` — gives access to client-side routing
- `Toaster` — renders toast notifications anywhere in the app

The `base={import.meta.env.BASE_URL}` line makes the router aware that the app is mounted at `/` (or whatever path it's deployed at). Without this, navigating between pages would produce wrong URLs behind the proxy.

**File:** `artifacts/chat-ui/src/pages/chat.tsx`

The entire application lives in this one page. It has four responsibilities:

### 6.1 State Management

```tsx
const [messages, setMessages] = useState<ChatTurn[]>([]);
const [input, setInput] = useState("");
const [isLoading, setIsLoading] = useState(false);
const [kbSize, setKbSize] = useState<number | null>(null);
```

Four pieces of state:
- `messages` — the conversation history, as an array of `ChatTurn` objects
- `input` — the current text in the input box
- `isLoading` — whether a request is in flight (disables the button, shows spinner)
- `kbSize` — the "100 records" shown in the header

### 6.2 The Startup Fetch

```tsx
useEffect(() => {
  fetch(apiUrl("/chat-api/"))
    .then(res => res.json())
    .then(data => setKbSize(data.knowledge_base_size))
    .catch(console.error);
}, []);
```

`useEffect` with `[]` as the second argument runs once when the component mounts — the React equivalent of FastAPI's startup hook. It fetches the health endpoint and reads `knowledge_base_size` to populate the status bar.

`apiUrl()` is the helper from `src/config.ts`. In development it adds nothing (relative path). In production it prepends `https://data-retriever-bot.onrender.com`. The component code is identical in both environments — only the URL prefix changes.

### 6.3 The Submit Handler

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  const newTurn: ChatTurn = { user_message: userMessage };
  setMessages(prev => [...prev, newTurn]);   // ← add a "loading" turn immediately
  setIsLoading(true);

  const res = await fetch(apiUrl("/chat-api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userMessage }),
  });
  const data = await res.json();

  setMessages(prev => {
    const copy = [...prev];
    copy[copy.length - 1] = { ...copy[copy.length - 1], ...data };  // ← fill in the steps
    return copy;
  });
};
```

**The optimistic pattern:** When you hit Execute, the UI immediately adds a new turn to the messages list with only `user_message` filled in. The other fields (`step_1_ai_thinking`, etc.) are undefined. The render logic shows a loading indicator when those fields are missing. When the response arrives, `setMessages` replaces the last item with the full data, and the four pipeline steps appear.

This pattern — "add the placeholder immediately, fill it in when data arrives" — is the standard pattern for chat UIs. It makes the app feel responsive even if the server is slow.

### 6.4 The Render Logic

```tsx
{messages.map((msg, idx) => (
  <div key={idx}>
    {/* User's input — always shown */}
    <div>$> {msg.user_message}</div>
    
    {/* Pipeline output — shown only when data exists */}
    {msg.step_1_ai_thinking ? (
      <>
        <PipelineStep title="Step 1: AI Reasoning">...</PipelineStep>
        <PipelineStep title="Step 2: Tool Execution">...</PipelineStep>
        <PipelineStep title="Step 3: Retrieval (RAG)">...</PipelineStep>
        <PipelineStep title="Step 4: Grounded Generation">...</PipelineStep>
      </>
    ) : (
      <LoadingIndicator />  // ← shown while waiting
    )}
  </div>
))}
```

The condition `msg.step_1_ai_thinking ? ... : <LoadingIndicator />` switches between loading and loaded states. Since `step_1_ai_thinking` is only in the object after the API responds, this works without any explicit `isLoading` check.

### 6.5 The PipelineStep Component

```tsx
function PipelineStep({ title, icon, children, color, bgColor, borderColor }) {
  return (
    <Card className={cn("border-l-4", borderColor)}>
      <div className={cn("px-4 py-2", color, bgColor)}>
        {icon}
        {title}
      </div>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

`PipelineStep` is a **presentational component** — it has no logic, no state, no API calls. It just renders whatever `children` you pass into it, with a colored left border and a labeled header. The four steps (amber, indigo, emerald, cyan) reuse the same component with different props.

This is the core React composition pattern: extract the visual shell into a component, pass the content as `children`.

---

## 7. The Full Request Lifecycle

Tracing a single message — "42" — from keypress to screen. This shows the **production flow** (GitHub Pages → Render). The development flow is the same except Step 3 goes through the Replit proxy instead of directly to Render.

```
1. User types "42" in the Input box
   └─ React: setInput("42")

2. User clicks Execute
   └─ React: handleSubmit() fires
   └─ e.preventDefault() stops the browser from reloading
   └─ setIsLoading(true)
   └─ setMessages([{ user_message: "42" }])  ← loading turn added immediately
   └─ UI: loading spinner appears

3. Browser sends a cross-origin HTTP request
   └─ apiUrl("/chat-api/chat") resolves to the full Render URL
   └─ POST https://data-retriever-bot.onrender.com/chat-api/chat
      Origin: https://srestho0101.github.io   ← browser adds this automatically
      Content-Type: application/json
      Body: { "message": "42" }
   └─ Browser first sends an OPTIONS "preflight" to ask if cross-origin is allowed
   └─ Render responds: Access-Control-Allow-Origin: *  ← CORS middleware
   └─ Browser sees CORS is allowed, sends the real POST

4. Render receives the request directly
   └─ No proxy. The request arrives at Render's infrastructure.
   └─ Render forwards it to the uvicorn process on the internal port.

5. Uvicorn (the Python web server) receives it
   └─ Finds the route: @app.post("/chat-api/chat")
   └─ Deserializes body → ChatRequest(message="42")
   └─ Pydantic validates: message is a string ✓

6. FastAPI calls the chat() function
   └─ int("42") → product_id = 42
   └─ random.choice(AI_THINKING_TEMPLATES) → thinking string
   └─ get_product(42) → PRODUCTS[42] → the product dict
   └─ Builds rag_context string
   └─ Builds ai_response string with product data
   └─ Returns ChatResponse(...)
   └─ Pydantic validates the return shape ✓
   └─ Serialized to JSON

7. Response travels directly back to the browser
   └─ Response: 200 OK
      Access-Control-Allow-Origin: *   ← CORS header tells browser to accept this
      Body: { "user_message": "42", "step_1_ai_thinking": "...", ... }

8. Browser receives the response
   └─ React: const data = await res.json()
   └─ setMessages(prev → replace last item with { ...prev, ...data })
   └─ setIsLoading(false)

9. React re-renders
   └─ msg.step_1_ai_thinking is now defined
   └─ The condition switches from <LoadingIndicator/> to four PipelineSteps
   └─ Step 2 renders the tool call args and result as JSON code blocks
   └─ Step 4 renders the response through ReactMarkdown (bold text, etc.)
   └─ UI: all four steps appear
```

Total time in production: ~100–500ms (includes the round trip from GitHub Pages to Render). For a real LLM call, Step 6 would take 1–5 seconds on top of that.

---

## 8. What Is Real vs. Simulated

| Piece | Status | What it simulates | What is real |
|---|---|---|---|
| `PRODUCTS` list | Real | A vector database / document store | A real HTTP API call fetches this data |
| `get_product()` | Real structure, toy logic | Vector similarity search | The function pattern, the JSON schema |
| `TOOL_DEFINITION` | Fully real | Nothing — this is the exact OpenAI format | Copy-paste this into any AI API |
| `AI_THINKING_TEMPLATES` | Simulated | LLM reasoning output | The concept of step-1 reasoning |
| `AI_RESPONSE_PREFIXES` | Simulated | LLM text generation | The concept of grounded generation |
| Pydantic models | Fully real | Nothing | Identical in all FastAPI production apps |
| Lifespan hook | Fully real | Nothing | Identical pattern for DB connections |
| CORS middleware | Fully real | Nothing | Identical in all production APIs |
| Async routes | Fully real | Nothing | Identical in all FastAPI production apps |
| The proxy routing | Fully real | Nothing | nginx / ALB in production |
| React fetch() | Fully real | Nothing | Same pattern in any real frontend |
| State management | Fully real | Nothing | Same pattern in any real chat UI |

**The conclusion:** You've built the frame of a production system. The parts you'd swap out — the template strings — are all in one place at the top of `main.py`. The parts you'd keep — everything else — are already production-grade.

---

## 9. Upgrade Path

When you get an API key, here is the exact surgery required. Nothing else changes.

### Step 1: Add the API client

```python
# In main.py, top of file
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key="your-key-here")  # use an env var, never hardcode
```

### Step 2: Replace the simulated thinking with a real planning call

```python
# BEFORE (simulated):
thinking = random.choice(AI_THINKING_TEMPLATES).format(id=product_id)

# AFTER (real):
planning_response = await client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": f"The user wants info about product #{product_id}. What tool should I call?"}],
    tools=[{"type": "function", "function": TOOL_DEFINITION}]
)
thinking = planning_response.choices[0].message.content
tool_call_args = planning_response.choices[0].message.tool_calls[0].function.arguments
product_id = json.loads(tool_call_args)["id"]  # the model chose the id
```

### Step 3: Replace the simulated response with a real generation call

```python
# BEFORE (simulated):
ai_response = random.choice(AI_RESPONSE_PREFIXES) + f"\n\n**{p['title']}**..."

# AFTER (real):
grounded_response = await client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": f"Tell me about product #{product_id}"},
        {"role": "assistant", "tool_calls": [...]},
        {"role": "tool", "content": json.dumps(tool_result)}  # ← this is RAG
    ]
)
ai_response = grounded_response.choices[0].message.content
```

### Step 4 (optional): Replace the array lookup with a real vector search

```python
# BEFORE (simulated):
return PRODUCTS[product_id]

# AFTER (real):
embedding = await client.embeddings.create(
    model="text-embedding-3-small",
    input=user_query
)
results = await vector_db.query(embedding.data[0].embedding, top_k=1)
return results[0]
```

Everything else — the Pydantic models, the CORS middleware, the lifespan hook, the route structure, the React frontend — stays exactly the same.

---

## Where to Go From Here

After reading through the code with this document open, the natural sequence is:

1. **Explore the auto-generated docs** at `/chat-api/docs` — try calling each endpoint from the browser UI
2. **Browse the knowledge base** at `/chat-api/products?limit=10&offset=0` — change the offset and limit in the URL
3. **Read `main.py` top to bottom** — every concept is labeled and commented
4. **Break something intentionally** — delete a field from `ChatResponse`, see what error FastAPI throws
5. **Get an API key** — swap in `AsyncOpenAI`, run the same frontend unchanged, watch it work

The system is designed so that understanding each layer individually is more important than understanding how they all connect. Once you understand each layer, the connections become obvious.
