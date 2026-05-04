from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import io
import json
import logging
import re
import uuid
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from supabase import create_client, Client
from google import genai
from google.genai import types
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.graphics.shapes import Drawing, Rect, String

from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.graphics.shapes import Drawing, Rect, String, Circle
from reportlab.graphics import renderPDF
import qrcode
import csv


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Local scratch dir for temporary PDF files (upload to Gemini)
TMP_DIR = ROOT_DIR / 'tmp_uploads'
TMP_DIR.mkdir(exist_ok=True)

# Supabase client (service role — bypasses RLS, backend-only)
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_SERVICE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
SUPABASE_BUCKET = os.environ.get('SUPABASE_BUCKET', 'evaluation-pdfs')
sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback-secret')
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 7

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-pro')

# Native Google SDK client (preferred when GEMINI_API_KEY is set)
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

app = FastAPI()
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

USER_SAFE_COLS = "id,name,email,role,roll_no,created_at"


# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    roll_no: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    roll_no: Optional[str] = None


class AuthOut(BaseModel):
    token: str
    user: UserOut


class QuestionMark(BaseModel):
    question_no: str
    max_marks: float
    awarded_marks: float
    feedback: str


class EvaluationOut(BaseModel):
    id: str
    student_roll_no: str
    student_name: Optional[str] = None
    teacher_id: str
    teacher_name: Optional[str] = None
    subject: Optional[str] = None
    questions: List[QuestionMark]
    total_awarded: float
    total_max: float
    percentage: float
    overall_feedback: str
    strengths: List[str]
    weaknesses: List[str]
    created_at: str


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, pw_hash: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), pw_hash.encode('utf-8'))


def create_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload['sub']
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail='Invalid token')
    res = sb.table('users').select(USER_SAFE_COLS).eq('id', user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail='User not found')
    return res.data[0]


async def require_teacher(user=Depends(get_current_user)):
    if user['role'] != 'teacher':
        raise HTTPException(status_code=403, detail='Teacher access only')
    return user


# ---------- Auth Routes ----------
@api_router.post('/auth/register', response_model=AuthOut)
async def register(data: RegisterIn):
    if data.role not in ('teacher', 'student'):
        raise HTTPException(status_code=400, detail='Role must be teacher or student')
    if data.role == 'student' and not data.roll_no:
        raise HTTPException(status_code=400, detail='Roll number required for students')

    email = data.email.lower()
    existing = sb.table('users').select('id').eq('email', email).limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail='Email already registered')
    if data.role == 'student':
        dup = sb.table('users').select('id').eq('roll_no', data.roll_no).eq('role', 'student').limit(1).execute()
        if dup.data:
            raise HTTPException(status_code=400, detail='Roll number already in use')

    user_id = str(uuid.uuid4())
    doc = {
        'id': user_id,
        'name': data.name,
        'email': email,
        'password_hash': hash_password(data.password),
        'role': data.role,
        'roll_no': data.roll_no if data.role == 'student' else None,
    }
    sb.table('users').insert(doc).execute()
    token = create_token(user_id)
    return AuthOut(
        token=token,
        user=UserOut(id=user_id, name=data.name, email=email,
                     role=data.role, roll_no=doc['roll_no'])
    )


