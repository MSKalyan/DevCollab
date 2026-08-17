import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, Search, LogOut, ShieldCheck } from "lucide-react";
import Logo from "./ui/Logo";
import Button from "./ui/Button";
import NotificationsDropdown from "./NotificationsDropdown";
import useAuth from "../hooks/useAuth";

function Navbar({ toggleSidebar }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { user, isLoggedIn, role, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const query = search.trim();
    navigate(query ? `/projects?search=${encodeURIComponent(query)}` : "/projects");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line glass">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <button
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              className="rounded-lg p-2 text-ink-muted transition hover:bg-surface-2 hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Logo />
        </div>

        {isLoggedIn && (
          <form className="relative hidden flex-1 max-w-md md:block" onSubmit={handleSearch}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              placeholder="Search projects, tags, developers…"
              aria-label="Search projects, tags, or developers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field pl-9"
            />
          </form>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {isLoggedIn ? (
            <>
              <NotificationsDropdown />

              {role === "admin" && (
                <Link to="/admin">
                  <Button variant="outline" size="md">
                    <ShieldCheck className="h-4 w-4" />
                    Admin
                  </Button>
                </Link>
              )}

              <div className="hidden items-center gap-2.5 rounded-lg border border-line bg-surface py-1 pl-1 pr-3 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-merge/15 font-mono text-sm font-semibold text-merge">
                  {user?.name?.charAt(0)?.toUpperCase() || "U"}
                </span>
                <span className="text-sm font-medium text-ink">{user?.name}</span>
              </div>

              <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Logout">
                <LogOut className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost">Login</Button>
              </Link>
              <Link to="/register">
                <Button>Get started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
