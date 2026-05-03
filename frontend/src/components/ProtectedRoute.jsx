import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const ProtectedRoute = ({ children, role }) => {
    const { user, loading } = useAuth();
    if (loading)
        return (
            <div
                data-testid="loading-screen"
                className="flex min-h-screen items-center justify-center font-mono-brand text-sm uppercase tracking-widest"
            >
                Loading…
            </div>
        );
    if (!user) return <Navigate to="/login" replace />;
    if (role && user.role !== role)
        return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
    return children;
};
