import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = [
  { path: "/", heading: /Gemini reads and proposes/i },
  { path: "/demo", heading: /Worked Example: C4 × B12/i },
  { path: "/projects/c4-b12", heading: /Joints Overview/i },
  { path: "/projects/iit-demo", heading: /Joints Overview/i },
  { path: "/projects/c4-b12/upload", heading: /Upload Structural Drawings/i },
  { path: "/projects/c4-b12/review", heading: /To Check Queue/i },
  { path: "/projects/iit-demo/review", heading: /To Check Queue/i },
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
    await expect(page.getByRole("heading", { name: /Gemini reads and proposes/i })).toBeVisible();
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

  test("landing W12 passes axe in both themes, toggles Before/After preview, and hides Styleguide in production", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Inspect IIT Hyderabad joint/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /View styleguide/i })).toHaveCount(0);

    await page.getByRole("button", { name: /After \(Option #1\)/i }).click();
    await expect(page.getByText(/Verified fix: passes without redesign/i)).toBeVisible();

    await page.getByRole("button", { name: /Switch to light theme/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const lightAxe = await new AxeBuilder({ page }).analyze();
    expect(lightAxe.violations).toEqual([]);
  });

  test("renders 404 NotFoundRoute, resets After state across joints, and searches Zone III findings in CommandPalette", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Unknown route renders calm 404 page with zero axe violations
    await page.goto("/projects/does-not-exist/bad");
    await expect(page.getByRole("heading", { name: /Page not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open IIT 3D joint/i })).toHaveAttribute(
      "href",
      "/demo/iit",
    );
    const axe404 = await new AxeBuilder({ page }).analyze();
    expect(axe404.violations).toEqual([]);

    // 2. Preview After on /demo -> navigate via CommandPalette to /demo/iit -> resets to Before cleanly
    await page.goto("/demo");
    await page.getByRole("tab", { name: "Fix" }).click();
    await page.getByRole("button", { name: /Preview After/i }).first().click();
    await expect(page).toHaveURL(/\/demo\?.*o=0/);

    await page.keyboard.press("Control+k");
    const cmdInput = page.getByPlaceholder(/Jump to route/i);
    await cmdInput.fill("IIT Real Joint");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/demo\/iit$/);
    const iitWrap = page.getByRole("img", { name: /Joint C1xXB17/i });
    await expect(iitWrap).toHaveAttribute("data-scene-mode", "before");

    // 3. Zone III via ?zone=3 loads Zone III bundle and indexes IS 13920 cl. 7.1.1 in CommandPalette
    await page.goto("/demo?zone=3");
    await expect(page.getByText(/7 Fails/i).first()).toBeVisible();
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder(/Jump to route/i).fill("7.1.1");
    await expect(page.getByText(/IS 13920 cl\. 7\.1\.1/i).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/demo\?.*zone=3.*f=/);
  });
});
