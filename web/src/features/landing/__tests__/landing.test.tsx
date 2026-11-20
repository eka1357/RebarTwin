import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingRoute } from "../../../routes/LandingRoute";
import { ReviewRoute } from "../../../routes/ReviewRoute";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderLanding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LandingRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("W12 Landing and W15 Demo-Only Polish", () => {
  it("renders hero, interactive Before/After preview, walkthrough cards, and adapts to demo_only=true", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", demo_only: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderLanding();

    expect(
      screen.getByRole("heading", { name: /Gemini reads and proposes\. Geometry decides\./i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Inspect IIT Hyderabad joint/i })).toHaveAttribute(
      "href",
      "/demo/iit",
    );
    expect(screen.getByRole("link", { name: /Try the example/i })).toHaveAttribute("href", "/demo");

    // Public demo notice hides Upload drawings CTA once /api/health returns demo_only=true
    expect(await screen.findByText(/Public demo mode is active/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Upload drawings/i })).not.toBeInTheDocument();

    // Interactive Before -> After schematic toggle
    const afterBtn = screen.getByRole("button", { name: /After \(Option #1\)/i });
    expect(screen.getByText(/As drawn: 9 checks fail in 3D/i)).toBeInTheDocument();
    fireEvent.click(afterBtn);
    expect(screen.getByText(/Verified fix: passes without redesign/i)).toBeInTheDocument();
    expect(screen.getByText(/C1 face bars at y = -40, 40 mm/i)).toBeInTheDocument();

    // Screen-reader safe reading sample
    expect(
      screen.getByText(/Resolved reading for C1 main on Page 7: 4-16 corners \+ 4-12 faces/i),
    ).toBeInTheDocument();
  });

  it("renders /projects/iit-demo/review offline without firing failing API calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/projects/iit-demo/review"]}>
          <Routes>
            <Route path="/projects/:id/review" element={<ReviewRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/has no unresolved items right now/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open 3D joint/i })).toHaveAttribute(
      "href",
      "/demo/iit",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