@api_router.post('/auth/login', response_model=AuthOut)
async def login(data: LoginIn):
    res = sb.table('users').select('id,name,email,role,roll_no,password_hash')\
        .eq('email', data.email.lower()).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail='Invalid credentials')
    user = res.data[0]
    if not verify_password(data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    token = create_token(user['id'])
    return AuthOut(
        token=token,
        user=UserOut(id=user['id'], name=user['name'], email=user['email'],
                     role=user['role'], roll_no=user.get('roll_no'))
    )


@api_router.get('/auth/me', response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return UserOut(id=user['id'], name=user['name'], email=user['email'],
                   role=user['role'], roll_no=user.get('roll_no'))


# ---------- Students ----------
@api_router.get('/students')
async def list_students(user=Depends(require_teacher)):
    res = sb.table('users').select(USER_SAFE_COLS).eq('role', 'student').execute()
    return res.data


# ---------- Evaluation ----------
EVAL_SYSTEM_PROMPT_BASE = """You are an academic evaluator. You will receive THREE PDF documents:
1. QUESTION PAPER
2. ANSWER KEY  
3. STUDENT ANSWER SHEET

STEP 1 — PARSE:
Split student answers using markers like Q1, Ans 1, 1), etc. Be tolerant of OCR errors and messy formatting.

STEP 2 — EVALUATE:

For each question, compare the student's answer against the answer key.

Apply the grading rules below EXACTLY. These rules override your default judgment.

{STRICTNESS_RULE}

IMPORTANT SCORING INSTRUCTIONS:
- First classify the answer into ONE category: CORRECT, PARTIAL, WEAK, or BLANK
- Then assign marks ONLY from the corresponding range
- Always stay within the defined range — do not go below or above it

MARKING METHOD:
- Choose a value in the middle or higher end of the range by default
- Only give lower-end marks if the answer is extremely weak within that category
- If confused between two categories → choose the higher category

ROUNDING RULE:
- Round awarded_marks to nearest integer or .5

FAIRNESS RULE:
- If the student’s answer is mostly correct, prefer FULL marks
- Do not overthink small mistakes
- Avoid unnecessary deductions

STEP 3 — OUTPUT:
Return ONLY a valid JSON object with no extra text, no markdown, no explanation:

{
  "subject": "string",
  "questions": [
    {
      "question_no": "string",
      "max_marks": number,
      "awarded_marks": number,
      "feedback": "1 sentence reason"
    }
  ],
  "total_awarded": number,
  "total_max": number,
  "overall_feedback": "3-4 lines summary",
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"]
}"""


STRICTNESS_RULES = {
    'lenient': """GRADING MODE: EASY / STUDENT-FRIENDLY

Your goal is to reward understanding, not penalize presentation.

- CORRECT or mostly correct → FULL marks (100%)
- Partially correct, right idea but incomplete → 70–90% marks
- Weak answer but shows some relevant knowledge → 50–70% marks  
- Attempted with at least one relevant point → 40–50% marks
- Blank or completely off-topic → 0 marks (only this case)

RULES:
- Never give below 40% if the student made a genuine attempt
- Accept synonyms, informal language, missing steps, approximate values
- If the final answer is right, ignore wrong or missing working
- Do NOT penalize spelling, grammar, or presentation
- When in doubt between two marks, always pick the higher one
- Be like a supportive tutor who wants the student to pass
LITERATURE-SPECIFIC RULES:
- Accept any valid interpretation of a poem, story, or character — 
  there is rarely one correct answer in literature
- If the student expresses the correct idea in their own words, 
  give full or near-full marks
- Do not penalize for not using the exact quote from the answer key —
  if they reference the right moment, that is enough
- For 'in your own words' questions, reward originality, 
  do not compare word-for-word with the answer key
- For theme/moral questions, accept any answer that is 
  logically supported by the text
""",

    'balanced': """GRADING MODE: BALANCED / FAIR

Your goal is fair, consistent grading like a good school teacher.

- CORRECT and complete → FULL marks (100%)
- Correct concept, minor errors or missing steps → 70–85% marks
- Partially correct, shows understanding but gaps → 45–65% marks
- Weak attempt, minimal relevant content → 20–40% marks
- Blank or completely irrelevant → 0 marks

RULES:
- Give full marks when the core concept and final answer are correct
- Deduct for meaningful conceptual errors, not grammar or spelling
- Reward correct steps even if the final answer is wrong
- Accept paraphrased answers if the meaning is correct
- Do not be harsh, but do not overlook clear errors
- Maintain consistency — same quality answer = same marks across questions""",

    'strict': """GRADING MODE: STRICT / BOARD EXAMINER

Your goal is accurate, rigorous evaluation with no grade inflation.

- CORRECT, complete, with proper reasoning/steps → FULL marks (100%)
- Correct answer but missing steps or reasoning → 60–80% marks
- Partially correct with some conceptual understanding → 35–55% marks  
- Weak attempt, vague or mostly incorrect → 10–30% marks
- Blank or completely irrelevant → 0 marks

RULES:
- Deduct marks for missing steps, incomplete reasoning, wrong units, or logical gaps
- Do NOT give full marks if the answer is correct but the method is wrong or absent
- Penalize conceptual errors clearly — partial credit only for the correct portions
- Do not accept vague or hand-wavy explanations
- Do not round up out of generosity — be precise
- A correct final answer with no working shown gets at most 50% in calculation questions
- Be consistent and academically rigorous, like a board exam marking scheme""",
}
def extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        text = m.group(0)
    return json.loads(text)


def storage_upload(path: str, data: bytes, content_type: str = 'application/pdf'):
    try:
        sb.storage.from_(SUPABASE_BUCKET).upload(
            path=path,
            file=data,
            file_options={'content-type': content_type, 'upsert': 'true'},
        )
    except Exception as e:
        logging.exception('Supabase storage upload failed')
        raise HTTPException(status_code=500, detail=f'Storage upload failed: {e}')


def storage_download(path: str) -> bytes:
    return sb.storage.from_(SUPABASE_BUCKET).download(path)


@api_router.post('/evaluate', response_model=EvaluationOut)
async def evaluate(
    roll_no: str = Form(...),
    strictness: str = Form('balanced'),
    question_paper: UploadFile = File(...),
    answer_key: UploadFile = File(...),
    student_sheet: UploadFile = File(...),
    user=Depends(require_teacher),
):
    if not gemini_client:
        raise HTTPException(
            status_code=500,
            detail='GEMINI_API_KEY not configured. Get one at https://aistudio.google.com/apikey and add it to backend/.env',
        )
    if strictness not in STRICTNESS_RULES:
        strictness = 'balanced'

    # Look up student
    student_res = sb.table('users').select('id,name')\
        .eq('roll_no', roll_no).eq('role', 'student').limit(1).execute()
    student_name = student_res.data[0]['name'] if student_res.data else None
    student_user_id = student_res.data[0]['id'] if student_res.data else None

    eval_id = str(uuid.uuid4())

    # Read + store files (both to Supabase Storage and temp disk for Gemini upload)
    tmp_dir = TMP_DIR / eval_id
    tmp_dir.mkdir(exist_ok=True)
    paths = {}
    for key, f, storage_name in [
        ('qp', question_paper, 'question_paper.pdf'),
        ('ak', answer_key, 'answer_key.pdf'),
        ('ss', student_sheet, 'student_sheet.pdf'),
    ]:
        if not (f.filename or '').lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail=f'{key} must be a PDF file')
        content = await f.read()
        tmp_path = tmp_dir / f'{key}.pdf'
        tmp_path.write_bytes(content)
        paths[key] = str(tmp_path)
        storage_upload(f'evaluations/{eval_id}/{storage_name}', content)

    # Call Gemini via native Google SDK
    try:
        system_prompt = EVAL_SYSTEM_PROMPT_BASE.replace(
            '{STRICTNESS_RULE}', STRICTNESS_RULES[strictness]
        )
        # Upload files to Gemini File API
        uploaded_files = [
            gemini_client.files.upload(file=paths['qp'], config={'mime_type': 'application/pdf'}),
            gemini_client.files.upload(file=paths['ak'], config={'mime_type': 'application/pdf'}),
            gemini_client.files.upload(file=paths['ss'], config={'mime_type': 'application/pdf'}),
        ]
        user_text = (
            f"Evaluate student roll number {roll_no} at '{strictness}' strictness. "
            "The first PDF is the question paper, the second is the answer key, "
            "the third is the student answer sheet. Return only JSON as specified."
        )
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[user_text, *uploaded_files],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type='application/json',
                temperature=0.2,
            ),
        )
        raw = response.text or ''
        parsed = extract_json(raw)
    except Exception as e:
        logging.exception('Evaluation failed')
        raise HTTPException(status_code=500, detail=f'AI evaluation failed: {str(e)}')
    finally:
        # cleanup tmp
        for p in paths.values():
            try:
                os.remove(p)
            except Exception:
                pass
        try:
            tmp_dir.rmdir()
        except Exception:
            pass

    questions = parsed.get('questions', [])
    total_awarded = float(parsed.get('total_awarded') or sum(q.get('awarded_marks', 0) for q in questions))
    total_max = float(parsed.get('total_max') or sum(q.get('max_marks', 0) for q in questions))
    percentage = round((total_awarded / total_max) * 100, 2) if total_max > 0 else 0.0

    row = {
        'id': eval_id,
        'student_roll_no': roll_no,
        'student_name': student_name,
        'student_user_id': student_user_id,
        'teacher_id': user['id'],
        'teacher_name': user['name'],
        'subject': parsed.get('subject', 'General'),
        'questions': questions,
        'total_awarded': total_awarded,
        'total_max': total_max,
        'percentage': percentage,
        'overall_feedback': parsed.get('overall_feedback', ''),
        'strengths': parsed.get('strengths', []),
        'weaknesses': parsed.get('weaknesses', []),
    }
    sb.table('evaluations').insert(row).execute()
    # fetch to get created_at
    fetched = sb.table('evaluations').select('*').eq('id', eval_id).limit(1).execute().data[0]
    return EvaluationOut(
        id=fetched['id'],
        student_roll_no=fetched['student_roll_no'],
        student_name=fetched.get('student_name'),
        teacher_id=fetched['teacher_id'],
        teacher_name=fetched.get('teacher_name'),
        subject=fetched.get('subject'),
        questions=fetched['questions'] or [],
        total_awarded=float(fetched['total_awarded']),
        total_max=float(fetched['total_max']),
        percentage=float(fetched['percentage']),
        overall_feedback=fetched.get('overall_feedback') or '',
        strengths=fetched.get('strengths') or [],
        weaknesses=fetched.get('weaknesses') or [],
        created_at=str(fetched['created_at']),
    )


