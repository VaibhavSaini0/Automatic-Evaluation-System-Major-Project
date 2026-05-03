import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Toaster } from "./components/ui/sonner";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherUpload from "./pages/TeacherUpload";
import ResultsList from "./pages/ResultsList";
import StudentDashboard from "./pages/StudentDashboard";
import EvaluationDetail from "./pages/EvaluationDetail";
import Analytics from "./pages/Analytics";

const HomeSwitch = () => {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (user) return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
    return <Landing />;
};

export default function App() {
    return (
        <div className="App">
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<HomeSwitch />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />

                        <Route
                            path="/teacher"
                            element={
                                <ProtectedRoute role="teacher">
                                    <TeacherDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/teacher/upload"
                            element={
                                <ProtectedRoute role="teacher">
                                    <TeacherUpload />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/teacher/results"
                            element={
                                <ProtectedRoute role="teacher">
                                    <ResultsList />
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="/student"
                            element={
                                <ProtectedRoute role="student">
                                    <StudentDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/student/results"
                            element={
                                <ProtectedRoute role="student">
                                    <ResultsList />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/teacher/analytics"
                            element={
                                <ProtectedRoute role="teacher">
                                    <Analytics />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/student/analytics"
                            element={
                                <ProtectedRoute role="student">
                                    <Analytics />
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="/evaluation/:id"
                            element={
                                <ProtectedRoute>
                                    <EvaluationDetail />
                                </ProtectedRoute>
                            }
                        />

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    <Toaster
                        position="top-right"
                        theme="dark"
                        toastOptions={{
                            className: "!rounded-xl !border !border-border !bg-card !text-sm",
                        }}
                    />
                </BrowserRouter>
            </AuthProvider>
        </div>
    );
}
