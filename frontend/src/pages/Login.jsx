import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { Mail, Lock } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [role, setRole] = useState(params.get("role") || "teacher");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const r = params.get("role");
        if (r) setRole(r);
    }, [params]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const u = await login(email, password);
            // Enforce that the account role matches the selected pill
            if (u.role !== role) {
                toast.error(
                    `This account is registered as a ${u.role}. Switch the toggle to "${u.role === "teacher" ? "Teacher" : "Student"}" and try again.`,
                );
                setSubmitting(false);
                return;
            }
            toast.success(`Welcome back, ${u.name}`);
            navigate(u.role === "teacher" ? "/teacher" : "/student");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Login failed");
        } finally {
            setSubmitting(false);
        }
    };

    const RolePill = ({ value, label }) => (
        <button
            type="button"
            data-testid={`login-role-${value}`}
            onClick={() => setRole(value)}
            className={`h-11 flex-1 rounded-xl text-sm font-semibold transition-all ${
                role === value
                    ? "bg-primary text-primary-foreground teal-glow-sm"
                    : "bg-card text-muted-foreground hover:text-foreground"
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="relative min-h-screen bg-radial-glow">
            <div className="absolute left-8 top-8">
                <BrandMark />
            </div>
            <div className="flex min-h-screen items-center justify-center px-6">
                <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card/70 p-8 backdrop-blur-sm">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold">Welcome Back</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Sign in to your {role} account to continue
                        </p>
                    </div>

                    <div className="mt-8 flex gap-2">
                        <RolePill value="teacher" label="Teacher" />
                        <RolePill value="student" label="Student" />
                    </div>

                    <form onSubmit={onSubmit} className="mt-8 space-y-5">
                        <div>
                            <label className="mb-2 block text-sm font-medium">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                                <input
                                    data-testid="login-email-input"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@school.edu"
                                    className="input-dark h-12 w-full rounded-xl pl-11 pr-4 text-sm"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                                <input
                                    data-testid="login-password-input"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="input-dark h-12 w-full rounded-xl pl-11 pr-4 text-sm"
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={submitting}
                            data-testid="login-submit-btn"
                            className="btn-primary h-12 w-full rounded-xl text-base font-semibold teal-glow"
                        >
                            {submitting ? "Signing in…" : `Sign In as ${role === "teacher" ? "Teacher" : "Student"}`}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don't have an account?{" "}
                        <Link
                            to={`/register?role=${role}`}
                            data-testid="goto-register-link"
                            className="font-semibold text-primary hover:underline"
                        >
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
