import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Users, Star, Code2 } from "lucide-react";
import Button from "../components/ui/Button";
import useAuth from "../hooks/useAuth";

const features = [
  { icon: Code2, title: "Showcase Your Work", desc: "Build a beautiful portfolio of your projects, complete with GitHub repositories, live demo links, and tech stacks." },
  { icon: Star, title: "Get Code Reviews", desc: "Receive construction reviews and ratings from other senior developers in the community to polish your code." },
  { icon: Users, title: "Find Collaborators & Hire", desc: "Discover other developers with complementary skills to build products together or find recruitment opportunities." },
];

export default function Home() {
  const { isLoggedIn } = useAuth();

  return (
    <div className="mx-auto max-w-5xl">
      <section className="animate-fade-in py-12 text-center sm:py-20">
        <span className="badge badge-brand mx-auto mb-5">
          <Sparkles className="h-3.5 w-3.5" />
          The Developer Collaboration & Portfolio Hub
        </span>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Build together. Learn together. Grow <span className="text-gradient">bigger</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-muted">
          DevCollab is a modern space for developers to showcase their projects, request code feedback,
          and find talented partners to co-create amazing digital products.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {isLoggedIn ? (
            <div className="flex gap-4">
              <Link to="/projects">
                <Button size="lg">
                  Explore Projects
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/create">
                <Button variant="secondary" size="lg">
                  Share Your Project
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <Link to="/register">
                <Button size="lg">
                  Get started
                  <Sparkles className="h-4 w-4" />
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
