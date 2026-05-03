import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import {
    Upload as UploadIcon,
    FileText,
    FileCheck2,
    PencilLine,
    Loader2,
    X,
} from "lucide-react";
import { toast } from "sonner";

const FileTile = ({ label, file, onFile, icon: Icon, testId }) => {
    const ref = useRef(null);
    return (
        <div
            onClick={() => ref.current?.click()}
            className={`group cursor-pointer rounded-2xl border-2 border-dashed p-5 transition-all ${
                file
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-card/40 hover:border-primary/40"
            }`}
        >
            <input
                ref={ref}
                type="file"
                accept="application/pdf"
                className="hidden"
                data-testid={`${testId}-input`}
                onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
            <div className="flex items-start justify-between">
                <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                        file ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                {file && (
                    <button
                        type="button"
                        data-testid={`${testId}-clear`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onFile(null);
                        }}
                        className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
            <div className="mt-4 text-sm font-semibold">{label}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
                {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "Click to choose a PDF"}
            </div>
        </div>
    );
};

export default function TeacherUpload() {
    const navigate = useNavigate();
    const [qp, setQp] = useState(null);
    const [ak, setAk] = useState(null);
    const [ss, setSs] = useState(null);
    const [rollNo, setRollNo] = useState("");
    const [subject, setSubject] = useState("");
    const [strictness, setStrictness] = useState("balanced");
    const [busy, setBusy] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!qp || !ak || !ss || !rollNo.trim()) {
            toast.error("All 3 PDFs and a roll number are required.");
            return;
        }
        setBusy(true);
        const fd = new FormData();
        fd.append("roll_no", rollNo.trim().toUpperCase());
        fd.append("strictness", strictness);
        fd.append("question_paper", qp);
        fd.append("answer_key", ak);
        fd.append("student_sheet", ss);
        try {
            const { data } = await api.post("/evaluate", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 180000,
            });
            toast.success(`Graded — ${data.total_awarded}/${data.total_max}`);
            navigate(`/evaluation/${data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Evaluation failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Upload Answer Sheets</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Upload student answer sheets for AI evaluation
                </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
                {/* Details card */}
                <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="mb-5 text-lg font-bold">Student &amp; Exam Details</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                Roll Number <span className="text-destructive">*</span>
                            </label>
                            <input
                                data-testid="upload-roll-input"
                                value={rollNo}
                                onChange={(e) => setRollNo(e.target.value.toUpperCase())}
                                placeholder="e.g. CS21-087"
                                required
                                className="input-dark h-11 w-full rounded-xl px-4 text-sm"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                                If a registered student has this roll, they'll see this report instantly.
                            </p>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium">
                                Subject <span className="text-xs text-muted-foreground">(AI auto-detects if blank)</span>
                            </label>
                            <input
                                data-testid="upload-subject-input"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="e.g. Mathematics"
                                className="input-dark h-11 w-full rounded-xl px-4 text-sm"
                            />
                        </div>
                    </div>

                    <div className="mt-5">
                        <label className="mb-2 block text-sm font-medium">
                            Grading Strictness
                        </label>
                        <div className="flex gap-2">
                            {[
                                { value: "lenient", label: "Lenient", hint: "Generous, ideas over form" },
                                { value: "balanced", label: "Balanced", hint: "Fair & rigorous" },
                                { value: "strict", label: "Strict", hint: "Board-exam rigor" },
                            ].map((m) => (
                                <button
                                    key={m.value}
                                    type="button"
                                    data-testid={`strictness-${m.value}`}
                                    onClick={() => setStrictness(m.value)}
                                    className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all ${
                                        strictness === m.value
                                            ? "border-primary bg-primary/10 teal-glow-sm"
                                            : "border-border bg-card hover:border-primary/40"
                                    }`}
                                >
                                    <div
                                        className={`text-sm font-semibold ${
                                            strictness === m.value ? "text-primary" : "text-foreground"
                                        }`}
                                    >
                                        {m.label}
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">{m.hint}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Files card */}
                <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="mb-5 text-lg font-bold">Required PDFs</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <FileTile testId="qp" label="Question Paper" file={qp} onFile={setQp} icon={FileText} />
                        <FileTile testId="ak" label="Answer Key" file={ak} onFile={setAk} icon={FileCheck2} />
                        <FileTile testId="ss" label="Student Answer Sheet" file={ss} onFile={setSs} icon={PencilLine} />
                    </div>

                    <div className="mt-6 rounded-xl border border-dashed border-border bg-background/40 py-10 text-center">
                        <UploadIcon className="mx-auto h-10 w-10 text-primary" strokeWidth={1.5} />
                        <div className="mt-4 text-sm font-semibold">Drop PDFs into the tiles above</div>
                        <div className="mt-1 text-xs text-muted-foreground">PDF only · up to 25MB each</div>
                    </div>
                </div>

                <Button
                    type="submit"
                    disabled={busy}
                    data-testid="evaluate-submit-btn"
                    className="btn-primary h-12 w-full rounded-xl text-base font-semibold teal-glow"
                >
                    {busy ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Evaluating 
                        </>
                    ) : (
                        <>
                            <UploadIcon className="mr-2 h-5 w-5" strokeWidth={2} />
                            Upload &amp; Evaluate
                        </>
                    )}
                </Button>
            </form>
        </DashboardLayout>
    );
}
