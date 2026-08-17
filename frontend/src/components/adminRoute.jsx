import React from "react";
import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { FullPageLoader } from "./ui/Spinner";

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader label="Checking access…" />;
  if (user?.role !== "admin") return <Navigate to="/" replace />;

  return children;
}
