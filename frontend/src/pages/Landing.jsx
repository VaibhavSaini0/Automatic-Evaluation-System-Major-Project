import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import {
    Brain,
    FileCheck2,
    Zap,
    TrendingUp,
    ShieldCheck,
    CircleCheck,
    Upload,
    BookOpen,
    BarChart3,
    Gauge,
} from "lucide-react";

const Feature = ({ icon: Icon, title, body }) => (
    <div className="group rounded-2xl border border-border bg-card/60 p-6 transition-all hover:border-primary/50 hover:bg-card">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Icon className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
);

export default function Landing() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const teacherGo = () => navigate(user?.role === "teacher" ? "/teacher" : "/login?role=teacher");
    const studentGo = () => navigate(user?.role === "student" ? "/student" : "/login?role=student");

    return (
        <div className="min-h-screen bg-background">
            {/* NAV */}
            <header className="relative z-20 border-b border-border/40">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
                    <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
                        <Brain className="h-7 w-7 text-primary" strokeWidth={1.75} />
                        <span className="text-xl font-bold tracking-tight text-primary">AES</span>
                    </Link>
                    <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
                        <a href="#features" className="hover:text-foreground">Features</a>
                        <a href="#how" className="hover:text-foreground">How it works</a>
                    </nav>
                    <div className="flex items-center gap-3">
                        <Link to="/login" data-testid="nav-login-link" className="text-sm text-muted-foreground hover:text-foreground">
                            Login
                        </Link>
                        <Button
                            data-testid="nav-register-btn"
                            onClick={() => navigate("/register")}
                            className="btn-primary rounded-xl px-5"
                        >
                            Get Started
                        </Button>
                    </div>
                </div>
            </header>

            {/* HERO */}
            <section className="relative overflow-hidden bg-radial-glow">
                {/* floating icons */}
                <FileCheck2 className="absolute left-[8%] top-[14%] h-9 w-9 text-primary/40" strokeWidth={1.5} />
                <Brain className="absolute right-[9%] top-[20%] h-10 w-10 text-primary/40" strokeWidth={1.5} />
                <CircleCheck className="absolute left-[12%] bottom-[18%] h-8 w-8 text-primary/40" strokeWidth={1.5} />
                <TrendingUp className="absolute right-[14%] bottom-[22%] h-8 w-8 text-primary/40" strokeWidth={1.5} />

                <div className="relative mx-auto max-w-4xl px-6 pb-32 pt-28 text-center lg:pt-36">
                    <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
                        Automate Exam Evaluation
                        <br />
                        <span className="gradient-text">with AI Precision</span>
                    </h1>
                    <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                        Transform your grading process with intelligent automation. Upload
                        answer sheets, get instant grades with detailed feedback, and unlock
                        powerful analytics.
                    </p>
                    <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
                        <Button
                            data-testid="hero-teacher-login-btn"
                            onClick={teacherGo}
                            className="btn-primary h-12 rounded-xl px-7 text-base font-semibold teal-glow"
                        >
                            <Zap className="mr-2 h-5 w-5" strokeWidth={2} />
                            Teacher Login
                        </Button>
                        <Button
                            data-testid="hero-student-login-btn"
                            onClick={studentGo}
                            variant="outline"
                            className="h-12 rounded-xl border-2 border-primary/70 bg-transparent px-7 text-base font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                        >
                            <TrendingUp className="mr-2 h-5 w-5" strokeWidth={2} />
                            Student Login
                        </Button>
                    </div>
                    <div className="mt-16 inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <CircleCheck className="h-5 w-5 text-emerald-500" strokeWidth={2} />
                        Processing <span className="font-bold text-primary">10,000+</span> evaluations monthly
                    </div>
                </div>
            </section>

            {/* FEATURES */}
            <section id="features" className="border-t border-border bg-background">
                <div className="mx-auto max-w-7xl px-6 py-24">
                    <div className="mb-16 text-center">
                        <h2 className="text-3xl font-bold md:text-5xl">
                            Powerful Features for Modern Education
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                            Everything you need to streamline assessment and grading
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <Feature
                            icon={Upload}
                            title="Bulk PDF Upload"
                            body="Drop question papers, answer keys and student sheets at once. The AI handles the rest."
                        />
                        <Feature
                            icon={Brain}
                            title="AI-Powered Grading"
                            body="Gemini 3 Pro reads handwritten and typed answers, awarding fair partial credit."
                        />
                        <Feature
                            icon={BookOpen}
                            title="Custom Rubrics"
                            body="Upload your own answer key PDF and the AI grades strictly against it."
                        />
                        <Feature
                            icon={BarChart3}
                            title="Detailed Analytics"
                            body="Per-question scores, strengths, weaknesses — and a printable report card."
                        />
                        <Feature
                            icon={ShieldCheck}
                            title="Secure & Private"
                            body="JWT auth, per-role access, encrypted at rest. Your students' data stays yours."
                        />
                        <Feature
                            icon={Gauge}
                            title="Instant Results"
                            body="Most evaluations complete in under 60 seconds, no queue, no waiting."
                        />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section id="how" className="border-t border-border bg-radial-glow">
                <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center">
                    <h2 className="text-3xl font-bold md:text-5xl">
                        Ready to put the red pen down?
                    </h2>
                    <p className="mt-4 max-w-xl text-muted-foreground">
                        Create your account and grade your first answer sheet in under a minute.
                    </p>
                    <Button
                        data-testid="footer-cta-btn"
                        onClick={() => navigate("/register")}
                        className="btn-primary mt-10 h-12 rounded-xl px-8 text-base font-semibold teal-glow"
                    >
                        Get Started Free
                    </Button>
                </div>
            </section>

            <footer className="border-t border-border">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
                    <span>© AES · 2026</span>
                    <span>Powered by Gemini 3 Pro</span>
                </div>
            </footer>
        </div>
    );
}
