import React from "react";
import { Link } from "react-router-dom";
import Button from "../components/ui/Button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand-soft">
        <Compass className="h-8 w-8" />
      </span>
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-soft">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-ink-muted">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <Link to="/" className="mt-6">
        <Button>Back to home</Button>
      </Link>
    </div>
  );
}