def _row_to_out(r: dict) -> dict:
    return {
        'id': r['id'],
        'student_roll_no': r['student_roll_no'],
        'student_name': r.get('student_name'),
        'teacher_id': r['teacher_id'],
        'teacher_name': r.get('teacher_name'),
        'subject': r.get('subject'),
        'questions': r.get('questions') or [],
        'total_awarded': float(r.get('total_awarded') or 0),
        'total_max': float(r.get('total_max') or 0),
        'percentage': float(r.get('percentage') or 0),
        'overall_feedback': r.get('overall_feedback') or '',
        'strengths': r.get('strengths') or [],
        'weaknesses': r.get('weaknesses') or [],
        'created_at': str(r.get('created_at')),
    }


@api_router.get('/evaluations')
async def list_evaluations(user=Depends(get_current_user)):
    q = sb.table('evaluations').select('*')
    if user['role'] == 'teacher':
        q = q.eq('teacher_id', user['id'])
    else:
        if not user.get('roll_no'):
            return []
        q = q.eq('student_roll_no', user['roll_no'])
    res = q.order('created_at', desc=True).execute()
    return [_row_to_out(r) for r in (res.data or [])]


@api_router.get('/evaluations/{eval_id}', response_model=EvaluationOut)
async def get_evaluation(eval_id: str, user=Depends(get_current_user)):
    res = sb.table('evaluations').select('*').eq('id', eval_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail='Evaluation not found')
    row = res.data[0]
    if user['role'] == 'student' and row.get('student_roll_no') != user.get('roll_no'):
        raise HTTPException(status_code=403, detail='Access denied')
    if user['role'] == 'teacher' and row.get('teacher_id') != user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    return EvaluationOut(**_row_to_out(row))


