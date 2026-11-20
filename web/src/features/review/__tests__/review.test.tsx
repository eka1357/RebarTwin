import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ToCheckItem } from "../../../lib/api";
import { sortToCheckQueue, validateCalloutGrammar } from "../../../lib/calloutGrammar";
import { ReviewRoute } from "../../../routes/ReviewRoute";

describe("W9 To Check & Callout Grammar", () => {
  it("validates Indian bar, section, link, cover, zone, and exposure callouts", () => {
    expect(validateCalloutGrammar("top", "5-20")).toMatchObject({ valid: true, normalized: "5-20" });
    expect(validateCalloutGrammar("top", "2-25 + 1-20")).toMatchObject({
      valid: true,
      normalized: "2-25 + 1-20",
    });
    expect(validateCalloutGrammar("main", "8-16")).toMatchObject({ valid: true, normalized: "8-16" });
    expect(validateCalloutGrammar("main", "4-16 + 4-12")).toMatchObject({
      valid: true,
      normalized: "4-16 + 4-12",
    });
    expect(validateCalloutGrammar("main", "3-16 + 5-12").valid).toBe(false);
    expect(validateCalloutGrammar("main", "5-16").valid).toBe(false);
    expect(validateCalloutGrammar("section", "230x450")).toMatchObject({
      valid: true,
      normalized: "230x450",
    });
    expect(validateCalloutGrammar("links", "2L-8@100")).toMatchObject({
      valid: true,
      normalized: "2L-8@100",
    });
    expect(validateCalloutGrammar("seismic_zone", "zone III")).toMatchObject({
      valid: true,
      normalized: "III",
    });
    expect(validateCalloutGrammar("seismic_zone", "zone X").valid).toBe(false);
    expect(validateCalloutGrammar("exposure", "Moderate")).toMatchObject({
      valid: true,
      normalized: "moderate",
    });
  });

  it("places unresolved project-level items first before joint items", () => {
    const sample: ToCheckItem[] = [
      {
        id: "tc_nonblock",
        joint: null,
        member: "PC1",
        field: "section",
        layer: 1,
        level: "FOUNDATION",
        page: 7,
        box_2d: [58, 552, 70, 558],
        gemini: { value: "200x200" },
        parser: { value: "200x200" },
        reason: "ambiguous",
        detail: "PC1 does not belong to any joint",
        resolution: null,
        blocks_joint: false,
      },
      {
        id: "tc_1",
        joint: "C4xB12@FIRST",
        member: "B12",
        field: "top",
        layer: 1,
        level: "FIRST FLOOR",
        page: 2,
        box_2d: [100, 100, 200, 200],
        gemini: { value: "5-25" },
        parser: { value: "5-20" },
        reason: "disagree",
        detail: "Gemini read 5-25, parser read 5-20",
        resolution: null,
      },
      {
        id: "tc_zone",
        joint: null,
        member: "ALL",
        field: "seismic_zone",
        layer: 1,
        level: null,
        page: 0,
        box_2d: null,
        gemini: null,
        parser: null,
        reason: "missing",
        detail: "Zone missing",
        resolution: null,
      },
    ];

    const sorted = sortToCheckQueue(sample);
    expect(sorted[0].id).toBe("tc_zone");
    expect(sorted[0].project_level).toBe(true);
    expect(sorted[0].blocks_joint).toBe(true);
    expect(sorted[1].id).toBe("tc_1");
    expect(sorted[1].project_level).toBe(false);
    expect(sorted[1].blocks_joint).toBe(true);
    expect(sorted[2].id).toBe("tc_nonblock");
    expect(sorted[2].blocks_joint).toBe(false);
  });

  it("supports keys 1, 2, E (validated), S, J/K and unlocks joint via API", async () => {
    const queue: ToCheckItem[] = [
      {
        id: "tc_zone",
        joint: null,
        member: "ALL",
        field: "seismic_zone",
        layer: 1,
        level: null,
        page: 0,
        box_2d: null,
        gemini: null,
        parser: null,
        reason: "missing",
        detail: "Drawing does not state seismic zone.",
        resolution: null,
      },
      {
        id: "tc_top",
        joint: "C4xB12@FIRST",
        member: "B12",
        field: "top",
        layer: 1,
        level: "FIRST FLOOR",
        page: 1,
        box_2d: [150, 200, 190, 280],
        gemini: { value: "5-25" },
        parser: { value: "5-20" },
        reason: "disagree",
        detail: "Gemini read 5-25, text layer says 5-20.",
        resolution: null,
      },
    ];

    const resolveCalls: Array<{ id: string; value: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/to-check")) {
        return new Response(JSON.stringify(queue.map((x) => ({ ...x }))), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/to-check/") && url.endsWith("/resolve")) {
        const parts = url.split("/");
        const itemId = decodeURIComponent(parts[parts.length - 2]);
        const body = JSON.parse(String(init?.body)) as { value: string };
        resolveCalls.push({ id: itemId, value: body.value });
        const found = queue.find((x) => x.id === itemId);
        if (found) {
          found.resolution = { value: body.value, by: "person", at: "2026-11-17T22:00:00Z" };
        }
        return new Response(
          JSON.stringify({
            item: found,
            resolved_value: body.value,
            unlocked_joints: itemId === "tc_top" ? ["C4xB12@FIRST"] : [],
            checked_joints: itemId === "tc_top" ? ["C4xB12@FIRST"] : [],
            remaining_to_check: queue.filter((x) => !x.resolution).length,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/projects/live-1")) {
        return new Response(
          JSON.stringify({
            id: "live-1",
            name: "Live 1",
            status: "done",
            sheets: [{ page: 1 }],
            joints: [
              {
                id: "C4xB12@FIRST",
                column: { id: "C4", b: 300, h: 300 },
                beams: [{ id: "B12", b: 230, D: 450 }],
                status: queue.every((x) => x.resolution) ? "fail" : "to_check",
                fail_count: 6,
                blocked_count: queue.filter((x) => !x.resolution).length,
                bundle_ready: queue.every((x) => x.resolution),
              },
            ],
            to_check_counts: {
              total: 2,
              unresolved: queue.filter((x) => !x.resolution).length,
              project_level_unresolved: 0,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/projects/live-1/review"]}>
          <Routes>
            <Route path="/projects/:id/review" element={<ReviewRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Blocks all joints")).toBeInTheDocument();

    // Key J skips to item 2 (tc_top); pressing 1 while a button has focus must NOT resolve
    fireEvent.keyDown(window, { key: "j" });
    const editBtn = screen.getAllByRole("button", { name: /Type value \(E\)/i })[1];
    editBtn.focus();
    fireEvent.keyDown(editBtn, { key: "1" });
    expect(resolveCalls).toEqual([]);

    // Key 2 on window accepts Parser ("5-20")
    fireEvent.keyDown(window, { key: "2" });

    await screen.findByText(/Confirmed: 5-20/i);
    expect(resolveCalls[0]).toEqual({ id: "tc_top", value: "5-20" });

    // On tc_zone, press E to edit, reject invalid Zone X, accept III -> unlocks joint!
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "e" });
    const input = await screen.findByLabelText(/Confirmed value \(seismic_zone\)/i);
    fireEvent.change(input, { target: { value: "Zone X" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText(/Enter seismic zone II, III, IV, or V/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "III" } });
    fireEvent.submit(input.closest("form")!);

    expect(
      await screen.findByRole("link", { name: /Inspect C4xB12@FIRST/i }),
    ).toHaveAttribute("href", "/projects/live-1/joints/C4xB12%40FIRST");

    vi.unstubAllGlobals();
  });

  it("displays non-main building next to member and prevents clearing unsupported items", async () => {
    const queue: ToCheckItem[] = [
      {
        id: "tc_inv",
        joint: "C1xYB16@FIRST@A-1",
        member: "YB16",
        field: "beams[0].section",
        layer: 1,
        level: "FIRST",
        page: 18,
        box_2d: [100, 100, 120, 200],
        gemini: { value: "200x600-inv" },
        parser: { value: "200x600-inv" },
        reason: "unsupported",
        detail: "not checked: inverted beam (not modelled yet) (YB16 200x600-inv)",
        resolution: null,
        blocks_joint: true,
      },
      {
        id: "tc_sq",
        joint: null,
        member: "C1",
        building: "SERVANT QUARTER",
        field: "section",
        layer: 1,
        level: "FOUNDATION TO GROUND ROOF",
        page: 9,
        box_2d: [100, 100, 120, 200],
        gemini: { value: "200x500" },
        parser: { value: "200x500" },
        reason: "ambiguous",
        detail: "Servant quarter column C1 item",
        resolution: null,
        blocks_joint: false,
      },
    ];

    const resolveCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/to-check")) {
        return new Response(JSON.stringify(queue), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/resolve")) {
        resolveCalls.push(url);
        return new Response("Conflict", { status: 409 });
      }
      if (url.endsWith("/projects/live-inv")) {
        return new Response(
          JSON.stringify({
            id: "live-inv",
            name: "Live Inv",
            status: "done",
            sheets: [{ page: 18 }, { page: 9 }],
            joints: [],
            to_check_counts: { total: 2, unresolved: 2, project_level_unresolved: 0 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/projects/live-inv/review"]}>
          <Routes>
            <Route path="/projects/:id/review" element={<ReviewRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(/Not modelled yet; cannot be cleared in To check\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/C1 \(SERVANT QUARTER\) · section/i)).toBeInTheDocument();

    // Keyboard shortcuts 1, 2, E on the active unsupported card must not resolve or open edit form
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.keyDown(window, { key: "e" });
    expect(resolveCalls).toEqual([]);
    expect(screen.queryByLabelText(/Confirmed value/i)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
