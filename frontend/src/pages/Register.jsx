import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { User, Mail, Lock, Hash } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rollNo, setRollNo] = useState("");
    const [role, setRole] = useState(params.get("role") || "teacher");
    const [submitting, setSubmitting] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = { name, email, password, role };
            if (role === "student") payload.roll_no = rollNo;
            const u = await register(payload);
            toast.success(`Welcome, ${u.name}`);
            navigate(u.role === "teacher" ? "/teacher" : "/student");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Registration failed");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative min-h-screen bg-radial-glow">
            <div className="absolute left-8 top-8">
                <BrandMark />
            </div>
            <div className="flex min-h-screen items-center justify-center px-6 py-16">
                <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card/70 p-8 backdrop-blur-sm">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold">Create Account</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Join AES and start grading smarter
                        </p>
                    </div>

                    <div className="mt-8 flex gap-2">
                        <button
                            type="button"
                            data-testid="role-teacher-btn"
                            onClick={() => setRole("teacher")}
                            className={`h-11 flex-1 rounded-xl text-sm font-semibold transition-all ${
                                role === "teacher"
                                    ? "bg-primary text-primary-foreground teal-glow-sm"
                                    : "bg-card text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Teacher
                        </button>
                        <button
                            type="button"
                            data-testid="role-student-btn"
                            onClick={() => setRole("student")}
                            className={`h-11 flex-1 rounded-xl text-sm font-semibold transition-all ${
                                role === "student"
                                    ? "bg-primary text-primary-foreground teal-glow-sm"
                                    : "bg-card text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Student
                        </button>
                    </div>

                    <form onSubmit={onSubmit} className="mt-6 space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium">Full name</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                                <input
                                    data-testid="register-name-input"
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Jane Doe"
                                    className="input-dark h-12 w-full rounded-xl pl-11 pr-4 text-sm"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                                <input
                                    data-testid="register-email-input"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@school.edu"
                                    className="input-dark h-12 w-full rounded-xl pl-11 pr-4 text-sm"
                                />
                            </div>
                        </div>
                        {role === "student" && (
                            <div>
                                <label className="mb-2 block text-sm font-medium">Roll number</label>
                                <div className="relative">
                                    <Hash className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                                    <input
                                        data-testid="register-roll-input"
                                        type="text"
                                        required
                                        value={rollNo}
                                        onChange={(e) => setRollNo(e.target.value.toUpperCase())}
                                        placeholder="CS21-087"
                                        className="input-dark h-12 w-full rounded-xl pl-11 pr-4 text-sm"
                                    />
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="mb-2 block text-sm font-medium">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                                <input
                                    data-testid="register-password-input"
                                    type="password"
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="At least 6 characters"
                                    className="input-dark h-12 w-full rounded-xl pl-11 pr-4 text-sm"
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={submitting}
                            data-testid="register-submit-btn"
                            className="btn-primary h-12 w-full rounded-xl text-base font-semibold teal-glow"
                        >
                            {submitting ? "Creating…" : "Create Account"}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Have an account?{" "}
                        <Link
                            to="/login"
                            data-testid="goto-login-link"
                            className="font-semibold text-primary hover:underline"
                        >
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
