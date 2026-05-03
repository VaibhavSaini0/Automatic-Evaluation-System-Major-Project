import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { api, API } from "../lib/api";
import { Button } from "../components/ui/button";
import { Download, ArrowLeft, Check, X, Sparkles, FileText, FileCheck2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

const gradeFromPct = (pct) => {
    if (pct >= 90) return { letter: "A+", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 80) return { letter: "A", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 70) return { letter: "B", bg: "bg-amber-500/15", text: "text-amber-400" };
    if (pct >= 60) return { letter: "C", bg: "bg-orange-500/15", text: "text-orange-400" };
    if (pct >= 50) return { letter: "D", bg: "bg-orange-500/15", text: "text-orange-400" };
    return { letter: "F", bg: "bg-red-500/15", text: "text-red-400" };
};

const Metric = ({ value }) => {
    if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
    const v = Math.round(value);
    const color =
        v >= 80
            ? "text-emerald-400"
            : v >= 60
              ? "text-amber-400"
              : v >= 40
                ? "text-orange-400"
                : "text-red-400";
    return (
        <div className="flex items-center gap-2">
            <div className={`font-mono text-sm font-semibold ${color}`}>{v}</div>
            <div className="h-1 w-12 rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-current opacity-70"
                    style={{ width: `${Math.min(v, 100)}%` }}
                />
            </div>
        </div>
    );
};

export default function EvaluationDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [ev, setEv] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/evaluations/${id}`)
            .then((r) => setEv(r.data))
            .catch((e) => toast.error(e.response?.data?.detail || "Not found"))
            .finally(() => setLoading(false));
    }, [id]);

    const downloadPdf = async () => {
        try {
            const token = localStorage.getItem("mk_token");
            const res = await fetch(`${API}/evaluations/${id}/pdf`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `evaluation-${ev.student_roll_no}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Download failed");
        }
    };

    const viewOriginal = async (kind) => {
        try {
            const { data } = await api.get(`/evaluations/${id}/sheet-url`, {
                params: { kind },
            });
            window.open(data.url, "_blank", "noopener,noreferrer");
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not open PDF");
        }
    };

    if (loading)
        return (
            <DashboardLayout>
                <div className="text-sm text-muted-foreground">Loading…</div>
            </DashboardLayout>
        );
    if (!ev) return null;

    const g = gradeFromPct(ev.percentage || 0);

    return (
        <DashboardLayout>
            <button
                data-testid="back-btn"
                onClick={() => navigate(-1)}
                className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Back
            </button>

            {/* Header */}
            <div className="rounded-2xl border border-border bg-card p-8">
                <div className="flex flex-wrap items-start justify-between gap-6">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-muted-foreground">
                            Evaluation Report
                        </div>
                        <h1 className="mt-2 text-3xl font-bold md:text-4xl">
                            {ev.subject || "General"}
                        </h1>
                        <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                    Roll No
                                </div>
                                <div data-testid="detail-roll" className="font-mono font-semibold">
                                    {ev.student_roll_no}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                    Student
                                </div>
                                <div className="font-semibold">{ev.student_name || "—"}</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                    Teacher
                                </div>
                                <div className="font-semibold">{ev.teacher_name || "—"}</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                    Date
                                </div>
                                <div className="font-mono text-sm">
                                    {(ev.created_at || "").slice(0, 10)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center rounded-2xl border border-primary/30 bg-primary/5 px-8 py-6 teal-glow-sm">
                        <div className="text-xs uppercase tracking-widest text-muted-foreground">
                            Total Score
                        </div>
                        <div
                            data-testid="detail-total-score"
                            className="mt-2 text-5xl font-extrabold gradient-text"
                        >
                            {ev.total_awarded}
                            <span className="text-2xl text-muted-foreground">/{ev.total_max}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">{ev.percentage}%</span>
                            <span
                                className={`flex h-6 w-8 items-center justify-center rounded-full text-xs font-bold ${g.bg} ${g.text}`}
                            >
                                {g.letter}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Button
                        onClick={downloadPdf}
                        data-testid="download-pdf-btn"
                        className="btn-primary h-11 rounded-xl px-6 font-semibold"
                    >
                        <Download className="mr-2 h-4 w-4" strokeWidth={2} />
                        Download PDF Report
                    </Button>
                    <button
                        type="button"
                        data-testid="view-student-sheet-btn"
                        onClick={() => viewOriginal("student_sheet")}
                        className="flex h-11 items-center gap-2 rounded-xl border-2 border-primary/60 bg-transparent px-5 text-sm font-semibold text-primary transition-all hover:bg-primary/10"
                    >
                        <PencilLine className="h-4 w-4" strokeWidth={1.75} />
                        View Answer Sheet
                    </button>
                    <button
                        type="button"
                        data-testid="view-question-paper-btn"
                        onClick={() => viewOriginal("question_paper")}
                        className="flex h-11 items-center gap-2 rounded-xl border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/60 hover:text-primary"
                    >
                        <FileText className="h-4 w-4" strokeWidth={1.75} />
                        Question Paper
                    </button>
                    {user?.role === "teacher" && (
                        <button
                            type="button"
                            data-testid="view-answer-key-btn"
                            onClick={() => viewOriginal("answer_key")}
                            className="flex h-11 items-center gap-2 rounded-xl border border-border bg-transparent px-5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/60 hover:text-primary"
                        >
                            <FileCheck2 className="h-4 w-4" strokeWidth={1.75} />
                            Answer Key
                        </button>
                    )}
                </div>
            </div>

            {/* Per-question */}
            <div className="mt-6 rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-5 text-lg font-bold">Question-wise Marks</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                                <th className="pb-3 pr-4 font-medium">Q.No</th>
                                <th className="pb-3 pr-4 font-medium">Marks</th>
                                <th className="pb-3 pr-4 font-medium">Similarity</th>
                                <th className="pb-3 pr-4 font-medium">Keywords</th>
                                <th className="pb-3 pr-4 font-medium">Grammar</th>
                                <th className="pb-3 font-medium">Feedback</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ev.questions.map((q, i) => (
                                <tr
                                    key={i}
                                    data-testid={`q-row-${i}`}
                                    className="border-b border-border/50 last:border-0"
                                >
                                    <td className="py-4 pr-4 font-mono font-semibold">{q.question_no}</td>
                                    <td className="py-4 pr-4 font-mono">
                                        <span className="font-bold text-primary">{q.awarded_marks}</span>
                                        <span className="text-muted-foreground">/{q.max_marks}</span>
                                    </td>
                                    <td className="py-4 pr-4">
                                        <Metric value={q.semantic_similarity} />
                                    </td>
                                    <td className="py-4 pr-4">
                                        <Metric value={q.keyword_match} />
                                    </td>
                                    <td className="py-4 pr-4">
                                        <Metric value={q.grammar_score} />
                                    </td>
                                    <td className="py-4 text-muted-foreground">{q.feedback}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Feedback grid */}
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card p-6 md:col-span-3">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.75} />
                        Overall Feedback
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {ev.overall_feedback}
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-6 md:col-span-1">
                    <div className="mb-4 text-sm font-semibold text-emerald-400">Strengths</div>
                    <ul className="space-y-3">
                        {ev.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                                <Check
                                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                                    strokeWidth={2}
                                />
                                <span className="text-muted-foreground">{s}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="rounded-2xl border border-border bg-card p-6 md:col-span-2">
                    <div className="mb-4 text-sm font-semibold text-red-400">Areas to Improve</div>
                    <ul className="space-y-3">
                        {ev.weaknesses.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                                <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" strokeWidth={2} />
                                <span className="text-muted-foreground">{s}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </DashboardLayout>
    );
}
