import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";

function Navbar({ toggleSidebar }) {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState(null);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => {
        setIsLoggedIn(true);
        setRole(res.data.role);
      })
      .catch(() => {
        setIsLoggedIn(false);
        setRole(null);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout failed", err);
    }
    setIsLoggedIn(false);
    setRole(null);
    navigate("/");
  };

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-4">
          {isLoggedIn && (
            <button
              onClick={toggleSidebar}
              className="text-xl font-semibold focus:outline-none"
            >
              ☰
            </button>
          )}

          <Link to="/" className="text-xl font-bold text-gray-800">
            MyBlog
          </Link>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <>
              {/* Search */}
              <input
                type="text"
                placeholder="Search blogs..."
                className="hidden md:block px-4 py-2 rounded-full border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />

              {role === "admin" && (
                <Link
                  to="/admin"
                  className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:bg-green-700"
                >
                  Admin Panel
                </Link>
              )}

              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-gray-700 hover:text-blue-600"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-sm font-medium text-gray-700 hover:text-blue-600"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
