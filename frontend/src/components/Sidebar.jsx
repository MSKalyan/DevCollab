import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Compass, Folder, PlusSquare, Users, User, X, Github, MessageSquare } from "lucide-react";
import Logo from "./ui/Logo";
import useAuth from "../hooks/useAuth";

const links = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/github", label: "GitHub Evidence", icon: Github },
  { to: "/projects", label: "Explore Projects", icon: Compass },
  { to: "/myprojects", label: "My Projects", icon: Folder },
  { to: "/create", label: "Share Project", icon: PlusSquare },
  { to: "/developers", label: "Developers", icon: Users },
  { to: "/chats", label: "Chats", icon: MessageSquare },
  { to: "/editprofile", label: "Profile", icon: User },
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

      {/* Desktop: persistent rail */}
      <aside className="hidden w-56 shrink-0 border-r border-line bg-bg-soft/50 lg:block">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
          <nav className="flex flex-col gap-1 px-3 py-6">
            <p className="px-3 pb-2 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              Menu
            </p>
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  ["nav-link", isActive ? "nav-link-active" : ""].join(" ")
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-line-soft px-4 py-4">
            <p className="font-mono text-[0.625rem] uppercase tracking-widest text-ink-muted">
              devcollab · merge-ready
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile: drawer */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-bg-soft pt-14 transition-transform duration-300 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-5 py-3">
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
          <p className="px-3 pb-2 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-ink-muted">
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
          <p className="font-mono text-[0.625rem] uppercase tracking-widest text-ink-muted">
            devcollab · merge-ready
          </p>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
