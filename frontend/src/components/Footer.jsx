import React from "react";
import { Link } from "react-router-dom";
import { Twitter, Github, Send } from "lucide-react";
import Logo from "./ui/Logo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Explore", to: "/blogs" },
      { label: "Write", to: "/create" },
      { label: "My Blogs", to: "/myblogs" },
      { label: "Profile", to: "/editprofile" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/" },
      { label: "Careers", to: "/" },
      { label: "Blog", to: "/blogs" },
      { label: "Contact", to: "/" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/" },
      { label: "Terms", to: "/" },
      { label: "Security", to: "/" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-bg-soft/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-10">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-ink-muted">
            A calm, modern home for your writing. Publish beautiful stories and
            grow your audience.
          </p>
          <div className="mt-5 flex gap-2">
            {[Twitter, Github, Send].map((Icon, i) => (
              <a
                key={i}
                href="/"
                aria-label="Social link"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted transition hover:border-brand/50 hover:text-brand-soft"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="mb-3 text-sm font-semibold text-ink">{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-ink-muted transition hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line-soft">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-ink-muted sm:flex-row sm:px-6 lg:px-10">
          <p>© {new Date().getFullYear()} Inkwell. All rights reserved.</p>
          <p>Crafted with care · Built for writers</p>
        </div>
      </div>
    </footer>
  );
}
