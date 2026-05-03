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
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
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
EVAL_SYSTEM_PROMPT_BASE = """You are a rigorous, fair academic examination evaluator. You are given THREE PDF documents in order:
1. QUESTION PAPER — the exam questions.
2. ANSWER KEY — model answers with mark allocations.
3. STUDENT ANSWER SHEET — the student's handwritten or typed answers.

STEP 1 (INTERNAL): Segment the student sheet into individual answers by identifying markers like "Q1", "Question 1", "Ans 1", "Sol 1", "1)", etc. Be tolerant of OCR errors in markers.

STEP 2 (INTERNAL): For each question, compare the student's answer against the model answer. Evaluate on four axes (each 0-100):
- semantic_similarity: how close the meaning / concept is to the model answer
- keyword_match: coverage of key technical terms / formulas / units
- grammar_score: clarity and grammatical correctness
- final_correctness: overall correctness weighted by the above (the main grade signal)

STEP 3 (OUTPUT): Award marks out of max_marks by applying the strictness rule below, then produce ONE JSON object — no markdown, no code fences, no prose — with this exact schema:
{
  "subject": "string (e.g., 'Mathematics Grade 10')",
  "questions": [
    {
      "question_no": "string",
      "max_marks": number,
      "awarded_marks": number,
      "semantic_similarity": number,
      "keyword_match": number,
      "grammar_score": number,
      "final_correctness": number,
      "feedback": "string (1-2 sentences, specific to this answer)"
    }
  ],
  "total_awarded": number,
  "total_max": number,
  "overall_feedback": "string (3-5 sentences of holistic feedback)",
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"]
}

STRICTNESS: {STRICTNESS_RULE}"""

STRICTNESS_RULES = {
    'lenient': (
        "Be generous. Award full marks if the core idea is correct, even if wording, "
        "steps, or units are incomplete. Ignore minor spelling/grammar issues. "
        "Give partial credit liberally for any relevant work shown."
    ),
    'balanced': (
        "Be fair but rigorous. Award partial credit proportional to completeness. "
        "Deduct for wrong concepts but not for presentation issues. "
        "Full marks require a correct, reasonably complete answer."
    ),
    'strict': (
        "Be strict, like a board examiner. Deduct for missing steps, wrong units, "
        "incomplete proofs, unclear reasoning, or spelling errors in technical terms. "
        "Award full marks only when the answer fully matches the key in substance AND "
        "in the key steps or justification."
    ),
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
GRADE_COLORS = {
    'A+': '#059669', 'A': '#10b981', 'B': '#f59e0b',
    'C': '#f97316', 'D': '#fb923c', 'F': '#ef4444',
}


def grade_letter(pct: float) -> str:
    if pct >= 90: return 'A+'
    if pct >= 80: return 'A'
    if pct >= 70: return 'B'
    if pct >= 60: return 'C'
    if pct >= 50: return 'D'
    return 'F'


def initials(name: str) -> str:
    if not name:
        return '?'
    parts = [p for p in name.split() if p]
    if not parts:
        return '?'
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _score_badge(pct: float, size: int = 70) -> Drawing:
    """Circular badge with grade letter."""
    d = Drawing(size, size)
    g = grade_letter(pct)
    bg = colors.HexColor(GRADE_COLORS[g])
    d.add(Circle(size / 2, size / 2, size / 2, fillColor=bg, strokeColor=bg))
    d.add(String(size / 2, size / 2 - 8, g,
                 fontName='Helvetica-Bold', fontSize=26,
                 fillColor=colors.white, textAnchor='middle'))
    return d


def _progress_bar(pct: float, width: float = 140, height: float = 6) -> Drawing:
    """Horizontal progress bar."""
    d = Drawing(width, height)
    # background
    d.add(Rect(0, 0, width, height, fillColor=colors.HexColor('#e5e7eb'),
               strokeColor=None, rx=height / 2, ry=height / 2))
    # fill
    fill_w = max(0, min(width, width * pct / 100))
    g = grade_letter(pct)
    d.add(Rect(0, 0, fill_w, height, fillColor=colors.HexColor(GRADE_COLORS[g]),
               strokeColor=None, rx=height / 2, ry=height / 2))
    return d


def _initials_circle(name: str, size: int = 46) -> Drawing:
    d = Drawing(size, size)
    d.add(Circle(size / 2, size / 2, size / 2,
                 fillColor=colors.HexColor('#0d9488'),
                 strokeColor=colors.HexColor('#0d9488')))
    d.add(String(size / 2, size / 2 - 6, initials(name),
                 fontName='Helvetica-Bold', fontSize=18,
                 fillColor=colors.white, textAnchor='middle'))
    return d


def _qr_image(data: str, size: float = 22 * mm):
    qr = qrcode.QRCode(version=1, box_size=4, border=1)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color='#111111', back_color='white')
    bio = io.BytesIO()
    img.save(bio, format='PNG')
    bio.seek(0)
    return RLImage(bio, width=size, height=size)


