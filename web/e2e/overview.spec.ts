import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buildIitFirstFloorFixture } from "../src/test/fixtures/iitFirstFloor";

test.describe("Project Overview W10", () => {
  test("renders 45-joint IIT first-floor overview from API across dark/light themes, 320 px width, reduced motion, and zero axe violations", async ({
    page,
  }) => {
    const fixture = buildIitFirstFloorFixture();

    await page.route("**/api/projects/iit-first-floor**", async (route) => {
      const url = decodeURIComponent(new URL(route.request().url()).pathname);
      if (url === "/api/projects/iit-first-floor") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture),
        });
      }
      if (url === "/api/projects/iit-first-floor/to-check") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "tc_23_1",
              joint: "C23xB45xB46@FIRST",
              member: "C23",
              field: "section",
              layer: 1,
              level: "FIRST",
              page: 2,
              box_2d: [100, 100, 200, 200],
              gemini: { value: "300x450" },
              parser: { value: "300x400" },
              reason: "disagree",
              detail: "Section disagrees between sheet plan and schedule.",
              resolution: null,
              project_level: false,
              resolved: false,
            },
          ]),
        });
      }
      return route.fulfill({ status: 404, body: "Not mocked" });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/projects/iit-first-floor");

    await expect(page.getByRole("heading", { name: /Joints Overview/i })).toBeVisible();

    // Top counts: 45 found, 36 checked, 14 failing, 9 blocked
    const countsRegion = page.getByRole("region", { name: "Project joint counts" });
    await expect(countsRegion.getByText("45", { exact: true })).toBeVisible();
    await expect(countsRegion.getByText("36", { exact: true })).toBeVisible();
    await expect(countsRegion.getByText("14", { exact: true })).toBeVisible();
    await expect(countsRegion.getByText("9", { exact: true })).toBeVisible();

    // 45 rows ordered failing -> blocked -> passing
    const rows = page.getByRole("list", { name: "Project joints list" }).getByRole("listitem");
    await expect(rows).toHaveCount(45);
    await expect(rows.nth(0)).toContainText(/Fails/i);
    await expect(rows.nth(14)).toContainText(/Blocked by \d+ To check/i);
    await expect(rows.nth(23)).toContainText(/Passes/i);

    // Failures by rule bar chart filters the joints list on click
    const ruleRegion = page.getByRole("region", { name: "Failures by rule" });
    await expect(ruleRegion).toBeVisible();
    await ruleRegion.getByRole("button", { name: /IS 13920 cl\. 7\.1\.1/i }).click();
    const filteredCount = await rows.count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(14);
    await ruleRegion.getByRole("button", { name: /Clear rule filter/i }).click();
    await expect(rows).toHaveCount(45);

    // Beam-on-beam junctions listed cleanly as Information
    const bjRegion = page.getByRole("region", { name: /Beam-on-beam junctions \(4\)/i });
    await expect(bjRegion).toContainText("Information");
    await expect(bjRegion).toContainText("SB1 into B14");
    await expect(bjRegion).toContainText("Grid A/B-3");

    // Dark theme axe clean
    const darkAxe = await new AxeBuilder({ page }).analyze();
    expect(darkAxe.violations).toEqual([]);

    // Switch to light theme and verify axe clean
    await page.getByRole("button", { name: /Switch to light theme/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const lightAxe = await new AxeBuilder({ page }).analyze();
    expect(lightAxe.violations).toEqual([]);

    // Blocked row To check link navigates to joint-filtered To check queue
    await rows.nth(14).getByRole("link", { name: /^To check items for /i }).click();
    await expect(page).toHaveURL(/\/projects\/iit-first-floor\/review\?joint=/);
    await expect(page.getByText(/Showing items blocking joint/i)).toBeVisible();

    // 320 px width + reduced motion reflows with zero horizontal overflow
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/projects/iit-first-floor");
    await expect(page.getByRole("region", { name: "Project joint counts" })).toBeVisible();
    const hasHorizOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizOverflow).toBe(false);
  });

  test("renders blocked draft joints with accepted values, 'not on the drawing yet' for nulls, and blocking items", async ({
    page,
  }) => {
    const fixture = buildIitFirstFloorFixture();
    fixture.id = "iit-drafts";
    fixture.joints = [
      {
        id: "C5xXB8@FIRST@F-14",
        draft: true,
        place: "F-14",
        floor: "FIRST",
        storey: "FOUNDATION TO FIRST FLOOR",
        sheets: [8, 15, 17],
        column: {
          id: "C5",
          section: [{ value: "300x600", field: "section", page: 8 }],
          main: null,
          ties: null,
          cover: null,
        },
        beams: [
          {
            id: "XB8",
            direction: "x",
            section: null,
            top: [{ value: "4-16", field: "top", page: 17 }],
            top_extra_unplaced: false,
            bottom: null,
            stirrups: null,
            cover: null,
            frames_into: [{ value: "C5", field: "frames_into", page: 15, at: "F-14" }],
          },
        ],
        status: "to_check",
        fix_status: null,
        fail_count: 0,
        blocked_count: 2,
        blocking_item_ids: ["tc_draft_col_main", "tc_proj_zone"],
        blocking_items: [
          {
            id: "tc_draft_col_main",
            member: "C5",
            field: "column.main",
            reason: "missing",
            detail: "C5 main steel not agreed",
            page: 8,
            project_level: false,
          },
          {
            id: "tc_proj_zone",
            member: "ALL",
            field: "seismic_zone",
            reason: "missing",
            detail: "Drawing does not state seismic zone",
            page: 0,
            project_level: true,
          },
        ],
        bundle_ready: false,
      },
      ...fixture.joints.filter((j) => j.status === "fail").slice(0, 2),
      ...fixture.joints.filter((j) => j.status === "pass").slice(0, 1),
    ];
    fixture.counts = { found: 4, checked: 3, failing: 2, blocked: 1, passing: 1 };

    await page.route("**/api/projects/iit-drafts**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/projects/iit-drafts");

    const list = page.getByRole("list", { name: "Project joints list" });
    const draftRow = list.locator("> li").nth(2);
    await expect(draftRow).toContainText("C5xXB8@FIRST@F-14");
    await expect(draftRow).toContainText("Draft");
    await expect(draftRow).toContainText("Grid F-14");
    await expect(draftRow).toContainText("300x600");
    await expect(draftRow).toContainText("not on the drawing yet");
    await expect(draftRow).toContainText("C5 main steel not agreed");
    await expect(draftRow.getByRole("link", { name: /^To check items for/i })).toBeVisible();
    await expect(draftRow.getByRole("link", { name: /^Joint /i })).toHaveCount(0);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  });
});
