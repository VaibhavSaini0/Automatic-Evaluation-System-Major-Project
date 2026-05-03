# AES — Run Locally & Remove Emergent

**Status:** The project now uses Google's native Gemini SDK. Emergent dependency has already been swapped out. Follow this guide to run it on your own machine.

---

## 1. What's still Emergent-specific?

**Basically nothing functional anymore.** Only 3 trivial cleanups remain:

| Item | Location | Why it's there | How to remove |
|---|---|---|---|
| `EMERGENT_LLM_KEY` env variable | `backend/.env` | Legacy — **unused by code** | Delete the line |
| Preview URL | `frontend/.env` | Emergent's preview host | Change to your own backend URL |
| "Made with Emergent" floating badge | Injected at runtime only | Only shown on Emergent's hosted preview | Auto-removed when you run locally |

**That's it.** The actual Python code, API logic, database layer, frontend — all vendor-neutral and portable.

---

## 2. Run locally — full recipe

### Prerequisites
- Node.js 18+ and `yarn` (`npm install -g yarn`)
- Python 3.11+
- A Supabase project (free tier) — https://supabase.com
- A Gemini API key (free) — https://aistudio.google.com/apikey

### Step 1 — Copy the code
Download or clone `backend/` and `frontend/` folders to your machine.

### Step 2 — Supabase setup (one time, ~2 min)

1. Create a Supabase project at supabase.com
2. Open **SQL Editor → New query**, paste the contents of `backend/migrations/001_init.sql`, click **Run**
3. Open **Storage → New bucket** → name: `evaluation-pdfs` → **Private** → Create
4. Open **Project Settings → API**, copy:
   - Project URL
   - `service_role` secret key (🔒 backend only)

### Step 3 — Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate              # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
CORS_ORIGINS=*
JWT_SECRET=<pick-a-long-random-string>

# Gemini (get free key at https://aistudio.google.com/apikey)
GEMINI_API_KEY=<paste-your-key-starting-with-AIza...>
GEMINI_MODEL=gemini-2.5-flash

# Supabase
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_BUCKET=evaluation-pdfs
```

**Note:** If your `requirements.txt` still contains `emergentintegrations==0.1.0`, delete that line — it's no longer used.

Run:
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

You should see `Uvicorn running on http://0.0.0.0:8001`.

### Step 4 — Frontend

```bash
cd frontend
yarn install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn start
```

Open http://localhost:3000 — you're done.

---

## 3. Cleanup — final Emergent scrub (optional, 2 min)

### Remove the unused `EMERGENT_LLM_KEY`

**`backend/.env`** — delete this line:
```env
EMERGENT_LLM_KEY=sk-emergent-...
```

**`backend/server.py`** — delete this line (around line 47):
```python
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
```

### Remove `emergentintegrations` from requirements

**`backend/requirements.txt`** — delete this line if present:
```
emergentintegrations==0.1.0
```

If it's already installed: `pip uninstall emergentintegrations` (optional — just an unused package).

---

## 4. Choosing a Gemini model

Set in `backend/.env`:

```env
GEMINI_MODEL=gemini-2.5-flash     # 250/day free, fast, great for most cases
# or
GEMINI_MODEL=gemini-2.5-pro       # 50/day free, best accuracy, slower
# or
GEMINI_MODEL=gemini-2.0-flash     # 1500/day free, fastest, decent accuracy
```

Restart backend after changing.

### Free-tier limits (Google AI Studio, 2026)

| Model | Requests/min | Requests/day |
|---|---|---|
| Gemini 2.5 Pro | ~2 | ~50 |
| Gemini 2.5 Flash | ~10 | ~250 |
| Gemini 2.0 Flash | ~15 | ~1,500 |

For > 250/day, enable billing in Google AI Studio. Pay-as-you-go is ~$0.01–0.05 per evaluation.

---

## 5. Deploying (production)

**Backend** — any of:
- Railway, Render, Fly.io (easiest for FastAPI)
- AWS Lambda + API Gateway (via Mangum)
- Google Cloud Run
- Your own VPS + nginx + gunicorn

Set the same env vars in your deployment dashboard.

**Frontend** — any of:
- Vercel, Netlify, Cloudflare Pages (easiest for React)
- Build (`yarn build`) and host the `build/` folder anywhere

Update `frontend/.env`:
```env
REACT_APP_BACKEND_URL=https://your-deployed-backend-url.com
```

Rebuild the frontend after changing this.

---

## 6. What's in the stack (no vendor lock-in)

| Layer | Tech |
|---|---|
| Frontend | React 19, Tailwind, Shadcn UI, Lucide, Recharts |
| Backend | FastAPI, Uvicorn, Pydantic, PyJWT, bcrypt, reportlab |
| Database | Supabase Postgres (standard Postgres — portable) |
| File storage | Supabase Storage (or swap for AWS S3 in 10 lines) |
| AI | Google Gemini via official `google-genai` SDK |

Every piece is open-source and swappable. Your code → your infra → your control.
