import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { api, API } from "../lib/api";
import {
    Search,
    Eye,
    Download,
    ClipboardCheck,
    FileDown,
    Mail,
    Filter,
    ExternalLink,
    Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../components/ui/alert-dialog";

const gradeFromPct = (pct) => {
    if (pct >= 90) return { letter: "A+", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 80) return { letter: "A", bg: "bg-emerald-500/15", text: "text-emerald-400" };
    if (pct >= 70) return { letter: "B", bg: "bg-amber-500/15", text: "text-amber-400" };
    if (pct >= 60) return { letter: "C", bg: "bg-orange-500/15", text: "text-orange-400" };
    if (pct >= 50) return { letter: "D", bg: "bg-orange-500/15", text: "text-orange-400" };
    return { letter: "F", bg: "bg-red-500/15", text: "text-red-400" };
};

export default function ResultsList() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [evals, setEvals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [subject, setSubject] = useState("all");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => {
        api.get("/evaluations")
            .then((r) => setEvals(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const subjects = useMemo(() => {
        const s = new Set(evals.map((e) => e.subject || "General"));
        return ["all", ...Array.from(s).sort()];
    }, [evals]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        const fromD = from ? new Date(from).getTime() : null;
        const toD = to ? new Date(to).getTime() + 86400000 : null;
        return evals.filter((e) => {
            if (s) {
                const hit =
                    (e.student_name || "").toLowerCase().includes(s) ||
                    (e.student_roll_no || "").toLowerCase().includes(s) ||
                    (e.subject || "").toLowerCase().includes(s);
                if (!hit) return false;
            }
            if (subject !== "all" && (e.subject || "General") !== subject) return false;
            if (fromD || toD) {
                const t = new Date(e.created_at).getTime();
                if (fromD && t < fromD) return false;
                if (toD && t > toD) return false;
            }
            return true;
        });
    }, [evals, q, subject, from, to]);

    const downloadPdf = async (id, roll) => {
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
            a.download = `evaluation-${roll}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Download failed");
        }
    };

    const exportCsv = async () => {
        try {
            const token = localStorage.getItem("mk_token");
            const res = await fetch(`${API}/export/evaluations.csv`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "aes-evaluations.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success("CSV downloaded");
        } catch {
            toast.error("Export failed");
        }
    };

    const emailAll = async () => {
        try {
            const { data } = await api.get("/export/recipients");
            if (!data.count) {
                toast.error("No registered students to email yet.");
                return;
            }
            const subject = encodeURIComponent("Your AES Evaluation Results");
            const body = encodeURIComponent(
                `Dear Student,\n\nYour evaluation results are now available.\n` +
                `Log in to AES to view your detailed report and feedback:\n\n` +
                `${window.location.origin}\n\nBest regards,\n${user?.name || "Your Teacher"}`,
            );
            window.location.href = `mailto:?bcc=${data.emails.join(",")}&subject=${subject}&body=${body}`;
            toast.success(`Opening your email client for ${data.count} student(s)`);
        } catch {
            toast.error("Couldn't build email");
        }
    };

    const viewSheet = async (id) => {
        try {
            const { data } = await api.get(`/evaluations/${id}/sheet-url`, {
                params: { kind: "student_sheet" },
            });
            window.open(data.url, "_blank", "noopener,noreferrer");
        } catch (e) {
            toast.error(e.response?.data?.detail || "Could not open answer sheet");
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/evaluations/${deleteTarget.id}`);
            setEvals((cur) => cur.filter((e) => e.id !== deleteTarget.id));
            toast.success("Evaluation deleted");
        } catch (e) {
            toast.error(e.response?.data?.detail || "Delete failed");
        } finally {
            setDeleteTarget(null);
        }
    };

    const title = user?.role === "teacher" ? "Results Management" : "My Results";
    const subtitle =
        user?.role === "teacher"
            ? "View, filter, and export all evaluation results"
            : "Your evaluation history at a glance";

    return (
        <DashboardLayout>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">{title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                </div>
                {user?.role === "teacher" && (
                    <div className="flex gap-2">
                        <button
                            data-testid="export-csv-btn"
                            onClick={exportCsv}
                            className="flex items-center gap-2 rounded-xl border-2 border-primary/60 bg-transparent px-4 py-2 text-sm font-semibold text-primary transition-all hover:bg-primary/10"
                        >
                            <FileDown className="h-4 w-4" strokeWidth={1.75} />
                            Export CSV
                        </button>
                        <button
                            data-testid="email-all-btn"
                            onClick={emailAll}
                            className="flex items-center gap-2 rounded-xl border-2 border-primary/60 bg-transparent px-4 py-2 text-sm font-semibold text-primary transition-all hover:bg-primary/10"
                        >
                            <Mail className="h-4 w-4" strokeWidth={1.75} />
                            Email All
                        </button>
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
                {/* Filters */}
                <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-12">
                    <div className="relative lg:col-span-5">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                        <input
                            data-testid="results-search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search by name, roll or subject…"
                            className="input-dark h-11 w-full rounded-xl pl-11 pr-4 text-sm"
                        />
                    </div>
                    <div className="relative lg:col-span-3">
                        <Filter className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                        <select
                            data-testid="results-subject-filter"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="input-dark h-11 w-full rounded-xl pl-11 pr-4 text-sm appearance-none"
                        >
                            {subjects.map((s) => (
                                <option key={s} value={s}>
                                    {s === "all" ? "All subjects" : s}
                                </option>
                            ))}
                        </select>
                    </div>
                    <input
                        data-testid="results-from-date"
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="input-dark h-11 rounded-xl px-4 text-sm lg:col-span-2"
                        placeholder="From"
                    />
                    <input
                        data-testid="results-to-date"
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="input-dark h-11 rounded-xl px-4 text-sm lg:col-span-2"
                        placeholder="To"
                    />
                </div>

                {loading && (
                    <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
                )}
                {!loading && filtered.length === 0 && (
                    <div
                        data-testid="results-empty"
                        className="rounded-xl border border-dashed border-border py-16 text-center"
                    >
                        <ClipboardCheck
                            className="mx-auto mb-3 h-10 w-10 text-muted-foreground"
                            strokeWidth={1.5}
                        />
                        <div className="text-sm text-muted-foreground">
                            {evals.length === 0
                                ? "No evaluations yet."
                                : "No results match your filters."}
                        </div>
                    </div>
                )}

                {!loading && filtered.length > 0 && (
                    <>
                        <div className="mb-3 text-xs text-muted-foreground">
                            Showing {filtered.length} of {evals.length} result{evals.length !== 1 ? "s" : ""}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                                        <th className="pb-3 pr-4 font-medium">Student</th>
                                        <th className="pb-3 pr-4 font-medium">Roll No.</th>
                                        <th className="pb-3 pr-4 font-medium">Subject</th>
                                        <th className="pb-3 pr-4 font-medium">Marks</th>
                                        <th className="pb-3 pr-4 font-medium">Grade</th>
                                        <th className="pb-3 pr-4 font-medium">Date</th>
                                        <th className="pb-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((ev) => {
                                        const g = gradeFromPct(ev.percentage || 0);
                                        const stop = (e) => e.stopPropagation();
                                        return (
                                            <tr
                                                key={ev.id}
                                                data-testid={`row-${ev.id}`}
                                                onClick={() => navigate(`/evaluation/${ev.id}`)}
                                                className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-primary/5"
                                            >
                                                <td className="py-4 pr-4">
                                                    <div className="font-semibold">
                                                        {ev.student_name || "Unregistered"}
                                                    </div>
                                                </td>
                                                <td className="py-4 pr-4 font-mono text-xs text-muted-foreground">
                                                    {ev.student_roll_no}
                                                </td>
                                                <td className="py-4 pr-4 text-muted-foreground">
                                                    {ev.subject || "General"}
                                                </td>
                                                <td className="py-4 pr-4">
                                                    <div className="font-mono font-semibold">
                                                        {ev.total_awarded}/{ev.total_max}
                                                    </div>
                                                    <div className="mt-1 h-1 w-20 rounded-full bg-muted">
                                                        <div
                                                            className="h-full rounded-full bg-primary"
                                                            style={{ width: `${Math.min(ev.percentage || 0, 100)}%` }}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="py-4 pr-4">
                                                    <span
                                                        className={`inline-flex h-7 min-w-[2rem] items-center justify-center rounded-full px-2 text-xs font-bold ${g.bg} ${g.text}`}
                                                    >
                                                        {g.letter}
                                                    </span>
                                                </td>
                                                <td className="py-4 pr-4 text-xs text-muted-foreground">
                                                    {(ev.created_at || "").slice(0, 10)}
                                                </td>
                                                <td className="py-4" onClick={stop}>
                                                    <div className="flex items-center gap-1">
                                                        <Link
                                                            to={`/evaluation/${ev.id}`}
                                                            data-testid={`view-${ev.id}`}
                                                            title="View details"
                                                            className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                                        >
                                                            <Eye className="h-4 w-4" strokeWidth={1.75} />
                                                        </Link>
                                                        <button
                                                            data-testid={`sheet-${ev.id}`}
                                                            onClick={() => viewSheet(ev.id)}
                                                            title="Open answer sheet in new tab"
                                                            className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                                        >
                                                            <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                                                        </button>
                                                        <button
                                                            data-testid={`download-${ev.id}`}
                                                            onClick={() => downloadPdf(ev.id, ev.student_roll_no)}
                                                            title="Download report PDF"
                                                            className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                                        >
                                                            <Download className="h-4 w-4" strokeWidth={1.75} />
                                                        </button>
                                                        {user?.role === "teacher" && (
                                                            <button
                                                                data-testid={`delete-${ev.id}`}
                                                                onClick={() => setDeleteTarget(ev)}
                                                                title="Delete evaluation"
                                                                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent className="border-border bg-card">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this evaluation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the evaluation for{" "}
                            <span className="font-semibold text-foreground">
                                {deleteTarget?.student_name || deleteTarget?.student_roll_no}
                            </span>{" "}
                            and remove all stored PDFs (question paper, answer key, student
                            sheet, and report) from storage. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel data-testid="delete-cancel-btn" className="rounded-xl">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="delete-confirm-btn"
                            onClick={confirmDelete}
                            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete forever
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DashboardLayout>
    );
}
