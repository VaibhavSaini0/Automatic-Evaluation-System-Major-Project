-- AES / Marksmith — Supabase schema bootstrap
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USERS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    roll_no TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_roll_no ON public.users (roll_no);

-- EVALUATIONS
CREATE TABLE IF NOT EXISTS public.evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_roll_no TEXT NOT NULL,
    student_name TEXT,
    student_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    teacher_name TEXT,
    subject TEXT,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_awarded NUMERIC(8, 2) NOT NULL DEFAULT 0,
    total_max NUMERIC(8, 2) NOT NULL DEFAULT 0,
    percentage NUMERIC(6, 2) NOT NULL DEFAULT 0,
    overall_feedback TEXT,
    strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
    weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evaluations_teacher_id ON public.evaluations (teacher_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_student_roll_no ON public.evaluations (student_roll_no);
CREATE INDEX IF NOT EXISTS idx_evaluations_created_at ON public.evaluations (created_at DESC);

-- RLS enabled (backend uses SERVICE_ROLE key which bypasses RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Storage bucket (create via Dashboard → Storage → New bucket → name: evaluation-pdfs, private)
-- OR run:
INSERT INTO storage.buckets (id, name, public)
VALUES ('evaluation-pdfs', 'evaluation-pdfs', false)
ON CONFLICT (id) DO NOTHING;
