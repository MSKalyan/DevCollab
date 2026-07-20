import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../api/api";
import { FullPageLoader } from "./ui/Spinner";

export default function AdminRoute({ children }) {
  const [status, setStatus] = useState("loading"); // loading | ok | denied

  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => {
        if (res.data?.role === "admin") setStatus("ok");
        else setStatus("denied");
      })
      .catch(() => setStatus("denied"));
  }, []);

  if (status === "loading") return <FullPageLoader label="Checking access…" />;
  if (status === "denied") return <Navigate to="/" replace />;

  return children;
}
