import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Demo 3D Scene W3", () => {
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
