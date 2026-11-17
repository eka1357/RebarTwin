import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AppShell } from "../AppShell";
import { Providers } from "../Providers";
import { DemoRoute } from "../../routes/DemoRoute";
import { LandingRoute } from "../../routes/LandingRoute";
import { StyleguideRoute } from "../../routes/StyleguideRoute";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <LandingRoute /> },
          { path: "demo", element: <DemoRoute /> },
          { path: "styleguide", element: <StyleguideRoute /> },
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
  it("renders skip link, primary navigation, and theme toggle", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: /Skip to content/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to light theme/i })).toBeInTheDocument();
  });

  it("exposes skip to inspector link on workspace route", () => {
    renderAt("/demo");
    expect(screen.getByRole("link", { name: /Skip to inspector/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Worked Example: C4 × B12/i })).toBeInTheDocument();
  });
});
