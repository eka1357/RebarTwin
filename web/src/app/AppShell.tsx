import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { CommandPalette } from "./CommandPalette";
import { ShortcutDialog } from "./ShortcutDialog";
import { TopBar } from "./TopBar";

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "RebarTwin — 3D Beam-Column Joint Checker"],
  [/^\/demo/, "Worked Example Demo — RebarTwin"],
  [/\/upload$/, "Upload Drawings — RebarTwin"],
  [/\/review$/, "To Check Queue — RebarTwin"],
  [/\/joints\//, "Joint Workspace — RebarTwin"],
  [/\/report$/, "Joint Report — RebarTwin"],
  [/^\/projects\//, "Project Overview — RebarTwin"],
  [/^\/styleguide/, "Styleguide — RebarTwin"],
];

export function AppShell() {
  const { pathname } = useLocation();
  const isWorkspace = pathname === "/demo" || pathname.includes("/joints/");

  useEffect(() => {
    const match = TITLES.find(([re]) => re.test(pathname));
    document.title = match ? match[1] : "RebarTwin";
  }, [pathname]);

  return (
    <div
      className={`flex min-h-dvh flex-col bg-background text-foreground ${
        isWorkspace ? "lg:h-dvh lg:overflow-hidden" : ""
      }`}
    >
      <nav
        aria-label="Skip links"
        className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-2 focus-within:left-2 focus-within:z-50 focus-within:flex focus-within:gap-2"
      >
        <a
          href="#main-content"
          className="rounded-[var(--radius-sm)] border border-control-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-[var(--shadow-overlay)]"
        >
          Skip to content
        </a>
        {isWorkspace && (
          <a
            href="#inspector"
            className="rounded-[var(--radius-sm)] border border-control-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-[var(--shadow-overlay)]"
          >
            Skip to inspector
          </a>
        )}
      </nav>

      <TopBar />

      <div
        id="main-content"
        className={`flex flex-1 flex-col min-h-0 ${isWorkspace ? "lg:overflow-hidden" : ""}`}
      >
        <Outlet />
      </div>

      <CommandPalette />
      <ShortcutDialog />
    </div>
  );
}
