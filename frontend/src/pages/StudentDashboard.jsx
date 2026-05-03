import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
    FileCheck2,
    TrendingUp,
    Award,
    ChevronRight,
    Sparkles,
} from "lucide-react";

const gradeFromPct = (pct) => {
    if (pct >= 90) return { letter: "A+", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 80) return { letter: "A", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 70) return { letter: "B", bg: "bg-amber-500/15", text: "text-amber-400" };
    if (pct >= 60) return { letter: "C", bg: "bg-orange-500/15", text: "text-orange-400" };
    if (pct >= 50) return { letter: "D", bg: "bg-orange-500/15", text: "text-orange-400" };
    return { letter: "F", bg: "bg-red-500/15", text: "text-red-400" };
};

export default function StudentDashboard() {
    const { user } = useAuth();
    const [evals, setEvals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/evaluations")
            .then((r) => setEvals(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const avg = evals.length
        ? (evals.reduce((s, e) => s + (e.percentage || 0), 0) / evals.length).toFixed(1)
        : "—";
    const best = evals.length ? Math.max(...evals.map((e) => e.percentage || 0)).toFixed(1) : "—";

    return (
        <DashboardLayout>
            <div className="mb-10">
                <h1 className="text-3xl font-bold">Welcome, {user?.name?.split(" ")[0]}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Roll Number · <span className="font-mono text-primary">{user?.roll_no}</span>
                </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card p-6">
                    <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <FileCheck2 className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="text-3xl font-bold">{loading ? "—" : evals.length}</div>
                    <div className="mt-1 text-sm text-muted-foreground">Total Evaluations</div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-6">
                    <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                        <TrendingUp className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="text-3xl font-bold">
                        {avg === "—" ? "—" : `${avg}%`}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">Average Score</div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-6">
                    <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                        <Award className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <div className="text-3xl font-bold">
                        {best === "—" ? "—" : `${best}%`}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">Best Score</div>
                </div>
            </div>

            <div className="mt-10 rounded-2xl border border-border bg-card p-6">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-bold">Recent Evaluations</h2>
                    <Link
                        to="/student/results"
                        data-testid="view-all-results"
                        className="rounded-lg border border-primary/60 px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
                    >
                        View All
                    </Link>
                </div>
                {loading && (
                    <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                )}
                {!loading && evals.length === 0 && (
                    <div data-testid="student-empty" className="rounded-xl border border-dashed border-border py-14 text-center">
                        <Sparkles className="mx-auto mb-3 h-10 w-10 text-primary" strokeWidth={1.5} />
                        <div className="text-sm text-muted-foreground">
                            No evaluations yet. Check back after your teacher grades a sheet.
                        </div>
                    </div>
                )}
                <div className="space-y-3">
                    {evals.slice(0, 5).map((ev) => {
                        const g = gradeFromPct(ev.percentage || 0);
                        return (
                            <Link
                                key={ev.id}
                                to={`/evaluation/${ev.id}`}
                                data-testid={`student-eval-${ev.id}`}
                                className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-5 py-4 transition-colors hover:border-primary/40 hover:bg-card"
                            >
                                <div>
                                    <div className="font-semibold">{ev.subject || "General"}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                        Graded by {ev.teacher_name || "—"} ·{" "}
                                        {(ev.created_at || "").slice(0, 10)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="font-mono text-sm font-semibold">
                                        {ev.total_awarded}/{ev.total_max}
                                    </div>
                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${g.bg} ${g.text}`}>
                                        {g.letter}
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </DashboardLayout>
    );
}
