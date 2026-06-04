"use client";

import { Component } from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[color:var(--dockguard-bg)]">
          <div className="rounded-[24px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] px-8 py-10 text-center sm:rounded-[30px] sm:px-12">
            <h2 className="text-xl font-semibold text-[color:var(--dockguard-ink)]">
              Something went wrong
            </h2>
            <p className="mt-3 text-sm text-[color:var(--dockguard-muted)]">
              An unexpected error occurred. Try refreshing the page.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
