import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ZONE2_BUNDLE = JSON.parse(
  fs.readFileSync(path.resolve("public/demo/C4xB12/bundle.json"), "utf8"),
) as { fix: { attempts: Array<{ passed: boolean; candidate: { source: string } }> } };
const ZONE2_TOTAL_ATTEMPTS = ZONE2_BUNDLE.fix.attempts.length;
const ZONE2_FIRST_PASS_STEP = ZONE2_BUNDLE.fix.attempts.findIndex((a) => a.passed) + 1;

interface ProjectedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

async function expectJointFitsInsideCanvas(page: Page, vp: { width: number; height: number }) {
  const wrap = page.getByRole("img", { name: /Joint C4xB12:/i });
  await expect(wrap).toBeVisible();
  await expect
    .poll(async () => wrap.getAttribute("data-joint-bounds"), { timeout: 5000 })
    .not.toBeNull();

  const canvas = wrap.locator("canvas");
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  await expect
    .poll(
      async () => {
        const attr = await wrap.getAttribute("data-joint-bounds");
        if (!attr) return false;
        const b = JSON.parse(attr) as ProjectedBounds;
        const box = await canvas.boundingBox();
        if (!box) return false;
        return Math.abs(b.width - box.width) <= 2 && Math.abs(b.height - box.height) <= 2;
      },
      { timeout: 5000 },
    )
    .toBe(true);

  const latestBox = await canvas.boundingBox();
  expect(latestBox).not.toBeNull();
  expect(latestBox!.x).toBeGreaterThanOrEqual(-1);
  expect(latestBox!.y).toBeGreaterThanOrEqual(0);
  expect(latestBox!.x + latestBox!.width).toBeLessThanOrEqual(vp.width + 1);
  if (vp.width >= 1024) {
    expect(latestBox!.y + latestBox!.height).toBeLessThanOrEqual(vp.height + 1);
  }

  const raw = await wrap.getAttribute("data-joint-bounds");
  const bounds = JSON.parse(raw!) as ProjectedBounds;
  expect(bounds.width).toBeGreaterThan(100);
  expect(bounds.height).toBeGreaterThan(100);
  expect(bounds.minX).toBeGreaterThanOrEqual(0);
  expect(bounds.minY).toBeGreaterThanOrEqual(0);
  expect(bounds.maxX).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.maxY).toBeLessThanOrEqual(bounds.height + 1);
}

