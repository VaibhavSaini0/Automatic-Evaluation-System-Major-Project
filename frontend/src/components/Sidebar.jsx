import { NavLink, useNavigate } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { useAuth } from "../context/AuthContext";
import {
    LayoutDashboard,
    Upload,
    ClipboardCheck,
    BarChart3,
    LogOut,
} from "lucide-react";

const TEACHER_NAV = [
    { to: "/teacher", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/teacher/upload", label: "Upload", icon: Upload },
    { to: "/teacher/results", label: "Results", icon: ClipboardCheck },
    { to: "/teacher/analytics", label: "Analytics", icon: BarChart3 },
];
const STUDENT_NAV = [
    { to: "/student", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/student/results", label: "My Results", icon: ClipboardCheck },
    { to: "/student/analytics", label: "Analytics", icon: BarChart3 },
];

export const Sidebar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const items = user?.role === "teacher" ? TEACHER_NAV : STUDENT_NAV;

    const onLogout = () => {
        logout();
        navigate("/");
    };

    return (
        <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-background px-4 py-6">
            <div className="mb-10 px-2">
                <BrandMark />
            </div>
            <nav className="flex flex-1 flex-col gap-1">
                {items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                        key={label}
                        to={to}
                        end={end}
                        data-testid={`sidebar-${label.toLowerCase().replace(/\s+/g, "-")}`}
                        className={({ isActive }) =>
                            `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                                isActive
                                    ? "bg-primary/15 text-primary teal-glow-sm"
                                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                            }`
                        }
                    >
                        <Icon className="h-5 w-5" strokeWidth={1.75} />
                        {label}
                    </NavLink>
                ))}
            </nav>
            <div className="mt-auto">
                <div className="mb-3 rounded-xl border border-border bg-card px-4 py-3">
                    <div className="truncate text-sm font-semibold">{user?.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                        {user?.role === "student" ? `Roll · ${user?.roll_no}` : "Teacher"}
                    </div>
                </div>
                <button
                    data-testid="sidebar-logout"
                    onClick={onLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                    <LogOut className="h-5 w-5" strokeWidth={1.75} />
                    Logout
                </button>
            </div>
        </aside>
    );
};
