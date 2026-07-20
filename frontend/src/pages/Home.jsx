import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, BookOpen, Users, PenLine } from "lucide-react";
import Button from "../components/ui/Button";
import useAuth from "../hooks/useAuth";

const features = [
  { icon: Sparkles, title: "Write with focus", desc: "A clean editor that gets out of your way so the words flow." },
  { icon: BookOpen, title: "Publish beautifully", desc: "Your posts render in a refined, reading-first layout." },
  { icon: Users, title: "Build a community", desc: "Threaded comments and reactions keep the conversation going." },
];

export default function Home() {
  const { isLoggedIn } = useAuth();

  return (
    <div className="mx-auto max-w-5xl">
      <section className="animate-fade-in py-12 text-center sm:py-20">
        <span className="badge badge-brand mx-auto mb-5">
          <Sparkles className="h-3.5 w-3.5" />
          A modern home for your writing
        </span>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Stories worth sharing, made <span className="text-gradient">simple</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-muted">
          Inkwell is a calm, focused space to publish blogs, grow an audience,
          and connect through thoughtful discussion.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {isLoggedIn ? (
            <Link to="/blogs">
              <Button size="lg">
                Explore blogs
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/register">
                <Button size="lg">
                  Get started
                  <PenLine className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" size="lg">Sign in</Button>
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-5 pb-8 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card card-hover p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand-soft">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            <p className="mt-1.5 text-sm text-ink-muted">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