test.describe("Demo 3D Scene W3", () => {
  test("fits joint inside window without page scroll across viewports, presets, and resize/fullscreen", async ({
    page,
  }) => {
    test.slow();
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/demo");
    await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();

    // Production preview hides Styleguide nav link and StatusIsland uses concise accessible name
    await expect(page.getByRole("link", { name: "Styleguide" })).toHaveCount(0);
    const island = page.getByRole("button", {
      name: "6 fails, 0 to check, zone II, IS 13920 off",
    });
    await expect(island).toBeVisible();

    // Zero page scroll at 1440x900
    const noPageScroll1440 = await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    );
    expect(noPageScroll1440).toBe(true);
    await expectJointFitsInsideCanvas(page, { width: 1440, height: 900 });

    // Labels include measured, "needs", clause, and never overlap pairwise across presets
    const spacingLabels = page.locator("button", { hasText: "needs 25" });
    expect(await spacingLabels.count()).toBeGreaterThanOrEqual(1);
    await expect(spacingLabels.first()).toContainText(/16\s+mm · needs 25 · IS 456 cl\. 26\.3\.2/);
    await expect(page.locator("button", { hasText: "18" }).filter({ hasText: "overlap" }).first()).toContainText(
      /18\s+mm overlap · Geometry/,
    );

    const expectNoCalloutOverlaps = async (contextLabel: string) => {
      const boxes = await page.locator("button[data-callout-index]:visible").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        }),
      );
      expect(boxes.length, `${contextLabel} callouts rendered`).toBeGreaterThanOrEqual(6);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const sepX = a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5;
          const sepY = a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
          expect(
            sepX || sepY,
            `${contextLabel} overlap between ${i} (${JSON.stringify(a)}) and ${j} (${JSON.stringify(b)})`,
          ).toBe(true);
        }
      }
    };

    await expectNoCalloutOverlaps("Iso");

    // Check all four view presets fit the whole joint and never overlap callouts
    for (const presetName of ["Plan", "X Elev", "Y Elev", "Iso"] as const) {
      await page.getByRole("radio", { name: presetName }).click();
      await expectJointFitsInsideCanvas(page, { width: 1440, height: 900 });
      await expectNoCalloutOverlaps(presetName);
    }

    // Clicking a 3D callout opens/selects its finding card and corresponding bar in reverse
    await page.locator('button[data-callout-index="0"]').click();
    await expect(page.getByText(/B12\/T1-1 · T1-1/i)).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Findings list" })
        .locator('button[aria-pressed="true"]')
        .first(),
    ).toBeVisible();

    // Selecting a FindingCard frames its bars in 3D, renders sentence gauges, ClauseChip popover, and Source tab
    const findingsRegion = page.getByRole("region", { name: "Findings list" });
    await expect(
      findingsRegion.getByRole("button", {
        name: "Fails: B12 top bars 1 and 2 are 16 mm apart, need 25 mm, IS 456 clause 26.3.2",
      }),
    ).toBeVisible();
    await expect(
      findingsRegion.getByRole("img", { name: "16 millimetres; needs at least 25; short by 9 mm" }).first(),
    ).toBeVisible();
    await expect(
      findingsRegion.getByRole("img", { name: "18 millimetres overlap; zero clearance allowed" }).first(),
    ).toBeVisible();

    // ToleranceGauge measured label sits under diamond (not right end) and never collides with limit label
    const firstGaugeSvg = findingsRegion.locator('svg[role="img"]').first();
    const measuredBox = await firstGaugeSvg.locator('[data-gauge-role="measured"]').boundingBox();
    const limitBox = await firstGaugeSvg.locator('[data-gauge-role="limit"]').boundingBox();
    const svgBox = await firstGaugeSvg.boundingBox();
    expect(measuredBox && limitBox && svgBox).toBeTruthy();
    expect(measuredBox!.x + measuredBox!.width).toBeLessThan(svgBox!.x + svgBox!.width * 0.72);
    const gaugeSepX =
      measuredBox!.x + measuredBox!.width <= limitBox!.x + 1 ||
      limitBox!.x + limitBox!.width <= measuredBox!.x + 1;
    const gaugeSepY =
      measuredBox!.y + measuredBox!.height <= limitBox!.y + 1 ||
      limitBox!.y + limitBox!.height <= measuredBox!.y + 1;
    expect(gaugeSepX || gaugeSepY).toBe(true);

    const wrapForFrame = page.getByRole("img", { name: /Joint C4xB12:/i });
    const countBeforeCardFrame = Number((await wrapForFrame.getAttribute("data-render-count")) ?? "0");
    await page.getByRole("button", { name: /Show in 3D/i }).nth(4).click();
    await expect
      .poll(async () => Number((await wrapForFrame.getAttribute("data-render-count")) ?? "0"))
      .toBeGreaterThan(countBeforeCardFrame);

    await page.getByRole("button", { name: /Clause basis: IS 456 cl\. 26\.3\.2/i }).first().click();
    await expect(page.getByText(/Clear gap between parallel bars/i).last()).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Source" }).first().click();
    await expect(
      page.getByText(
        "This worked example was typed in from the pitch deck. Read a drawing to trace each value to its sheet.",
      ),
    ).toBeVisible();

    // W6: Fix tab renders FixOptionCards with SectionGlyphs, Preview After morphs matched bar ids + toast, Use in report
    await page.getByRole("tab", { name: "Fix" }).click();
    await expect(page.getByText(/2-25 over 2-20/i)).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: /Beam B12 top face cross-section: layer 1 has 2 bars of 25 millimetres, layer 2 has 2 bars of 20 millimetres/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Recheck/i).first()).toBeVisible();

    await page.getByRole("button", { name: /Preview After/i }).first().click();
    await expect(wrapForFrame).toHaveAttribute("data-scene-mode", "after");
    const afterIds = (await wrapForFrame.getAttribute("data-scene-bar-ids")) ?? "";
    expect(afterIds).toContain("B12/T2-1");
    expect(afterIds).not.toContain("B12/T1-5");
    await expect(page.getByText(/1,571 → 1,610\s*mm² · 5 bars → 4/i)).toBeVisible();

    await page.getByRole("button", { name: /Use in report/i }).first().click();
    await expect(page.getByRole("button", { name: /Used in report/i })).toBeVisible();
    await page.getByRole("button", { name: /Show Before/i }).first().click();
    await expect(wrapForFrame).toHaveAttribute("data-scene-mode", "before");

    // W7: Workings tab drives attempt_scenes with Gemini + Enumerator sources, rationales, Play, speed, Failed only, and ?a= URL sync
    await page.getByRole("tab", { name: "Workings" }).click();
    await expect(wrapForFrame).toHaveAttribute("data-scene-mode", "workings");
    await expect(wrapForFrame).toHaveAttribute("data-replay-attempt", "1");
    await expect(
      page.getByText(new RegExp(`Attempt 1 of ${ZONE2_TOTAL_ATTEMPTS} · Round 1`, "i")),
    ).toBeVisible();
    await expect(page.getByText(/Gemini rationale:/i)).toBeVisible();
    await expect(page.getByText(/18\s+mm overlap · Geometry/i).first()).toBeVisible();

    await page.getByRole("button", { name: /2×/i }).click();
    await page.getByRole("button", { name: /Play replay/i }).click();
    await expect
      .poll(async () => Number((await wrapForFrame.getAttribute("data-replay-attempt")) ?? "1"), {
        timeout: 4000,
      })
      .toBeGreaterThan(1);
    await page.getByRole("button", { name: /Pause replay/i }).click();
    await page.getByRole("button", { name: /Failed only/i }).click();

    await page.getByRole("tab", { name: "Findings" }).click();

    // Switching to Labels: All caps at 8 pills and shows +9 more without overlaps
    await page.getByRole("button", { name: /Labels: Failures/i }).click();
    await expect(page.getByRole("button", { name: /\+9 more/i })).toBeVisible();
    await expectNoCalloutOverlaps("Labels: All");
    await page.getByRole("button", { name: /Labels: All/i }).click();
    await page.getByRole("button", { name: /Labels: Off/i }).click();

    // Check desktop viewports and confirm resize triggers re-render without blanking
    const wrap = page.getByRole("img", { name: /Joint C4xB12:/i });
    const countBeforeResize = Number((await wrap.getAttribute("data-render-count")) ?? "0");

    for (const vp of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(vp);
      await expect
        .poll(
          () => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
          { message: `unexpected page scroll at ${vp.width}x${vp.height}` },
        )
        .toBe(true);
      await expectJointFitsInsideCanvas(page, vp);
    }

    const countAfterResize = Number((await wrap.getAttribute("data-render-count")) ?? "0");
    expect(countAfterResize).toBeGreaterThan(countBeforeResize);

    // Tablet portrait (768x1024 switches to mobile layout cleanly and fits the joint)
    await page.setViewportSize({ width: 768, height: 1024 });
    await expectJointFitsInsideCanvas(page, { width: 768, height: 1024 });
    const countAt768 = Number((await wrap.getAttribute("data-render-count")) ?? "0");
    expect(countAt768).toBeGreaterThanOrEqual(1);

    // Toggle Fullscreen and back, confirming re-render completes cleanly and canvas is non-blank
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectJointFitsInsideCanvas(page, { width: 1440, height: 900 });
    const countBeforeFs = Number((await wrap.getAttribute("data-render-count")) ?? "0");
    await page.getByRole("button", { name: /Full screen viewport/i }).click();
    await page.evaluate(() => {
      if (document.fullscreenElement) {
        return document.exitFullscreen();
      }
      return Promise.resolve();
    });
    await expectJointFitsInsideCanvas(page, { width: 1440, height: 900 });
    const countAfterFs = Number((await wrap.getAttribute("data-render-count")) ?? "0");
    expect(countAfterFs).toBeGreaterThanOrEqual(countBeforeFs);
    const shot = await wrap.locator("canvas").screenshot();
    expect(shot.byteLength).toBeGreaterThan(8000);

    expect(consoleErrors).toEqual([]);
  });

  test("renders 17 bars (7 failing), supports bar picking, F framing, presets, Open IFC, and both themes", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/demo");
    await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();
    await expect(
      page.getByRole("img", { name: /17 bars, 6 checks fail, 7 bars affected/i }),
    ).toBeVisible();

    // Dark theme axe check
    const darkAxe = await new AxeBuilder({ page }).analyze();
    expect(darkAxe.violations).toEqual([]);

    // Pick a failing bar from the scene bar list and press F to frame inside viewport
    await page
      .getByRole("region", { name: "Bars in 3D scene" })
      .getByRole("button", { name: /B12 Top bar 3, layer 1, 20 millimetres/i })
      .click();
    await expect(page.getByText(/Selected bar B12\/T1-3/i)).toBeVisible();

    const region = page.getByRole("region", { name: "3D joint viewport" });
    await region.focus();
    await page.keyboard.press("f");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("0");

    // Switch camera preset
    await page.getByRole("radio", { name: "Plan" }).click();
    await page.getByRole("radio", { name: "Iso" }).click();

    // Open lazy-loaded web-ifc dialog and inspect demo joint.ifc
    await page.getByRole("button", { name: /Open IFC/i }).click();
    await page.getByRole("button", { name: /Inspect demo joint\.ifc/i }).click();
    await expect(
      page
        .getByText(/31 IFC reinforcing elements/i)
        .or(page.getByText(/29 IFC reinforcing elements/i)),
    ).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");

    // Switch to Zone III -> shows all 7 failures including IS 13920 cl. 7.1.1 dimension callout
    await page.getByRole("radio", { name: "Zone III" }).click();
    await expect(page.getByText(/7 Fails/i).first()).toBeVisible();
    await expect(
      page.locator('button[data-callout-index]', { hasText: /300\s+mm · needs 400 · IS 13920 cl\. 7\.1\.1/ }),
    ).toBeVisible();
    expect(await page.locator("button[data-callout-index]:visible").count()).toBe(7);

    // Switch to Light theme and check axe
    await page.getByRole("button", { name: /Switch to light theme/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const lightAxe = await new AxeBuilder({ page }).analyze();
    expect(lightAxe.violations).toEqual([]);

    expect(consoleErrors).toEqual([]);
  });

  test("works under reduced motion and at 320 px width", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/demo");
    await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();

    const hasHorizOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizOverflow).toBe(false);

    await page.getByRole("button", { name: /Fit \(F\)|Frame \(F\)/i }).click();
  });

  test("deep-links Workings replay via ?a= query parameter to passing Gemini attempt", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/demo?a=${ZONE2_FIRST_PASS_STEP}`);
    await expect(
      page.getByText(
        new RegExp(`Attempt ${ZONE2_FIRST_PASS_STEP} of ${ZONE2_TOTAL_ATTEMPTS} · Round 1`, "i"),
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/Passes every IS 456, IS 13920, and geometry check/i),
    ).toBeVisible();
    const wrap = page.getByRole("img", { name: /Joint C4xB12:/i });
    await expect(wrap).toHaveAttribute("data-replay-attempt", String(ZONE2_FIRST_PASS_STEP));
  });

  test("steps past attempt 60 in Zone III Workings without breaking and shows No 3D for this attempt", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/demo");
    await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();

    await page.getByRole("radio", { name: "Zone III" }).click();
    await expect(page.getByText(/7 Fails/i).first()).toBeVisible();
    await page.getByRole("tab", { name: "Workings" }).click();

    await page.getByRole("button", { name: /^Attempt 60 \(/i }).click();
    const wrap = page.getByRole("img", { name: /Joint C4xB12:/i });
    await expect(wrap).toHaveAttribute("data-replay-attempt", "60");
    const barsAt60 = (await wrap.getAttribute("data-scene-bar-ids")) ?? "";
    expect(barsAt60.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: /Next attempt/i }).click();
    await expect(wrap).toHaveAttribute("data-replay-attempt", "61");
    await expect(wrap).toHaveAttribute("data-scene-bar-ids", barsAt60);
    await expect(page.getByText(/Attempt 61 of 80 · Round 2/i)).toBeVisible();
    await expect(page.getByText(/No 3D for this attempt/i)).toHaveCount(2);

    const shot = await wrap.locator("canvas").screenshot();
    expect(shot.byteLength).toBeGreaterThan(8000);
    expect(consoleErrors).toEqual([]);
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`runs W13 guided demo tour offline via Space (${reducedMotion})`, async ({
      page,
      context,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Abort any external host requests to prove self-hosted offline operation
      await page.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
      });

      await page.goto("/demo", { waitUntil: "networkidle" });
      await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();

      // Disconnect network completely before stepping through Finding -> Source -> Fix -> Replay -> Zone III
      await context.setOffline(true);

      await page.getByRole("button", { name: /Guided tour/i }).click();
      await expect(page.getByRole("region", { name: "Guided demo tour" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /^Six checks fail$/i }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Findings list" })
          .locator('article > button[aria-pressed="true"]'),
      ).toHaveCount(1);

      const tourAxe = await new AxeBuilder({ page }).analyze();
      expect(tourAxe.violations).toEqual([]);

      // No page scroll while tour banner is open
      const noScrollWithTour = await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight + 1,
      );
      expect(noScrollWithTour).toBe(true);

      // Step 2: Source
      await page.keyboard.press(" ");
      await expect(
        page.getByRole("heading", { name: /^Where each value came from$/i }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "This worked example was typed in from the pitch deck. Read a drawing to trace each value to its sheet.",
        ).first(),
      ).toBeVisible();

      // Step 3: Fix (After morph)
      await page.keyboard.press(" ");
      await expect(
        page.getByRole("heading", { name: /^A fix that passes every rule$/i }),
      ).toBeVisible();
      const wrap = page.getByRole("img", { name: /Joint C4xB12:/i });
      await expect(wrap).toHaveAttribute("data-scene-mode", "after");

      // Step 4: Replay (Workings) reads attempt count dynamically from bundle
      await page.keyboard.press(" ");
      await expect(
        page.getByRole("heading", { name: /^Every attempt, shown$/i }),
      ).toBeVisible();
      await expect(
        page.getByText(new RegExp(`${ZONE2_TOTAL_ATTEMPTS} arrangements tried;`, "i")).first(),
      ).toBeVisible();
      await expect(
        page.getByText(new RegExp(`Attempt 1 of ${ZONE2_TOTAL_ATTEMPTS} · Round 1`, "i")),
      ).toBeVisible();

      // Step 5: Zone III (works offline via prefetched cache)
      await page.keyboard.press(" ");
      await expect(
        page.getByRole("heading", { name: /^Zone III changes the answer$/i }),
      ).toBeVisible();
      await expect(page.getByText(/7 Fails/i).first()).toBeVisible();
      await expect(page.getByText(/4-16 over 4-16; C4 325 × 300/i)).toBeVisible();

      // Finish tour cleanly on Space
      await page.keyboard.press(" ");
      await expect(page.getByRole("region", { name: "Guided demo tour" })).toHaveCount(0);

      await context.setOffline(false);
    });
  }
});