# ---------- Signed URLs for original PDFs ----------
ALLOWED_SHEET_KINDS = {
    'question_paper': 'question_paper.pdf',
    'answer_key': 'answer_key.pdf',
    'student_sheet': 'student_sheet.pdf',
}


@api_router.get('/evaluations/{eval_id}/sheet-url')
async def get_sheet_url(eval_id: str, kind: str = 'student_sheet',
                         user=Depends(get_current_user)):
    if kind not in ALLOWED_SHEET_KINDS:
        raise HTTPException(status_code=400, detail='Invalid kind')
    res = sb.table('evaluations').select('id,student_roll_no,teacher_id')\
        .eq('id', eval_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail='Not found')
    row = res.data[0]
    if user['role'] == 'student' and row.get('student_roll_no') != user.get('roll_no'):
        raise HTTPException(status_code=403, detail='Access denied')
    if user['role'] == 'teacher' and row.get('teacher_id') != user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    # Students can only view their own sheet, not the answer key
    if user['role'] == 'student' and kind == 'answer_key':
        raise HTTPException(status_code=403, detail='Answer key is teacher-only')

    path = f'evaluations/{eval_id}/{ALLOWED_SHEET_KINDS[kind]}'
    try:
        signed = sb.storage.from_(SUPABASE_BUCKET).create_signed_url(path, 3600)
        # supabase-py returns keys: 'signedURL' or 'signedUrl' depending on version
        url = signed.get('signedURL') or signed.get('signedUrl') or signed.get('signed_url')
        if not url:
            raise Exception(f'unexpected signed url response: {signed}')
        return {'url': url, 'expires_in': 3600}
    except Exception as e:
        logging.exception('signed url failed')
        raise HTTPException(status_code=500, detail=f'Could not create signed URL: {e}')


# ---------- Delete evaluation (teacher) ----------
@api_router.delete('/evaluations/{eval_id}')
async def delete_evaluation(eval_id: str, user=Depends(require_teacher)):
    res = sb.table('evaluations').select('id,teacher_id').eq('id', eval_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail='Not found')
    if res.data[0].get('teacher_id') != user['id']:
        raise HTTPException(status_code=403, detail='Access denied')

    # Delete storage objects
    paths = [
        f'evaluations/{eval_id}/question_paper.pdf',
        f'evaluations/{eval_id}/answer_key.pdf',
        f'evaluations/{eval_id}/student_sheet.pdf',
        f'evaluations/{eval_id}/report.pdf',
    ]
    try:
        sb.storage.from_(SUPABASE_BUCKET).remove(paths)
    except Exception as e:
        logging.warning('Storage cleanup failed for %s: %s', eval_id, e)

    sb.table('evaluations').delete().eq('id', eval_id).execute()
    return {'ok': True, 'id': eval_id}


# ---------- PDF Report ----------

# ── Palette ────────────────────────────────────────────────────────────────────
C_TEAL       = '#0d9488'
C_TEAL_LIGHT = '#ecfdf5'
C_TEAL_BORDER= '#a7f3d0'
C_TEAL_TEXT  = '#065f46'
C_AMBER      = '#f59e0b'
C_AMBER_BG   = '#fffbeb'
C_RED        = '#ef4444'
C_GREEN_TXT  = '#059669'
C_RED_TXT    = '#dc2626'
C_INK        = '#0f172a'   # near-black for headings
C_BODY       = '#111827'   # body text
C_MUTED      = '#64748b'   # labels, secondary
C_FAINT      = '#94a3b8'   # very muted, footer
C_RULE       = '#e2e8f0'   # hairline separators
C_SURFACE    = '#f8fafc'   # table alt-row, meta bg
C_WARN_MID   = '#fbbf24'   # amber bar

