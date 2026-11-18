import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("Upload -> To check -> Joint workflow W8/W9", () => {
  test("uploads PDF via SSE, resolves project-level then joint item, opens C4xB12@FIRST with provenance", async ({
    page,
  }) => {
    const demoZone3Path = path.resolve("public/demo/C4xB12-zone3/bundle.json");
    const baseBundle = JSON.parse(fs.readFileSync(demoZone3Path, "utf8")) as Record<string, unknown>;
    const provBundle = {
      ...baseBundle,
      joint: { ...(baseBundle.joint as object), id: "C4xB12@FIRST" },
      pages: { "1": "pages/page-1.png" },
      provenance: [
        {
          path: "column.main",
          member: "C4",
          field: "main",
          layer: null,
          level: "FOUNDATION TO FIRST FLOOR",
          page: 1,
          box_2d: [120, 180, 175, 290],
          text: "8-16",
          gemini: "8-16",
          parser: "8-16",
          status: "agreed",
          ocr_raw: "4016",
          page_image: "pages/page-1.png",
        },
        {
          path: "settings.aggregate",
          member: null,
          field: null,
          layer: null,
          level: null,
          page: null,
          box_2d: null,
          text: null,
          gemini: null,
          parser: "20 mm",
          status: "default",
          ocr_raw: null,
          page_image: null,
        },
      ],
    };

    const queue = [
      {
        id: "tc_proj_zone",
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
        detail: "The drawing does not state the seismic zone.",
        resolution: null,
        project_level: true,
        resolved: false,
      },
      {
        id: "tc_b12_top",
        joint: "C4xB12@FIRST",
        member: "B12",
        field: "top",
        layer: 1,
        level: "FIRST FLOOR",
        page: 1,
        box_2d: [200, 300, 260, 420],
        gemini: { value: "5-25" },
        parser: { value: "5-20" },
        reason: "disagree",
        detail: "Gemini read 5-25, text layer says 5-20.",
        resolution: null,
        project_level: false,
        resolved: false,
      },
    ];

    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
      "base64",
    );

    let encodedJointFetched = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("C4xB12%40FIRST")) {
        encodedJointFetched = true;
      }
      const p = decodeURIComponent(url.pathname.replace(/^\/api/, ""));
      const method = route.request().method();

      if (p === "/projects" && method === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "live-e2e", name: "Live E2E", status: "idle" }),
        });
      }
      if (p.endsWith("/drawings") && method === "POST") {
        return route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ project_id: "live-e2e", pdf: "set.pdf", status: "reading" }),
        });
      }
      if (p.endsWith("/events")) {
        const sseBody = [
          'event: page_started\ndata: {"page":1,"total":1,"needs_ocr":false}\n\n',
          'event: page_read\ndata: {"page":1,"total":1,"agreed":18,"to_check":2,"unassigned":0}\n\n',
          'event: done\ndata: {"pages":1,"joints":1,"ready":[],"to_check":2}\n\n',
        ].join("");
        return route.fulfill({ status: 200, contentType: "text/event-stream", body: sseBody });
      }
      if (p === "/projects/live-e2e/to-check") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(queue) });
      }
      if (p.includes("/to-check/") && p.endsWith("/resolve") && method === "POST") {
        const body = route.request().postDataJSON() as { value: string };
        const itemId = decodeURIComponent(p.split("/").slice(-2, -1)[0]);
        const target = queue.find((q) => q.id === itemId);
        if (target) {
          target.resolution = { value: body.value, by: "person", at: "2026-11-17T22:00:00Z" };
        }
        const remaining = queue.filter((q) => !q.resolution).length;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            item: target,
            resolved_value: body.value,
            unlocked_joints: remaining === 0 ? ["C4xB12@FIRST"] : [],
            checked_joints: remaining === 0 ? ["C4xB12@FIRST"] : [],
            remaining_to_check: remaining,
          }),
        });
      }
      if (p === "/projects/live-e2e") {
        const remaining = queue.filter((q) => !q.resolution).length;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "live-e2e",
            name: "Live E2E",
            status: "done",
            sheets: [{ page: 1, words: 320 }],
            joints: [
              {
                id: "C4xB12@FIRST",
                column: { id: "C4", b: 300, h: 300 },
                beams: [{ id: "B12", b: 230, D: 450 }],
                seismic_zone: "III",
                status: remaining > 0 ? "to_check" : "fail",
                fail_count: 7,
                blocked_count: remaining,
                bundle_ready: remaining === 0,
              },
            ],
            to_check_counts: {
              total: queue.length,
              unresolved: remaining,
              project_level_unresolved: queue.filter((q) => !q.resolution && q.project_level).length,
            },
          }),
        });
      }
      if (p === "/projects/live-e2e/joints/C4xB12@FIRST/bundle") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(provBundle),
        });
      }
      if (p.endsWith(".png")) {
        return route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });
      }
      return route.fulfill({ status: 404, body: "Not mocked" });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/projects/live-e2e/upload");

    // Upload fake PDF and wait for ReadingBoard -> Done -> navigate to To check
    const fileInput = page.getByLabel(/Choose structural PDF file/i);
    await fileInput.setInputFiles({
      name: "set.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    });
    await expect(page.getByText(/Page 1: 18 agreed, 2 to check/i).first()).toBeVisible();
    const uploadAxe = await new AxeBuilder({ page }).analyze();
    expect(uploadAxe.violations).toEqual([]);

    await page.getByRole("link", { name: /Review To check \(2\)/i }).click();
    await expect(page).toHaveURL(/\/projects\/live-e2e\/review$/);

    // Project-level item renders first with "Blocks all joints"
    await expect(page.getByText("Blocks all joints")).toBeVisible();
    const reviewAxe = await new AxeBuilder({ page }).analyze();
    expect(reviewAxe.violations).toEqual([]);

    await page.getByRole("button", { name: "Zone III" }).click();
    // Choose Parser ("5-20") on remaining item
    await page.getByRole("radio", { name: /Parser.*5-20/i }).click();

    await page.getByRole("link", { name: /Inspect C4xB12@FIRST/i }).click();
    await expect(page).toHaveURL(/\/projects\/live-e2e\/joints\/C4xB12%40FIRST$/);
    await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();

    // Light theme + Source tab -> real provenance entry + column Storey + OCR raw + default
    await page.getByRole("button", { name: /Switch to light theme/i }).click();
    await page.getByRole("tab", { name: "Source" }).click();
    await expect(page.getByText("Agreed")).toBeVisible();
    await expect(page.getByText("Storey: FOUNDATION TO FIRST FLOOR")).toBeVisible();
    await expect(page.getByText("OCR read '4016'")).toBeVisible();
    await expect(page.getByText("Assumed, not on the drawing")).toBeVisible();

    const lightJointAxe = await new AxeBuilder({ page }).analyze();
    expect(lightJointAxe.violations).toEqual([]);
    expect(encodedJointFetched).toBe(true);

    // 320 px reflow + reduced motion on To check route
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/projects/live-e2e/review");
    await expect(page.getByText(/Every item resolved/i)).toBeVisible();
    const overflowReview = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflowReview).toBe(false);
  });
});
