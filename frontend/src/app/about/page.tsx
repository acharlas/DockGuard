

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <section className="rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-6 shadow-none sm:rounded-[30px] sm:p-8 sm:shadow-[0_18px_48px_rgba(120,53,15,0.08)]">
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--dockguard-ink)] sm:text-3xl">
          About DockGuard
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-[color:var(--dockguard-muted)] sm:text-base sm:leading-relaxed">
          DockGuard is a container image analysis dashboard. Paste any Docker
          image reference — <code className="rounded-md bg-[color:var(--dockguard-panel)] px-1.5 py-0.5 font-mono text-xs">nginx:latest</code>{" "}
          — and get an instant security audit via{" "}
          <a
            href="https://trivy.dev"
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--dockguard-accent)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
          >
            Trivy
          </a>{" "}
          alongside a build efficiency report from{" "}
          <a
            href="https://github.com/wagoodman/dive"
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--dockguard-accent)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
          >
            Dive
          </a>.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[16px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] p-4 sm:p-5">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--dockguard-accent-soft)]">
              <svg
                className="h-4 w-4 text-[color:var(--dockguard-accent)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h2 className="mt-3 text-sm font-semibold text-[color:var(--dockguard-ink)]">
              Security Lens
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--dockguard-muted)]">
              Scans every OS package and language dependency against the Trivy
              vulnerability database. Surfaces CVEs with severity levels and
              remediation guidance.
            </p>
          </div>

          <div className="rounded-[16px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] p-4 sm:p-5">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--dockguard-accent-soft)]">
              <svg
                className="h-4 w-4 text-[color:var(--dockguard-accent)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <path d="M8 21h8" />
                <path d="M12 17v4" />
              </svg>
            </div>
            <h2 className="mt-3 text-sm font-semibold text-[color:var(--dockguard-ink)]">
              Build Lens
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--dockguard-muted)]">
              Analyzes each image layer with Dive. Shows wasted space,
              inefficient layer ordering, and duplication between layers to help
              slim down your images.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[16px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[color:var(--dockguard-ink)]">
            Stack
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {["FastAPI", "Next.js 14", "PostgreSQL", "Redis", "Docker", "Prometheus", "Grafana"].map(
              (tech) => (
                <span
                  key={tech}
                  className="rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] px-3 py-1 text-xs font-medium text-[color:var(--dockguard-muted)]"
                >
                  {tech}
                </span>
              )
            )}
          </div>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-[color:var(--dockguard-muted)] sm:text-sm">
          Part of the{" "}
          <a
            href="https://github.com/acharlas"
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--dockguard-accent)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
          >
            acharlas
          </a>{" "}
          portfolio. View the source on{" "}
          <a
            href="https://github.com/acharlas/DockGuard"
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--dockguard-accent)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
          >
            GitHub
          </a>.
        </p>
      </section>
    </div>
  );
}