GRADE_COLOR = {
    'A+': C_TEAL, 'A': C_TEAL, 'B+': C_TEAL, 'B': C_AMBER,
    'C':  C_AMBER, 'D': C_RED, 'F': C_RED,
}

# ── Helpers ────────────────────────────────────────────────────────────────────
def grade_letter(pct: float) -> str:
    if pct >= 90: return 'A+'
    if pct >= 80: return 'A'
    if pct >= 70: return 'B+'
    if pct >= 60: return 'B'
    if pct >= 50: return 'C'
    if pct >= 35: return 'D'
    return 'F'

def _initials(name: str) -> str:
    parts = (name or '?').split()
    return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else '')).upper()

def _slim_bar(pct: float, width_mm: float = 44, height: float = 4) -> Drawing:
    """Thin progress bar: teal ≥70 %, amber 50–69 %, red <50 %."""
    w = width_mm * mm
    fill = C_TEAL if pct >= 70 else (C_WARN_MID if pct >= 50 else C_RED)
    d = Drawing(w, height)
    d.add(Rect(0, 0, w, height, rx=2, ry=2,
               fillColor=colors.HexColor('#e2e8f0'), strokeColor=None))
    filled = max(4, w * pct / 100)
    d.add(Rect(0, 0, filled, height, rx=2, ry=2,
               fillColor=colors.HexColor(fill), strokeColor=None))
    return d

def _initials_circle(name: str, size: float = 10 * mm) -> Drawing:
    initials = _initials(name)
    d = Drawing(size, size)
    d.add(Rect(0, 0, size, size, rx=size / 2, ry=size / 2,
               fillColor=colors.HexColor(C_TEAL), strokeColor=None))
    d.add(String(size / 2, size / 2 - 3.5, initials,
                 fontName='Helvetica-Bold', fontSize=9,
                 fillColor=colors.white, textAnchor='middle'))
    return d

def _qr_stub(size: float = 18 * mm) -> Drawing:
    """Simple placeholder QR-like square."""
    d = Drawing(size, size)
    d.add(Rect(0, 0, size, size, rx=2, ry=2,
               fillColor=colors.HexColor('#f1f5f9'),
               strokeColor=colors.HexColor(C_RULE), strokeWidth=0.5))
    cell = size / 6
    pattern = [
        (0,5),(1,5),(2,5),(0,4),(2,4),(0,3),(1,3),(2,3),
        (4,5),(5,5),(4,4),(4,3),(5,3),(3,1),(4,1),(3,0),(5,0),
        (0,2),(0,1),(0,0),(1,0),(2,0),(1,2),
    ]
    for cx, cy in pattern:
        d.add(Rect(cx * cell + 1, cy * cell + 1,
                   cell - 1.5, cell - 1.5, rx=0.5, ry=0.5,
                   fillColor=colors.HexColor(C_INK), strokeColor=None))
    return d

# ── Styles ─────────────────────────────────────────────────────────────────────
def _styles():
    base = getSampleStyleSheet()
    def s(name, **kw):
        return ParagraphStyle(name, parent=base['Normal'], **kw)

    overline = s('overline',
        fontName='Courier', fontSize=8, leading=10,
        textColor=colors.HexColor(C_TEAL),
        spaceAfter=3, spaceBefore=0,
    )
    h1 = s('h1',
        fontName='Helvetica-Bold', fontSize=22, leading=26,
        textColor=colors.HexColor(C_INK), spaceAfter=2,
    )
    subtitle = s('subtitle',
        fontName='Courier', fontSize=9, leading=11,
        textColor=colors.HexColor(C_MUTED), spaceAfter=0,
    )
    body = s('body',
        fontName='Helvetica', fontSize=10, leading=14,
        textColor=colors.HexColor(C_BODY),
    )
    small = s('small',
        fontName='Courier', fontSize=8, leading=10,
        textColor=colors.HexColor(C_FAINT),
    )
    mono = s('mono',
        fontName='Courier', fontSize=9, leading=12,
        textColor=colors.HexColor(C_BODY),
    )
    muted = s('muted',
        fontName='Helvetica', fontSize=9, leading=12,
        textColor=colors.HexColor(C_MUTED),
    )
    label = s('label',
        fontName='Courier', fontSize=7.5, leading=10,
        textColor=colors.HexColor(C_MUTED), spaceAfter=2,
    )
    return dict(overline=overline, h1=h1, subtitle=subtitle, body=body,
                small=small, mono=mono, muted=muted, label=label)

