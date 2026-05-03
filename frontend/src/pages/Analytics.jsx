import { useEffect, useState, useMemo } from "react";
import { DashboardLayout } from "../components/DashboardLayout";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";
import { TrendingUp, Award, Target, FileCheck2 } from "lucide-react";

const GRADE_BUCKETS = [
    { label: "A+", min: 90, color: "#10b981" },
    { label: "A", min: 80, color: "#22c55e" },
    { label: "B", min: 70, color: "#f59e0b" },
    { label: "C", min: 60, color: "#f97316" },
    { label: "D", min: 50, color: "#fb923c" },
    { label: "F", min: 0, color: "#ef4444" },
];
const gradeOf = (pct) => GRADE_BUCKETS.find((g) => pct >= g.min)?.label || "F";

const Stat = ({ icon: Icon, color, value, label }) => (
    <div className="rounded-2xl border border-border bg-card p-6">
        <div className={`mb-6 flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="text-3xl font-bold">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
);

export default function Analytics() {
    const { user } = useAuth();
    const [evals, setEvals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/evaluations")
            .then((r) => setEvals(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const { avg, best, total, gradeData, trendData, subjectData, leaderboard } = useMemo(() => {
        if (!evals.length)
            return { avg: 0, best: 0, total: 0, gradeData: [], trendData: [], subjectData: [], leaderboard: [] };
        const avg = evals.reduce((s, e) => s + (e.percentage || 0), 0) / evals.length;
        const best = Math.max(...evals.map((e) => e.percentage || 0));

        const gCount = {};
        evals.forEach((e) => {
            const g = gradeOf(e.percentage || 0);
            gCount[g] = (gCount[g] || 0) + 1;
        });
        const gradeData = GRADE_BUCKETS.filter((g) => gCount[g.label]).map((g) => ({
            name: g.label,
            value: gCount[g.label],
            color: g.color,
        }));

        const trendData = [...evals]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((e) => ({
                date: (e.created_at || "").slice(5, 10),
                score: Number((e.percentage || 0).toFixed(1)),
                label: e.student_name || e.student_roll_no,
            }));

        const subjMap = {};
        evals.forEach((e) => {
            const s = e.subject || "General";
            if (!subjMap[s]) subjMap[s] = { subject: s, total: 0, count: 0 };
            subjMap[s].total += e.percentage || 0;
            subjMap[s].count += 1;
        });
        const subjectData = Object.values(subjMap).map((r) => ({
            subject: r.subject,
            avg: Number((r.total / r.count).toFixed(1)),
        }));

        // Leaderboard: aggregate per student (roll_no), average %, sort desc
        const studentMap = {};
        evals.forEach((e) => {
            const key = e.student_roll_no || "?";
            if (!studentMap[key])
                studentMap[key] = {
                    roll: key,
                    name: e.student_name || "Unregistered",
                    total: 0,
                    count: 0,
                };
            studentMap[key].total += e.percentage || 0;
            studentMap[key].count += 1;
        });
        const leaderboard = Object.values(studentMap)
            .map((s) => ({ ...s, avg: Number((s.total / s.count).toFixed(1)) }))
            .sort((a, b) => b.avg - a.avg);

        return { avg, best, total: evals.length, gradeData, trendData, subjectData, leaderboard };
    }, [evals]);

    return (
        <DashboardLayout>
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Analytics</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {user?.role === "teacher"
                        ? "Performance insights across all your evaluations"
                        : "Your performance over time"}
                </p>
            </div>

            {loading && (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            )}

            {!loading && evals.length === 0 && (
                <div
                    data-testid="analytics-empty"
                    className="rounded-2xl border border-dashed border-border bg-card py-16 text-center"
                >
                    <BarChart3Empty />
                    <div className="mt-4 text-sm text-muted-foreground">
                        No data yet. Analytics will appear once evaluations are graded.
                    </div>
                </div>
            )}

            {!loading && evals.length > 0 && (
                <>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                        <Stat icon={FileCheck2} color="bg-primary/15 text-primary" value={total} label="Evaluations" />
                        <Stat
                            icon={TrendingUp}
                            color="bg-emerald-500/15 text-emerald-400"
                            value={`${avg.toFixed(1)}%`}
                            label="Average Score"
                        />
                        <Stat
                            icon={Award}
                            color="bg-amber-500/15 text-amber-400"
                            value={`${best.toFixed(1)}%`}
                            label="Best Score"
                        />
                        <Stat
                            icon={Target}
                            color="bg-sky-500/15 text-sky-400"
                            value={gradeOf(avg)}
                            label="Avg Grade"
                        />
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="rounded-2xl border border-border bg-card p-6">
                            <h2 className="mb-5 text-lg font-bold">Score Trend</h2>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                                        <XAxis dataKey="date" stroke="#888" fontSize={12} />
                                        <YAxis stroke="#888" fontSize={12} domain={[0, 100]} />
                                        <Tooltip
                                            contentStyle={{
                                                background: "#0f1414",
                                                border: "1px solid #222",
                                                borderRadius: 12,
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="score"
                                            stroke="#14b8a6"
                                            strokeWidth={2}
                                            dot={{ fill: "#14b8a6", r: 4 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-6">
                            <h2 className="mb-5 text-lg font-bold">Grade Distribution</h2>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={gradeData}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={55}
                                            outerRadius={90}
                                            paddingAngle={3}
                                        >
                                            {gradeData.map((e, i) => (
                                                <Cell key={i} fill={e.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                background: "#0f1414",
                                                border: "1px solid #222",
                                                borderRadius: 12,
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
                            <h2 className="mb-5 text-lg font-bold">Average by Subject</h2>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={subjectData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                                        <XAxis dataKey="subject" stroke="#888" fontSize={12} />
                                        <YAxis stroke="#888" fontSize={12} domain={[0, 100]} />
                                        <Tooltip
                                            contentStyle={{
                                                background: "#0f1414",
                                                border: "1px solid #222",
                                                borderRadius: 12,
                                            }}
                                        />
                                        <Bar dataKey="avg" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {user?.role === "teacher" && leaderboard.length > 0 && (
                            <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
                                <div className="mb-5 flex items-center justify-between">
                                    <h2 className="text-lg font-bold">Class Leaderboard</h2>
                                    <span className="text-xs text-muted-foreground">
                                        Avg. across all evaluations
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <div>
                                        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                                            Top Performers
                                        </div>
                                        <div className="space-y-2">
                                            {leaderboard.slice(0, 5).map((s, i) => (
                                                <LeaderRow
                                                    key={s.roll}
                                                    rank={i + 1}
                                                    student={s}
                                                    accent="emerald"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    {leaderboard.length > 5 && (
                                        <div>
                                            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-400">
                                                Needs Attention
                                            </div>
                                            <div className="space-y-2">
                                                {leaderboard
                                                    .slice(-5)
                                                    .reverse()
                                                    .map((s, i) => (
                                                        <LeaderRow
                                                            key={s.roll}
                                                            rank={leaderboard.length - i}
                                                            student={s}
                                                            accent="red"
                                                        />
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </DashboardLayout>
    );
}

const BarChart3Empty = () => (
    <svg className="mx-auto h-12 w-12 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3v18h18M8 17V9m4 8V5m4 12v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const LeaderRow = ({ rank, student, accent }) => {
    const accentClasses =
        accent === "emerald"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400";
    const initials = (student.name || "?")
        .split(" ")
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
    return (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2.5">
            <div className="flex items-center gap-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${accentClasses}`}>
                    #{rank}
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                    {initials}
                </div>
                <div>
                    <div className="text-sm font-semibold leading-tight">{student.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                        {student.roll} · {student.count} eval{student.count !== 1 ? "s" : ""}
                    </div>
                </div>
            </div>
            <div className="text-right">
                <div className="font-mono text-sm font-bold">{student.avg}%</div>
            </div>
        </div>
    );
};
