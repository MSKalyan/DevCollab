import React from "react";
import { NavLink } from "react-router-dom";
import { Home, BookOpen, User, PenLine, X } from "lucide-react";
import Logo from "./ui/Logo";
import useAuth from "../hooks/useAuth";

const links = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/myblogs", label: "My Blogs", icon: BookOpen },
  { to: "/editprofile", label: "Profile", icon: User },
  { to: "/create", label: "New Blog", icon: PenLine },
];

function Sidebar({ open, onClose }) {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-bg-soft pt-16 transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-5 py-4 lg:hidden">
          <Logo />
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Menu
          </p>
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                ["nav-link", isActive ? "nav-link-active" : ""].join(" ")
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-4">
          <p className="text-xs text-ink-muted">Inkwell · Share your stories</p>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
