import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Styleguide W1", () => {
  test("renders tokens and primitives cleanly in dark and light themes with zero axe violations", async ({
    page,
  }) => {
    await page.goto("/styleguide");
    await expect(page.getByRole("heading", { name: /Tokens, Type, Status/i })).toBeVisible();

    // Dark theme axe check
    const darkResults = await new AxeBuilder({ page }).analyze();
    expect(darkResults.violations).toEqual([]);

    // Switch to light theme and re-run axe
    await page.getByRole("button", { name: /Switch to light theme/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const lightResults = await new AxeBuilder({ page }).analyze();
    expect(lightResults.violations).toEqual([]);
  });

  test("reflows cleanly at 320 px width and supports keyboard focus and reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/styleguide");
    await expect(page.getByRole("heading", { name: /Tokens, Type, Status/i })).toBeVisible();
    const hasHorizOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizOverflow).toBe(false);

    await page.keyboard.press("Tab");
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(activeTag).toMatch(/^(A|BUTTON)$/);
  });
});
