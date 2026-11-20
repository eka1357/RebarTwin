import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "./ui/button";

interface BoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  compact?: boolean;
}

interface BoundaryState {
  error: Error | null;
}

/**
 * Catches rendering or WebGL failures without unmounting the rest of the workspace.
 */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.props.compact) {
      return (
        <div
          role="alert"
          className="flex h-full min-h-60 flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-6 text-center"
        >
          <AlertTriangle className="h-5 w-5 text-check" aria-hidden="true" />
          <div className="space-y-1 max-w-md">
            <h2 className="font-display text-sm font-semibold text-foreground">
              {this.props.fallbackTitle ?? "3D viewport could not render"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {this.state.error.message || "WebGL or scene geometry encountered an error. Findings, fixes, and source crops remain available in the inspector."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.reset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Retry 3D view</span>
          </Button>
        </div>
      );
    }

    return (
      <main
        role="alert"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6"
      >
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 space-y-4">
          <div className="flex items-center gap-2 text-check">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-lg font-semibold text-foreground">
              {this.props.fallbackTitle ?? "Something went wrong loading this view"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred while rendering this screen."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reload page</span>
            </Button>
            <Button variant="outline" size="sm" asChild onClick={this.reset}>
              <Link to="/demo/iit">Open IIT 3D joint</Link>
            </Button>
            <Button variant="outline" size="sm" asChild onClick={this.reset}>
              <Link to="/demo">Open worked example</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }
}

export function RouteErrorFallback() {
  const err = useRouteError();
  let title = "Could not load this route";
  let detail = "An unexpected error occurred.";

  if (isRouteErrorResponse(err)) {
    title = `${err.status} · ${err.statusText || "Route error"}`;
    detail = typeof err.data === "string" ? err.data : "The requested resource could not be loaded.";
  } else if (err instanceof Error) {
    detail = err.message;
  }

  return (
    <main
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6"
    >
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center gap-2 text-check">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <h1 className="font-display text-lg font-semibold text-foreground">{title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{detail}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link to="/demo/iit">Open IIT 3D joint</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/demo">Worked example</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">Landing</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
