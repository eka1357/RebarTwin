import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { DemoRoute } from "../../routes/DemoRoute";
import { LandingRoute } from "../../routes/LandingRoute";
import { NotFoundRoute } from "../../routes/NotFoundRoute";
import { StyleguideRoute } from "../../routes/StyleguideRoute";
import { AppShell } from "../AppShell";
import { Providers } from "../Providers";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <ErrorBoundary>
            <AppShell />
          </ErrorBoundary>
        ),
        children: [
          { index: true, element: <LandingRoute /> },
          { path: "demo", element: <DemoRoute /> },
          { path: "styleguide", element: <StyleguideRoute /> },
          { path: "*", element: <NotFoundRoute /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );

  return render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
}

describe("AppShell W2", () => {
  it("renders skip link, primary navigation, and theme toggle while hiding StatusIsland on landing", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: /Skip to content/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to light theme/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /6 fails, 0 to check/i }),
    ).not.toBeInTheDocument();
  });

  it("exposes skip to inspector link and StatusIsland on workspace route", () => {
    renderAt("/demo");
    expect(screen.getByRole("link", { name: /Skip to inspector/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Worked Example: C4 × B12/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /6 fails, 0 to check/i }),
    ).toBeInTheDocument();
  });

  it("renders a calm 404 NotFoundRoute on unknown paths", () => {
    renderAt("/projects/unknown/typo-path");
    expect(screen.getByRole("heading", { name: /Page not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open IIT 3D joint/i })).toHaveAttribute(
      "href",
      "/demo/iit",
    );
  });
});
