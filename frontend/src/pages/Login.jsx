// frontend/src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";   // ✅ use centralized api
import {GoogleLogin} from '@react-oauth/google';
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const googleClientId = null; // Google auth temporarily disabled


 const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    const res = await api.post("/auth/login", { email, password });
    navigate("/blogs");
  } catch (err) {
    setError(err.response?.data?.message || "Login failed");
  }
};


  return (
    <div style={{ maxWidth: "400px", margin: "2rem auto" }}>
      <h2>Login</h2>
      {googleClientId && (
        <GoogleLogin
          onSuccess={async (credentialResponse) => {
            try {
              const res = await api.post("/auth/google", {
                credential: credentialResponse.credential,
              });
              navigate("/blogs");
            } catch (err) {
              console.log(err);
              setError("Google login failed");
            }
          }}
          onError={() => {
            setError("Google login failed");
          }}
        />
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </div>

        <button type="submit" style={{ padding: "0.5rem 1rem" }}>
          Login
        </button>

        <br />
        <Link to="/register">
          <u>If not registered, click here</u>
        </Link>
      </form>
    </div>
  );
}

export default Login;