def build_pdf_report(doc: dict) -> bytes:
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    pct = float(doc.get('percentage') or 0)
    awarded = float(doc.get('total_awarded') or 0)
    max_m = float(doc.get('total_max') or 0)
    grade = grade_letter(pct)

    h1 = ParagraphStyle('h1', parent=styles['Title'], fontName='Helvetica-Bold',
                        fontSize=22, leading=26, textColor=colors.HexColor('#0f172a'), spaceAfter=2)
    subtitle = ParagraphStyle('subtitle', parent=styles['Normal'], fontName='Helvetica',
                              fontSize=10, leading=12, textColor=colors.HexColor('#64748b'), spaceAfter=4)
    overline = ParagraphStyle('overline', parent=styles['Normal'], fontName='Helvetica-Bold',
                              fontSize=8, textColor=colors.HexColor('#0d9488'),
                              leading=10, spaceAfter=2)
    body = ParagraphStyle('body', parent=styles['Normal'], fontName='Helvetica',
                          fontSize=10, leading=14, textColor=colors.HexColor('#111111'))
    small = ParagraphStyle('small', parent=styles['Normal'], fontName='Helvetica',
                           fontSize=8, leading=10, textColor=colors.HexColor('#64748b'))
    score_big = ParagraphStyle('score_big', parent=styles['Normal'], fontName='Helvetica-Bold',
                               fontSize=36, leading=42, textColor=colors.HexColor(GRADE_COLORS[grade]))
    pdf = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=14 * mm)
    flow = []

    # ---------- HEADER STRIP ----------
    header = Table(
        [[
            _initials_circle(doc.get('student_name') or doc.get('student_roll_no') or '?'),
            Paragraph(f"<b>AES</b><br/><font size='7' color='#64748b'>ACADEMIC EVALUATION SYSTEM</font>", body),
            '',
            Paragraph("<para alignment='right'><font size='7' color='#64748b'>REPORT ID</font><br/>"
                      f"<font name='Courier' size='8'>{str(doc.get('id',''))[:8]}</font></para>", body),
        ]],
        colWidths=[16 * mm, 70 * mm, 55 * mm, 30 * mm],
    )
    header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, -1), 1.2, colors.HexColor('#0d9488')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    flow.append(header)
    flow.append(Spacer(1, 12))

    # ---------- TITLE ----------
    flow.append(Paragraph('EVALUATION REPORT', overline))
    flow.append(Paragraph(doc.get('subject') or 'General', h1))
    flow.append(Paragraph(str(doc.get('created_at', ''))[:10], subtitle))
    flow.append(Spacer(1, 10))

    # ---------- SCORE BANNER ----------
    score_left = [
        [Paragraph("<font size='7' color='#64748b'>TOTAL SCORE</font>", body)],
        [Paragraph(f"<font name='Helvetica-Bold' size='36' color='{GRADE_COLORS[grade]}'>"
                   f"{awarded:g}</font><font size='16' color='#475569'>/{max_m:g}</font>", body)],
        [Paragraph(f"<font name='Helvetica' size='10' color='#64748b'>{pct}%</font>", body)],
    ]
    score_table = Table(score_left, colWidths=[80 * mm])
    score_table.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    banner = Table(
        [[score_table, _score_badge(pct, size=70)]],
        colWidths=[120 * mm, 54 * mm],
    )
    banner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0fdfa')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#99f6e4')),
        ('ROUNDEDCORNERS', [8, 8, 8, 8]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 16),
        ('TOPPADDING', (0, 0), (-1, -1), 16),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 16),
    ]))
    flow.append(banner)
    flow.append(Spacer(1, 14))

    # ---------- META ----------
    meta = [
        [Paragraph("<font size='7' color='#64748b'>ROLL NO</font>", body),
         Paragraph("<font size='7' color='#64748b'>STUDENT</font>", body),
         Paragraph("<font size='7' color='#64748b'>TEACHER</font>", body),
         Paragraph("<font size='7' color='#64748b'>DATE</font>", body)],
        [Paragraph(f"<font name='Courier' size='10'><b>{doc.get('student_roll_no','-')}</b></font>", body),
         Paragraph(f"<font size='10'><b>{doc.get('student_name') or '-'}</b></font>", body),
         Paragraph(f"<font size='10'>{doc.get('teacher_name') or '-'}</font>", body),
         Paragraph(f"<font size='10'>{str(doc.get('created_at',''))[:10]}</font>", body)],
    ]
    m = Table(meta, colWidths=[38 * mm, 55 * mm, 46 * mm, 35 * mm])
    m.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, 0), 0.4, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    flow.append(m)
    flow.append(Spacer(1, 16))

    # ---------- QUESTION-WISE ----------
    flow.append(Paragraph('QUESTION-WISE MARKS', overline))
    flow.append(Spacer(1, 4))
    rows = [['Q', 'MARKS', 'PROGRESS', 'FEEDBACK']]
    for q in (doc.get('questions') or []):
        q_max = float(q.get('max_marks') or 0)
        q_got = float(q.get('awarded_marks') or 0)
        q_pct = (q_got / q_max * 100) if q_max > 0 else 0
        rows.append([
            Paragraph(f"<b>{q.get('question_no','')}</b>", body),
            Paragraph(f"<font color='{GRADE_COLORS[grade_letter(q_pct)]}'><b>{q_got:g}</b></font>"
                      f"<font color='#94a3b8'>/{q_max:g}</font>", body),
            _progress_bar(q_pct, width=40 * mm, height=6),
            Paragraph(q.get('feedback', ''), body),
        ])
    qt = Table(rows, colWidths=[12 * mm, 20 * mm, 45 * mm, 97 * mm], repeatRows=1)
    qt.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#64748b')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f8fafc')),
        ('LINEBELOW', (0, 0), (-1, 0), 0.8, colors.HexColor('#cbd5e1')),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, colors.HexColor('#e2e8f0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    flow.append(qt)
    flow.append(Spacer(1, 16))

    # ---------- OVERALL FEEDBACK ----------
    flow.append(Paragraph('OVERALL FEEDBACK', overline))
    flow.append(Spacer(1, 4))
    feedback_table = Table(
        [[Paragraph(doc.get('overall_feedback') or '-', body)]],
        colWidths=[174 * mm],
    )
    feedback_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fefce8')),
        ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor('#f59e0b')),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    flow.append(feedback_table)
    flow.append(Spacer(1, 14))

    # ---------- STRENGTHS / WEAKNESSES ----------
    left_cells = [[Paragraph("<b><font color='#059669'>STRENGTHS</font></b>", body)]]
    for s in (doc.get('strengths') or []):
        left_cells.append([Paragraph(f"<font color='#059669'>✓</font>  {s}", body)])
    if not (doc.get('strengths') or []):
        left_cells.append([Paragraph("<font color='#94a3b8'>—</font>", body)])

    right_cells = [[Paragraph("<b><font color='#dc2626'>AREAS TO IMPROVE</font></b>", body)]]
    for w in (doc.get('weaknesses') or []):
        right_cells.append([Paragraph(f"<font color='#dc2626'>•</font>  {w}", body)])
    if not (doc.get('weaknesses') or []):
        right_cells.append([Paragraph("<font color='#94a3b8'>—</font>", body)])

    # pad to equal rows
    while len(left_cells) < len(right_cells):
        left_cells.append([''])
    while len(right_cells) < len(left_cells):
        right_cells.append([''])

    sw = Table(
        [[Table(left_cells, colWidths=[82 * mm]), Table(right_cells, colWidths=[82 * mm])]],
        colWidths=[87 * mm, 87 * mm],
    )
    sw.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (0, 0), 0.6, colors.HexColor('#d1fae5')),
        ('BOX', (1, 0), (1, 0), 0.6, colors.HexColor('#fee2e2')),
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#ecfdf5')),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#fef2f2')),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    flow.append(sw)
    flow.append(Spacer(1, 20))

    # ---------- FOOTER (signature + QR) ----------
    qr_data = f"AES://evaluation/{doc.get('id','')}"
    try:
        qr_img = _qr_image(qr_data, size=22 * mm)
    except Exception:
        qr_img = ''
    sig_line = Table(
        [[Paragraph("<font size='7' color='#94a3b8'>TEACHER SIGNATURE</font><br/>"
                    f"<font size='9'>{doc.get('teacher_name') or '—'}</font>", body),
          '',
          qr_img]],
        colWidths=[90 * mm, 50 * mm, 34 * mm],
    )
    sig_line.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
        ('LINEABOVE', (0, 0), (0, 0), 0.4, colors.HexColor('#0f172a')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    flow.append(sig_line)

    flow.append(Spacer(1, 6))
    flow.append(Paragraph(
        "<font size='7' color='#94a3b8'>Generated by AES • "
        "Academic Evaluation System • Powered by AI</font>",
        small))

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
