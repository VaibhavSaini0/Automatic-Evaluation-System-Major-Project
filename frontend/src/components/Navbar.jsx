import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";

export const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const handleLogout = () => {
        logout();
        navigate("/");
    };

    return (
        <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                <BrandMark />
                <nav className="flex items-center gap-3">
                    {!user && (
                        <>
                            <Link
                                to="/login"
                                data-testid="nav-login-link"
                                className="font-mono-brand text-sm uppercase tracking-widest hover:text-primary"
                            >
                                Login
                            </Link>
                            <Button
                                data-testid="nav-register-btn"
                                onClick={() => navigate("/register")}
                                className="rounded-none border-2 border-foreground bg-primary px-5 text-primary-foreground brutal-shadow-sm hover:bg-primary"
                            >
                                Get Started
                            </Button>
                        </>
                    )}
                    {user && (
                        <>
                            <Link
                                to={user.role === "teacher" ? "/teacher" : "/student"}
                                data-testid="nav-dashboard-link"
                                className="font-mono-brand text-sm uppercase tracking-widest hover:text-primary"
                            >
                                Dashboard
                            </Link>
                            <span className="hidden font-mono-brand text-xs uppercase tracking-widest text-muted-foreground md:inline">
                                {user.role} · {user.name}
                            </span>
                            <Button
                                variant="outline"
                                data-testid="nav-logout-btn"
                                onClick={handleLogout}
                                className="rounded-none border-2 border-foreground bg-transparent"
                            >
                                <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
                                Logout
                            </Button>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
};
