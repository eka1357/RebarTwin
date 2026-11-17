import { HelpCircle, Menu, Moon, Search, Sun } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router";
import { Button } from "../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { StatusIsland } from "./StatusIsland";

const NAV_LINKS = [
  { label: "Demo", to: "/demo" },
  { label: "Project", to: "/projects/c4-b12" },
  { label: "Upload", to: "/projects/c4-b12/upload" },
  { label: "To check", to: "/projects/c4-b12/review" },
  { label: "Joint", to: "/projects/c4-b12/joints/C4xB12" },
  { label: "Report", to: "/projects/c4-b12/report" },
  { label: "Styleguide", to: "/styleguide" },
];

export function TopBar() {
  const [navOpen, setNavOpen] = useState(false);
  const theme = useWorkspaceStore((s) => s.theme);
  const toggleTheme = useWorkspaceStore((s) => s.toggleTheme);
  const setCommandOpen = useWorkspaceStore((s) => s.setCommandOpen);
  const setShortcutsOpen = useWorkspaceStore((s) => s.setShortcutsOpen);

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 text-foreground hover:opacity-90"
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-signal font-display text-xs font-bold text-primary-foreground">
            RT
          </span>
          <span className="font-display text-sm font-semibold tracking-tight">RebarTwin</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
          {NAV_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-7 items-center rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--dur-1)]",
                  isActive
                    ? "bg-surface-raised text-foreground"
                    : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden md:block">
          <StatusIsland />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCommandOpen(true)}
              className="h-8 min-w-8 px-2"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Open command palette</span>
              <span
                aria-hidden="true"
                className="hidden sm:inline font-num text-xs text-muted-foreground"
              >
                Ctrl+K
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Command palette (Ctrl or Cmd + K)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
              className="h-8 w-8"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              className="h-8 w-8"
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Switch to {theme === "dark" ? "light" : "dark"} theme</TooltipContent>
        </Tooltip>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open navigation menu"
              className="h-8 w-8 lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetTitle>RebarTwin</SheetTitle>
            <SheetDescription>Navigate workspace routes and views.</SheetDescription>
            <nav aria-label="Mobile navigation" className="mt-2 flex flex-col gap-1">
              <NavLink
                to="/"
                onClick={() => setNavOpen(false)}
                className="inline-flex min-h-9 items-center rounded-[var(--radius-sm)] px-3 text-sm font-medium text-foreground hover:bg-surface-raised"
              >
                Landing
              </NavLink>
              {NAV_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex min-h-9 items-center rounded-[var(--radius-sm)] px-3 text-sm font-medium",
                      isActive
                        ? "bg-surface-raised text-foreground"
                        : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
