import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import demoBundleRaw from "../../../public/demo/C4xB12/bundle.json";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { WorkspaceUrlSync } from "../../features/workspace/WorkspaceUrlSync";
import { DemoRoute } from "../../routes/DemoRoute";
import { LandingRoute } from "../../routes/LandingRoute";
import { NotFoundRoute } from "../../routes/NotFoundRoute";
import { StyleguideRoute } from "../../routes/StyleguideRoute";
import { useWorkspaceStore } from "../../stores/workspace";
import type { Bundle } from "../../types/bundle";
import { AppShell } from "../AppShell";
import { Providers } from "../Providers";

function Boom(): ReactNode {
  throw new Error("Simulated WebGL crash");
}

function LocationSearchEcho() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc-echo">{`${pathname}${search}`}</div>;
}

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

  it("renders ErrorBoundary fallbacks (page and compact 3D viewport) without white-screening", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fullView = render(
        <MemoryRouter>
          <ErrorBoundary>
            <Boom />
          </ErrorBoundary>
        </MemoryRouter>,
      );
      expect(
        screen.getByRole("heading", { name: /Something went wrong loading this view/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Open IIT 3D joint/i })).toHaveAttribute(
        "href",
        "/demo/iit",
      );
      fullView.unmount();

      render(
        <MemoryRouter>
          <ErrorBoundary compact>
            <Boom />
          </ErrorBoundary>
        </MemoryRouter>,
      );
      expect(
        screen.getByRole("heading", { name: /3D viewport could not render/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry 3D view/i })).toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("resets stale After mode and finding selection when WorkspaceUrlSync mounts on a different joint", () => {
    const c4Bundle = demoBundleRaw as unknown as Bundle;
    const c1Bundle: Bundle = {
      ...c4Bundle,
      joint: {
        ...c4Bundle.joint,
        id: "C1xXB17@FIRST@L1+M+M1-28",
      },
    };

    useWorkspaceStore.setState({
      activeJointKey: null,
      selectedBarId: null,
      hoveredBarId: null,
      selectedFindingIndex: null,
      mode: "before",
      optionIndex: 0,
      replayPlaying: false,
      replayIndex: 0,
    });

    const first = render(
      <MemoryRouter initialEntries={["/demo"]}>
        <WorkspaceUrlSync bundle={c4Bundle} />
      </MemoryRouter>,
    );

    useWorkspaceStore.getState().setMode("after");
    useWorkspaceStore.getState().setOptionIndex(1);
    useWorkspaceStore.getState().selectFinding(2);
    expect(useWorkspaceStore.getState().mode).toBe("after");
    expect(useWorkspaceStore.getState().selectedFindingIndex).toBe(2);

    first.unmount();

    render(
      <MemoryRouter initialEntries={["/demo/iit"]}>
        <WorkspaceUrlSync bundle={c1Bundle} />
        <LocationSearchEcho />
      </MemoryRouter>,
    );

    const state = useWorkspaceStore.getState();
    expect(state.activeJointKey).toBe("C1xXB17@FIRST@L1+M+M1-28|II");
    expect(state.mode).toBe("before");
    expect(state.optionIndex).toBe(0);
    expect(state.selectedFindingIndex).toBeNull();
    expect(screen.getByTestId("loc-echo")).toHaveTextContent("/demo/iit");

    useWorkspaceStore.setState({
      activeJointKey: null,
      selectedBarId: null,
      hoveredBarId: null,
      selectedFindingIndex: null,
      mode: "before",
      optionIndex: 0,
      replayPlaying: false,
      replayIndex: 0,
    });
  });
});
