# AES (MarkSmith) — Automatic AI Evaluation System

An AI-powered academic evaluation platform that automatically checks student answer sheets against an answer key, generates per-question marks, detailed feedback, analytics, and downloadable PDF reports.

Built as a complete full-stack SaaS application using FastAPI, React, Supabase, and Google Gemini.

---

## Live Project Vision

AES (Automatic Evaluation System) is designed to reduce the manual workload of teachers by automating the grading workflow:

* Upload Question Paper PDF
* Upload Official Answer Key PDF
* Upload Student Answer Sheet PDF
* AI compares all three documents intelligently
* Generates question-wise marks
* Provides personalized AI feedback
* Stores results securely in cloud database
* Creates downloadable professional report cards

This allows institutions, coaching centers, and educators to evaluate descriptive answer sheets within seconds instead of hours.

---

## Core Features

### Authentication & Role Management

* JWT based secure authentication
* Separate Teacher and Student roles
* Role protected dashboards
* Secure login/register flow

### AI Based Evaluation Engine

* Uses Google Gemini for intelligent answer comparison
* Understands semantic similarity instead of keyword matching only
* Generates:

  * marks obtained per question
  * total score
    n  - AI remarks
  * improvement suggestions

### PDF Processing Workflow

Teachers upload:

* Question Paper PDF
* Answer Key PDF
* Student Answer Sheet PDF

System processes all files and performs automated evaluation.

### Cloud Storage & Database

* Supabase Postgres for storing users and evaluations
* Supabase Storage bucket for generated PDF reports and uploaded documents

### Downloadable Evaluation Reports

* Professional PDF report card generation using ReportLab
* Includes marks table, summary, remarks, and metadata

### Analytics Dashboard

* Teacher can view recent evaluations
* Student can view own performance history
* Score trends and statistics using charts

---

## Tech Stack

### Frontend

* React.js
* Tailwind CSS
* Shadcn UI
* Lucide React Icons
* Recharts
* Axios
* React Router DOM

### Backend

* FastAPI
* Uvicorn
* Pydantic
* PyJWT
* bcrypt
* ReportLab
* qrcode

### AI Layer

* Google Gemini API (`google-genai`)

### Database & Storage

* Supabase Postgres
* Supabase Storage

---

## Project Folder Structure

```bash
Automatic-Evaluation-System-main/
│
├── backend/
│   ├── migrations/
│   ├── reports/
│   ├── uploads/
│   ├── requirements.txt
│   ├── server.py
│   └── .env
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   ├── craco.config.js
│   └── .env
│
└── README.md
```

---

## Local Setup Instructions

### Prerequisites

Before running locally make sure you have:

* Python 3.11+
* Node.js 18+
* npm or yarn
* Supabase Account
* Google Gemini API Key

---

# Backend Setup

### 1. Move to backend folder

```bash
cd backend
```

### 2. Create virtual environment

```bash
py -3.11 -m venv venv
```

### 3. Activate virtual environment

#### Windows

```bash
venv\Scripts\activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Create backend `.env`

```env
CORS_ORIGINS=*
JWT_SECRET=your_super_secret_jwt_key

GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_BUCKET=evaluation-pdfs
```

### 6. Run backend server

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend will run on:

```bash
http://localhost:8001
```

---

# Frontend Setup

### 1. Move to frontend folder

```bash
cd frontend
```

### 2. Install dependencies

```bash
npm install --legacy-peer-deps
```

### 3. Create frontend `.env`

```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 4. Run frontend

```bash
npm start
```

Frontend will run on:

```bash
http://localhost:3000
```

---

## Supabase Configuration

### Step 1 — Create a Supabase Project

Create a free project at Supabase.

### Step 2 — Run SQL Migration

Open SQL Editor and run the SQL present in:

```bash
backend/migrations/001_init.sql
```

### Step 3 — Create Storage Bucket

Create bucket named:

```bash
evaluation-pdfs
```

Set bucket visibility to Private.

### Step 4 — Copy API Credentials

From Project Settings → API copy:

* Project URL
* Service Role Key

Use these in backend `.env`.

---

## Google Gemini Setup

Generate free Gemini API key from Google AI Studio.

Paste in backend `.env`:

```env
GEMINI_API_KEY=AIza....
```

Recommended model:

```env
GEMINI_MODEL=gemini-2.5-flash
```

---

## API Workflow

### Authentication Routes

* `POST /api/auth/register`
* `POST /api/auth/login`
* `GET /api/auth/me`

### Evaluation Routes

* `POST /api/evaluate`
* `GET /api/evaluations`
* `GET /api/evaluations/{id}`
* `GET /api/evaluations/{id}/pdf`

---

## Deployment Guide

### Backend Deployment (Render Recommended)

Root Directory:

```bash
backend
```

Build Command:

```bash
pip install -r requirements.txt
```

Start Command:

```bash
uvicorn server:app --host 0.0.0.0 --port $PORT
```

Add all backend environment variables in Render dashboard.

---

### Frontend Deployment (Vercel Recommended)

Build Command:

```bash
npm run build
```

Install Command:

```bash
npm install --legacy-peer-deps
```

Output Directory:

```bash
build
```

Environment Variable:

```env
REACT_APP_BACKEND_URL=https://your-render-backend-url.onrender.com
```

---

## Future Improvements

* Bulk answer sheet evaluation
* Manual marks override by teacher
* CSV export of all results
* Email result notifications
* Multi institute support
* Better OCR handling for low quality scans

---

## Why This Project Matters

Manual descriptive paper checking consumes enormous teacher effort.

AES solves this by introducing:

* speed
* consistency
* centralized report generation
* performance tracking
* scalable AI based assessment

This makes it a practical EdTech SaaS solution rather than just a demo project.

---

## License

This project is built for educational and portfolio purposes. Can be extended into a production-grade institutional SaaS.

---

## Author

Developed and customized independently after full vendor-neutral cleanup and deployment optimization.
