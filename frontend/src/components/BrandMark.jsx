import { Link } from "react-router-dom";
import { Brain } from "lucide-react";

export const BrandMark = ({ compact = false }) => (
    <Link to="/" data-testid="brand-link" className="inline-flex items-center gap-2">
        <Brain className="h-7 w-7 text-primary" strokeWidth={1.75} />
        {!compact && (
            <span className="text-xl font-bold tracking-tight text-primary">AES</span>
        )}
    </Link>
);
