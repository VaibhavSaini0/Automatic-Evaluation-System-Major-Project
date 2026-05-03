import { Sidebar } from "./Sidebar";

export const DashboardLayout = ({ children }) => (
    <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden px-8 py-10 lg:px-12">{children}</main>
    </div>
);
