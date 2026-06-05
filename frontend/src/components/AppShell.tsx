"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteFooter } from "@/components/SiteFooter";

const NAV_ITEMS = [
  { href: "/", label: "Analysis" },
  { href: "/scans", label: "History" },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function PrimaryNavLinks({
  pathname,
  mobile,
  onNavigate,
}: {
  pathname: string;
  mobile: boolean;
  onNavigate?: () => void;
}) {
  const linkClassName = mobile
    ? "block rounded-[20px] border px-4 py-3 text-sm font-medium transition-colors"
    : "flex items-center justify-between rounded-[22px] border px-4 py-3 text-sm font-medium transition-colors";

  return (
    <>
      {NAV_ITEMS.map(({ href, label }) => {
        const active = isActiveRoute(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`${linkClassName} ${
              active
                ? "border-[color:var(--dockguard-accent-border)] bg-[color:var(--dockguard-accent-soft)] text-[color:var(--dockguard-ink)] shadow-[0_10px_30px_var(--dockguard-accent-glow)]"
                : "border-transparent text-[color:var(--dockguard-muted)] hover:border-[color:var(--dockguard-border)] hover:bg-[color:var(--dockguard-panel)] hover:text-[color:var(--dockguard-ink)]"
            }`}
          >
            <span>{label}</span>
            {!mobile && (
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  active
                    ? "bg-[color:var(--dockguard-accent)]"
                    : "bg-stone-300 dark:bg-stone-700"
                }`}
              />
            )}
          </Link>
        );
      })}
    </>
  );
}

function GrafanaNavLink({
  grafanaUrl,
  mobile,
  onNavigate,
}: {
  grafanaUrl: string | null;
  mobile: boolean;
  onNavigate?: () => void;
}) {
  if (!grafanaUrl) {
    return null;
  }

  const linkClassName = mobile
    ? "inline-flex items-center justify-between rounded-[20px] border px-4 py-3 text-sm font-medium transition-colors"
    : "inline-flex items-center justify-between rounded-[22px] border px-4 py-3 text-sm font-medium transition-colors";

  return (
    <a
      href={grafanaUrl}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onNavigate}
      className={`${linkClassName} border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] text-[color:var(--dockguard-muted)] hover:border-[color:var(--dockguard-accent-border)] hover:text-[color:var(--dockguard-ink)]`}
    >
      <span>Grafana</span>
      {!mobile && (
        <span className="text-xs text-[color:var(--dockguard-muted)]">↗</span>
      )}
    </a>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const grafanaUrl = process.env.NEXT_PUBLIC_GRAFANA_URL?.trim() || null;

  return (
    <div className="min-h-screen bg-[color:var(--dockguard-bg)] text-[color:var(--dockguard-ink)]">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:border-r lg:border-[color:var(--dockguard-border)] lg:bg-[color:var(--dockguard-surface)] lg:px-6 lg:py-6">
          <div className="space-y-10">
            <div className="flex items-start justify-between gap-3">
              <Link href="/" className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[color:var(--dockguard-muted)]">
                  App
                </p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--dockguard-ink)]">
                  DockGuard
                </h1>
              </Link>
              <ThemeToggle />
            </div>

            <nav className="space-y-2" aria-label="Primary navigation">
              <PrimaryNavLinks pathname={pathname} mobile={false} />
            </nav>
          </div>
          <GrafanaNavLink grafanaUrl={grafanaUrl} mobile={false} />
        </aside>

        <div className="min-h-screen">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] px-4 py-3 sm:px-6 lg:hidden">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--dockguard-muted)]">
                App
              </p>
              <p className="mt-1 text-lg font-semibold text-[color:var(--dockguard-ink)]">
                DockGuard
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] text-[color:var(--dockguard-muted)] transition-colors hover:text-[color:var(--dockguard-ink)]"
                aria-label="Open navigation"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </div>
          </header>

          {mobileOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-stone-950/45"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              />
              <div className="absolute inset-x-0 top-0 flex h-[66vh] flex-col gap-6 rounded-b-[32px] border-b border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-5 shadow-[0_24px_80px_rgba(23,12,7,0.35)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--dockguard-muted)]">
                      App
                    </p>
                    <p className="mt-2 text-xl font-semibold text-[color:var(--dockguard-ink)]">
                      DockGuard
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] text-[color:var(--dockguard-muted)] transition-colors hover:text-[color:var(--dockguard-ink)]"
                    aria-label="Close navigation"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m18 6-12 12M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <nav className="space-y-2" aria-label="Mobile navigation">
                  <PrimaryNavLinks
                    pathname={pathname}
                    mobile
                    onNavigate={() => setMobileOpen(false)}
                  />
                </nav>
                <div className="mt-auto">
                  <GrafanaNavLink
                    grafanaUrl={grafanaUrl}
                    mobile
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </div>
            </div>
          )}

          <main className="mx-auto w-full  px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
            {children}
          </main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
