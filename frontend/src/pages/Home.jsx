import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Users, GitPullRequest, Github, Compass } from "lucide-react";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import useAuth from "../hooks/useAuth";

const features = [
  { icon: Github, title: "GitHub as Source of Truth", desc: "Connect your GitHub account. Your projects, PRs, issues, and reviews become your portfolio — verified, not self-reported." },
  { icon: GitPullRequest, title: "Real Contribution Proof", desc: "Skills and contribution history are derived from your merged PRs and reviews on GitHub, so your profile is legit and skill-proof." },
  { icon: Compass, title: "Find Projects to Contribute", desc: "Browse curated open-source projects and get open issues matched to your demonstrated skills, so you always know where your next PR can go." },
  { icon: Users, title: "Find Open Source Partners", desc: "Discover developers working on open source, send a contact request, and chat once they accept to collaborate together." },
];

export default function Home() {
  const { isLoggedIn } = useAuth();

  return (
    <PageShell className="mx-auto max-w-5xl">
      <section className="animate-fade-in py-8 text-center sm:py-14">
        <p className="eyebrow mb-4 flex items-center justify-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          open source contribution &amp; developer collaboration hub
        </p>
        <h1 className="display mx-auto max-w-3xl text-[length:var(--step-4)]">
          Prove your skills with real{" "}
          <span className="text-gradient">GitHub contributions</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-soft">
          DevCollab connects your GitHub to your developer profile. Show the open
          source work you've actually done, find projects worth contributing to,
          and connect with other developers to build together.
        </p>

        {/* Signature: evidence readout — real data in terminal form */}
        <div className="mx-auto mt-8 inline-flex max-w-full flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-lg border border-line bg-bg-soft px-5 py-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-muted">
          <span>repos <b className="text-merge">from GitHub</b></span>
          <span className="hidden text-line sm:inline" aria-hidden="true">│</span>
          <span>skills <b className="text-merge">evidence-based</b></span>
          <span className="hidden text-line sm:inline" aria-hidden="true">│</span>
          <span>PRs <b className="text-merge">merged</b></span>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {isLoggedIn ? (
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/github">
                <Button size="lg">
                  Connect GitHub
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/projects">
                <Button variant="secondary" size="lg">
                  Explore Projects
                </Button>
              </Link>
              <Link to="/developers">
                <Button variant="secondary" size="lg">
                  Find Developers
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

      <section className="grid gap-5 pb-8 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="surface surface-hover p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-merge/10 text-merge">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            <p className="mt-1.5 text-sm text-ink-muted">{desc}</p>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
