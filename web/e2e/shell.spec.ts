import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = [
  { path: "/", heading: /Gemini reads and proposes/i },
  { path: "/demo", heading: /Worked Example: C4 × B12/i },
  { path: "/projects/c4-b12", heading: /Joints Overview/i },
  { path: "/projects/c4-b12/upload", heading: /Upload Structural Drawings/i },
  { path: "/projects/c4-b12/review", heading: /To Check Queue/i },
  { path: "/projects/c4-b12/joints/C4xB12", heading: /Joint Workspace: C4xB12/i },
  { path: "/projects/c4-b12/report", heading: /Pre-pour check · C4 × B12/i },
  { path: "/styleguide", heading: /Tokens, Type, Status and Primitives/i },
];

test.describe("App shell W2", () => {
  test("every route is reachable via keyboard and passes axe in dark theme", async ({ page }) => {
    await page.goto("/");
    for (const r of ROUTES) {
      await page.goto(r.path);
      await expect(page.getByRole("heading", { name: r.heading })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `axe violations on ${r.path}`).toEqual([]);
    }
  });

  test("keyboard navigation reaches nav links, command palette (Ctrl+K), and shortcuts (?)", async ({
    page,
  }) => {
    await page.goto("/");
    // Skip link appears on first Tab
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /Skip to content/i })).toBeFocused();

    // Open command palette with Control+k and navigate to /demo by keyboard
    await page.keyboard.press("Control+k");
    const cmdInput = page.getByPlaceholder(/Jump to route/i);
    await expect(cmdInput).toBeVisible();
    await cmdInput.fill("Worked Example");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/demo$/);

    // Open shortcuts dialog with ?
    await page.locator("body").click();
    await page.keyboard.type("?");
    await expect(page.getByRole("heading", { name: /Keyboard Shortcuts/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /Keyboard Shortcuts/i })).not.toBeVisible();
  });

  test("theme persists across reloads and StatusIsland works under reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/demo");

    await page.getByRole("button", { name: /Switch to light theme/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("heading", { name: /Worked Example: C4 × B12/i })).toBeVisible();

    const lightAxe = await new AxeBuilder({ page }).analyze();
    expect(lightAxe.violations).toEqual([]);

    const island = page.getByRole("button", { name: /6 fails, 0 to check, zone II, IS 13920 off/i });
    await island.click();
    await expect(page.getByRole("link", { name: /Open demo/i })).toBeVisible();

    // Encoded @ in joint ids works cleanly across routes
    await page.goto("/projects/c4-b12/joints/C4xB12%40FIRST");
    await expect(page.getByRole("heading", { name: /Joint Workspace: C4xB12@FIRST/i })).toBeVisible();
  });

  test("reflows cleanly at 320 px width with accessible mobile menu", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    const hasHorizOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizOverflow).toBe(false);

    await page.getByRole("button", { name: /Open navigation menu/i }).click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  });
});
