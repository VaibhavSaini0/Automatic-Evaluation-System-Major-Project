import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { api } from "../lib/api";
import {
    FileCheck2,
    Clock3,
    TrendingUp,
    BookOpen,
    Upload,
    ClipboardCheck,
    ChevronRight,
} from "lucide-react";

const StatCard = ({ icon: Icon, iconColor, value, label, badge }) => (
    <div className="rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40">
        <div className="mb-8 flex items-start justify-between">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconColor}`}>
                <Icon className="h-5 w-5" strokeWidth={2} />
            </div>
            {badge != null && (
                <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-400">
                    {badge}
                </span>
            )}
        </div>
        <div className="text-3xl font-bold">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
);

const ActionCard = ({ to, icon: Icon, iconColor, title, body }) => (
    <Link
        to={to}
        data-testid={`action-${title.toLowerCase().replace(/\s+/g, "-")}`}
        className="group rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/50 hover:bg-card/80"
    >
        <div className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${iconColor}`}>
            <Icon className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </Link>
);

const gradeFromPct = (pct) => {
    if (pct >= 90) return { letter: "A+", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 80) return { letter: "A", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 70) return { letter: "B", bg: "bg-amber-500/15", text: "text-amber-400" };
    if (pct >= 60) return { letter: "C", bg: "bg-orange-500/15", text: "text-orange-400" };
    if (pct >= 50) return { letter: "D", bg: "bg-orange-500/15", text: "text-orange-400" };
    return { letter: "F", bg: "bg-red-500/15", text: "text-red-400" };
};

const timeAgo = (iso) => {
    const d = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (d < 1) return "today";
    if (d < 2) return "1 day ago";
    return `${Math.floor(d)} days ago`;
};

export default function TeacherDashboard() {
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
        : "0.0";

    return (
        <DashboardLayout>
            <div className="mb-10">
                <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Welcome back! Here's your evaluation overview.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    icon={FileCheck2}
                    iconColor="bg-primary/15 text-primary"
                    value={loading ? "—" : evals.length}
                    label="Total Evaluations"
                />
                <StatCard
                    icon={Clock3}
                    iconColor="bg-amber-500/15 text-amber-400"
                    value="0"
                    label="Pending Reviews"
                />
                <StatCard
                    icon={TrendingUp}
                    iconColor="bg-emerald-500/15 text-emerald-400"
                    value={`${avg}%`}
                    label="Average Grade"
                />
                <StatCard
                    icon={BookOpen}
                    iconColor="bg-sky-500/15 text-sky-400"
                    value="1"
                    label="Active Rubric"
                />
            </div>

            {/* Quick Actions */}
            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
                <ActionCard
                    to="/teacher/upload"
                    icon={Upload}
                    iconColor="bg-primary/15 text-primary"
                    title="Upload Answer Sheets"
                    body="Upload student answer sheets for AI evaluation"
                />
                <ActionCard
                    to="/teacher/results"
                    icon={ClipboardCheck}
                    iconColor="bg-emerald-500/15 text-emerald-400"
                    title="View All Results"
                    body="Browse and manage evaluation results"
                />
                <ActionCard
                    to="/teacher/upload"
                    icon={BookOpen}
                    iconColor="bg-amber-500/15 text-amber-400"
                    title="Manage Rubrics"
                    body="Your answer key PDF acts as the rubric"
                />
            </div>

            {/* Recent */}
            <div className="mt-10 rounded-2xl border border-border bg-card p-6">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-bold">Recent Evaluations</h2>
                    <Link
                        to="/teacher/results"
                        data-testid="view-all-results"
                        className="rounded-lg border border-primary/60 px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
                    >
                        View All
                    </Link>
                </div>
                {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
                {!loading && evals.length === 0 && (
                    <div data-testid="teacher-empty" className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                        No evaluations yet. Upload your first answer sheet to begin.
                    </div>
                )}
                <div className="space-y-3">
                    {evals.slice(0, 5).map((ev) => {
                        const g = gradeFromPct(ev.percentage || 0);
                        return (
                            <Link
                                key={ev.id}
                                to={`/evaluation/${ev.id}`}
                                data-testid={`recent-eval-${ev.id}`}
                                className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-5 py-4 transition-colors hover:border-primary/40 hover:bg-card"
                            >
                                <div>
                                    <div className="font-semibold">
                                        {ev.student_name || ev.student_roll_no}
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                        Roll {ev.student_roll_no} · {ev.subject || "General"}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="font-mono text-sm font-semibold">
                                        {ev.total_awarded}/{ev.total_max}
                                    </div>
                                    <div
                                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${g.bg} ${g.text}`}
                                    >
                                        {g.letter}
                                    </div>
                                    <div className="hidden w-20 text-xs text-muted-foreground md:block">
                                        {timeAgo(ev.created_at)}
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