# ── Main builder ───────────────────────────────────────────────────────────────
def build_pdf_report(doc: dict) -> bytes:
    buf = io.BytesIO()
    ST = _styles()
    body = ST['body']

    pct      = float(doc.get('percentage') or 0)
    awarded  = float(doc.get('total_awarded') or 0)
    max_m    = float(doc.get('total_max') or 0)
    grade    = grade_letter(pct)
    g_color  = GRADE_COLOR[grade]

    pdf = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
    )
    flow = []

    # ── Top accent bar (drawn via a 1-row table with colored background) ────────
    accent = Table([['']], colWidths=[170 * mm], rowHeights=[3])
    accent.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(C_INK)),
        ('LINEBELOW',  (0, 0), (-1, -1), 0, colors.white),
    ]))
    flow.append(accent)
    flow.append(Spacer(1, 10))

    # ── Header: initials circle · brand · report id ──────────────────────────
    header = Table(
        [[
            _initials_circle(doc.get('student_name') or doc.get('student_roll_no') or '?'),
            Table(
                [[Paragraph('<b>AES</b>', body)],
                 [Paragraph(
                     "<font name='Courier' size='7' color='#64748b'>ACADEMIC EVALUATION SYSTEM</font>",
                     body)]],
                colWidths=[65 * mm],
            ),
            '',
            Table(
                [[Paragraph(
                    "<font name='Courier' size='7' color='#94a3b8'>REPORT ID</font>", body)],
                 [Paragraph(
                    f"<font name='Courier' size='9' color='#475569'>"
                    f"{str(doc.get('id',''))[:8].upper()}</font>", body)]],
                colWidths=[35 * mm],
            ),
        ]],
        colWidths=[13 * mm, 65 * mm, 57 * mm, 35 * mm],
    )
    header.setStyle(TableStyle([
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN',        (3, 0), (3, 0),   'RIGHT'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('LINEBELOW',    (0, 0), (-1, -1), 0.5, colors.HexColor(C_RULE)),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 10),
    ]))
    flow.append(header)
    flow.append(Spacer(1, 14))

    # ── Hero: subject title + score ──────────────────────────────────────────
    # Left: overline + big title + date
    left = Table(
        [[Paragraph("EVALUATION REPORT", ST['overline'])],
         [Paragraph(doc.get('subject') or 'General', ST['h1'])],
         [Paragraph(str(doc.get('created_at', ''))[:10], ST['subtitle'])]],
        colWidths=[110 * mm],
    )
    left.setStyle(TableStyle([
        ('LEFTPADDING',  (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',   (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 2),
    ]))

    # Right: score block — each element in its own row so they never overlap
    score_num_style = ParagraphStyle('score_num', parent=body,
        fontName='Helvetica-Bold', fontSize=36, leading=42,
        textColor=colors.HexColor(g_color), alignment=2)
    score_denom_style = ParagraphStyle('score_denom', parent=body,
        fontName='Helvetica', fontSize=13, leading=16,
        textColor=colors.HexColor('#94a3b8'), alignment=2)
    score_pct_style = ParagraphStyle('score_pct', parent=body,
        fontName='Courier', fontSize=9, leading=12,
        textColor=colors.HexColor(C_MUTED), alignment=2)
    grade_style = ParagraphStyle('grade_pill', parent=body,
        fontName='Courier', fontSize=9, leading=12,
        textColor=colors.HexColor(C_TEAL_TEXT), alignment=2)

    right = Table(
        [[Paragraph(f"{awarded:g}", score_num_style)],
         [Paragraph(f"out of {max_m:g}", score_denom_style)],
         [Paragraph(f"{pct}%", score_pct_style)],
         [Paragraph(f"Grade  {grade}", grade_style)],
        ],
        colWidths=[56 * mm],
    )
    right.setStyle(TableStyle([
        ('ALIGN',        (0, 0), (-1, -1), 'RIGHT'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',   (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 2),
        ('LINEBEFORE',   (0, 0), (-1, -1), 0.5, colors.HexColor(C_RULE)),
    ]))

    hero = Table([[left, right]], colWidths=[110 * mm, 56 * mm])
    hero.setStyle(TableStyle([
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',   (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 0),
        ('LINEBELOW',    (0, 0), (-1, -1), 0.5, colors.HexColor(C_RULE)),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 14),
    ]))
    flow.append(hero)
    flow.append(Spacer(1, 10))

    # ── Meta row ─────────────────────────────────────────────────────────────
    def meta_cell(label_txt: str, val_txt: str, mono: bool = False) -> Table:
        fn = 'Courier' if mono else 'Helvetica-Bold'
        return Table(
            [[Paragraph(
                f"<font name='Courier' size='7' color='#94a3b8'>{label_txt}</font>",
                body)],
             [Paragraph(
                f"<font name='{fn}' size='10'>{val_txt}</font>",
                body)]],
            colWidths=[38 * mm],
        )

    meta = Table(
        [[
            meta_cell('ROLL NO',  doc.get('student_roll_no') or '—', mono=True),
            meta_cell('STUDENT',  doc.get('student_name') or '—'),
            meta_cell('TEACHER',  doc.get('teacher_name') or '—'),
            meta_cell('DATE',     str(doc.get('created_at', ''))[:10]),
        ]],
        colWidths=[38 * mm, 47 * mm, 47 * mm, 38 * mm],
    )
    meta.setStyle(TableStyle([
        ('BACKGROUND',   (0, 0), (-1, -1), colors.HexColor(C_SURFACE)),
        ('LEFTPADDING',  (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING',   (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 8),
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW',    (0, 0), (-1, -1), 0.5, colors.HexColor(C_RULE)),
    ]))
    flow.append(meta)
    flow.append(Spacer(1, 16))

    # ── Question-wise table ───────────────────────────────────────────────────
    flow.append(Paragraph('QUESTION-WISE MARKS', ST['overline']))
    flow.append(Spacer(1, 6))

    th_style = ParagraphStyle('th', parent=body,
        fontName='Courier', fontSize=7.5, leading=10,
        textColor=colors.HexColor(C_MUTED))

    rows = [[
        Paragraph('Q',        th_style),
        Paragraph('MARKS',    th_style),
        Paragraph('PROGRESS', th_style),
        Paragraph('FEEDBACK', th_style),
    ]]
    for q in (doc.get('questions') or []):
        q_max  = float(q.get('max_marks') or 0)
        q_got  = float(q.get('awarded_marks') or 0)
        q_pct  = (q_got / q_max * 100) if q_max > 0 else 0
        q_gr   = grade_letter(q_pct)
        q_col  = GRADE_COLOR[q_gr]
        rows.append([
            Paragraph(
                f"<font name='Courier' size='9' color='#64748b'>"
                f"{q.get('question_no','')}</font>", body),
            Paragraph(
                f"<font name='Helvetica-Bold' size='10' color='{q_col}'>{q_got:g}</font>"
                f"<font size='9' color='#94a3b8'>/{q_max:g}</font>", body),
            _slim_bar(q_pct, width_mm=44),
            Paragraph(
                f"<font size='9' color='#475569'>{q.get('feedback','')}</font>",
                body),
        ])

    qt = Table(rows, colWidths=[14 * mm, 22 * mm, 48 * mm, 86 * mm], repeatRows=1)
    qt.setStyle(TableStyle([
        ('LINEBELOW',    (0, 0), (-1, 0),  0.8, colors.HexColor(C_RULE)),
        ('LINEBELOW',    (0, 1), (-1, -1), 0.4, colors.HexColor(C_RULE)),
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING',   (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 8),
        ('BACKGROUND',   (0, 0), (-1, 0),  colors.HexColor(C_SURFACE)),
    ]))
    flow.append(qt)
    flow.append(Spacer(1, 18))

    # ── Overall feedback ──────────────────────────────────────────────────────
    flow.append(Paragraph('OVERALL FEEDBACK', ST['overline']))
    flow.append(Spacer(1, 6))
    fb = Table(
        [[Paragraph(doc.get('overall_feedback') or '—', body)]],
        colWidths=[170 * mm],
    )
    fb.setStyle(TableStyle([
        ('BACKGROUND',   (0, 0), (-1, -1), colors.HexColor(C_AMBER_BG)),
        ('LINEBEFORE',   (0, 0), (0, -1),  2.5, colors.HexColor(C_AMBER)),
        ('LEFTPADDING',  (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING',   (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 12),
    ]))
    flow.append(fb)
    flow.append(Spacer(1, 18))

    # ── Strengths / Weaknesses ────────────────────────────────────────────────
    def _sw_col(title: str, items: list, col_hex: str, dot: str) -> Table:
        rows_inner = [[
            Paragraph(
                f"<font name='Courier' size='8' color='{col_hex}'>{title}</font>",
                body)
        ]]
        if items:
            for item in items:
                rows_inner.append([
                    Paragraph(
                        f"<font color='{col_hex}'>{dot}</font>"
                        f"  <font size='9' color='#374151'>{item}</font>",
                        body)
                ])
        else:
            rows_inner.append([Paragraph("<font color='#94a3b8'>—</font>", body)])
        t = Table(rows_inner, colWidths=[78 * mm])
        t.setStyle(TableStyle([
            ('LEFTPADDING',  (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING',   (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING',(0, 0), (-1, -1), 3),
            ('TOPPADDING',   (0, 0), (-1, 0),  10),
            ('BOTTOMPADDING',(0, 0), (-1, 0),  8),
        ]))
        return t

    str_col = _sw_col('STRENGTHS',       doc.get('strengths') or [], C_GREEN_TXT, '✓')
    wk_col  = _sw_col('AREAS TO IMPROVE', doc.get('weaknesses') or [], C_RED_TXT,  '•')

    sw = Table([[str_col, wk_col]], colWidths=[85 * mm, 85 * mm])
    sw.setStyle(TableStyle([
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('BOX',          (0, 0), (0, 0),   0.5, colors.HexColor('#a7f3d0')),
        ('BOX',          (1, 0), (1, 0),   0.5, colors.HexColor('#fecaca')),
        ('BACKGROUND',   (0, 0), (0, 0),   colors.HexColor('#f0fdf4')),
        ('BACKGROUND',   (1, 0), (1, 0),   colors.HexColor('#fef2f2')),
        ('LEFTPADDING',  (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',   (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 0),
    ]))
    flow.append(sw)
    flow.append(Spacer(1, 22))

    # ── Footer ────────────────────────────────────────────────────────────────
    flow.append(HRFlowable(width='100%', thickness=0.5,
                           color=colors.HexColor(C_RULE), spaceAfter=10))

    sig_table = Table(
        [[
            Table(
                [[Paragraph(
                    "<font name='Courier' size='7' color='#94a3b8'>TEACHER SIGNATURE</font>",
                    body)],
                 [Paragraph(
                    f"<font size='10'>{doc.get('teacher_name') or '—'}</font>",
                    body)]],
                colWidths=[85 * mm],
            ),
            Paragraph(
                "<font name='Courier' size='7' color='#94a3b8'>"
                "Generated by AES · Academic Evaluation System · Powered by AI"
                "</font>",
                ParagraphStyle('footer_center', parent=body, alignment=2)),
        ]],
        colWidths=[85 * mm, 85 * mm],
    )
    sig_table.setStyle(TableStyle([
        ('VALIGN',       (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',   (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 0),
        ('LINEABOVE',    (0, 0), (0, 0),   0.5, colors.HexColor(C_INK)),
        ('TOPPADDING',   (0, 0), (0, 0),   6),
    ]))
    flow.append(sig_table)

    pdf.build(flow)
    return buf.getvalue()
@api_router.get('/evaluations/{eval_id}/pdf')
async def download_report(eval_id: str, user=Depends(get_current_user)):
    res = sb.table('evaluations').select('*').eq('id', eval_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail='Not found')
    row = res.data[0]
    if user['role'] == 'student' and row.get('student_roll_no') != user.get('roll_no'):
        raise HTTPException(status_code=403, detail='Access denied')
    if user['role'] == 'teacher' and row.get('teacher_id') != user['id']:
        raise HTTPException(status_code=403, detail='Access denied')
    pdf_bytes = build_pdf_report(row)
    # Also cache to storage
    try:
        storage_upload(f'evaluations/{eval_id}/report.pdf', pdf_bytes)
    except Exception:
        pass
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="evaluation-{row.get("student_roll_no","report")}.pdf"'}
    )


@api_router.get('/')
async def root():
    return {'message': 'AES — Automatic Evaluation System API', 'db': 'supabase'}


# ---------- CSV Export (teacher) ----------
@api_router.get('/export/evaluations.csv')
async def export_csv(user=Depends(require_teacher)):
    res = sb.table('evaluations').select('*')\
        .eq('teacher_id', user['id']).order('created_at', desc=True).execute()
    rows = res.data or []
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        'Roll No', 'Student Name', 'Subject', 'Awarded', 'Max', 'Percentage', 'Grade',
        'Overall Feedback', 'Date',
    ])
    for r in rows:
        pct = float(r.get('percentage') or 0)
        w.writerow([
            r.get('student_roll_no', ''),
            r.get('student_name') or '',
            r.get('subject') or '',
            r.get('total_awarded') or 0,
            r.get('total_max') or 0,
            pct,
            grade_letter(pct),
            (r.get('overall_feedback') or '').replace('\n', ' '),
            str(r.get('created_at', ''))[:10],
        ])
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode('utf-8')),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="aes-evaluations.csv"'},
    )


# ---------- Graded-student emails (for "Email All" mailto link) ----------
@api_router.get('/export/recipients')
async def evaluation_recipients(user=Depends(require_teacher)):
    """Return the distinct email addresses of students that this teacher has graded."""
    evals = sb.table('evaluations').select('student_roll_no')\
        .eq('teacher_id', user['id']).execute().data or []
    rolls = list({e['student_roll_no'] for e in evals if e.get('student_roll_no')})
    if not rolls:
        return {'emails': [], 'count': 0}
    students = sb.table('users').select('email,name,roll_no')\
        .in_('roll_no', rolls).eq('role', 'student').execute().data or []
    return {
        'emails': [s['email'] for s in students if s.get('email')],
        'students': students,
        'count': len(students),
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
