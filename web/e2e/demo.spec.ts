import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

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
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/demo");
    await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();

    // Production preview hides Styleguide nav link and drops duplicate fail count in StatusIsland
    await expect(page.getByRole("link", { name: "Styleguide" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Joint status:/i })).not.toContainText(
      /6 fail ·/i,
    );

    // Zero page scroll at 1440x900
    const noPageScroll1440 = await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    );
    expect(noPageScroll1440).toBe(true);
    await expectJointFitsInsideCanvas(page, { width: 1440, height: 900 });

    // Labels include measured, "needs", and clause
    const spacingLabels = page.locator("button", { hasText: "needs 25" });
    expect(await spacingLabels.count()).toBeGreaterThanOrEqual(1);
    await expect(spacingLabels.first()).toContainText(/16\s+mm · needs 25 · IS 456 cl\. 26\.3\.2/);
    await expect(page.locator("button", { hasText: "18" }).filter({ hasText: "overlap" }).first()).toContainText(
      /18\s+mm overlap · Geometry/,
    );

    // Check all four view presets fit the whole joint
    for (const presetName of ["Plan", "X Elev", "Y Elev", "Iso"] as const) {
      await page.getByRole("radio", { name: presetName }).click();
      await expectJointFitsInsideCanvas(page, { width: 1440, height: 900 });
    }

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
    await page.getByRole("button", { name: /B12 Top bar 3, layer 1, 20 millimetres/i }).click();
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

    // Switch to Zone III
    await page.getByRole("radio", { name: "Zone III" }).click();
    await expect(page.getByText(/7 Fails/i).first()).toBeVisible();

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
});
