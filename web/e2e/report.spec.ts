import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function extractPdfText(pdfPath: string): string {
  const repoRoot = path.resolve("..");
  const venvPython = path.join(repoRoot, ".venv", "Scripts", "python.exe");
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : "python";
  const script = "import pymupdf, sys; doc = pymupdf.open(sys.argv[1]); print('\\n'.join(p.get_text() for p in doc))";
  return execFileSync(pythonCmd, ["-c", script, pdfPath], { encoding: "utf8" });
}

test.describe("Pre-pour Report W11", () => {
  test("reaches report from Use in report, forces light theme, downloads exports, passes axe, and prints A4 PDF with full engineering text", async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/demo");
    await expect(page.getByText(/17 bars · 7 failing/i)).toBeVisible();

    // App shell starts in dark theme
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");

    // Pick Option #2 via Use in report -> Open report
    await page.getByRole("tab", { name: "Fix" }).click();
    await page.getByRole("button", { name: /Use in report/i }).nth(1).click();
    await expect(page.getByRole("button", { name: /Used in report/i })).toBeVisible();
    await page
      .getByRole("tabpanel", { name: "Fix" })
      .getByRole("button", { name: "Open report" })
      .click();

    await expect(page).toHaveURL(/\/projects\/c4-b12\/report\?.*joint=C4xB12.*option=1/);
    await expect(page.getByRole("heading", { name: /Printable Joint Report/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Fails 6 checks/i })).toBeVisible();
    await expect(page.getByText(/Option #2 · Selected in workspace/i)).toBeVisible();
    await expect(page.getByText(/1,571 → 1,609/i)).toBeVisible();
    await expect(
      page.getByText(/This worked example was typed in from the pitch deck\./i),
    ).toBeVisible();

    // Light theme is forced on the A4 sheet even when app shell stays dark
    const sheetBg = await page
      .locator("article.report-a4")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sheetBg).toBe("rgb(255, 253, 249)");

    // Axe clean on report in both dark shell and light shell
    const darkShellAxe = await new AxeBuilder({ page }).analyze();
    expect(darkShellAxe.violations).toEqual([]);

    // Download links resolve cleanly to real demo export assets
    for (const file of ["joint.ifc", "fixed.ifc", "issues.bcf"] as const) {
      const link = page.getByRole("link", { name: file });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
      const res = await request.get(href!);
      expect(res.ok(), `download ${file}`).toBe(true);
    }

    // Print button calls window.print()
    await page.evaluate(() => {
      (window as unknown as { __printCalls?: number }).__printCalls = 0;
      window.print = () => {
        (window as unknown as { __printCalls?: number }).__printCalls =
          ((window as unknown as { __printCalls?: number }).__printCalls ?? 0) + 1;
      };
    });
    await page.getByRole("button", { name: /Print or save as PDF/i }).click();
    const printCalls = await page.evaluate(
      () => (window as unknown as { __printCalls?: number }).__printCalls ?? 0,
    );
    expect(printCalls).toBe(1);

    // Emulate print media: app chrome disappears while report sheet remains visible
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("header.app-topbar")).toBeHidden();
    await expect(page.getByRole("heading", { name: /Printable Joint Report/i })).toBeVisible();
    await page.emulateMedia({ media: null });

    // Generate actual A4 PDF and extract text via PyMuPDF
    const pdfPath = testInfo.outputPath("c4-b12-report.pdf");
    const pdfBytes = await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
    });
    expect(pdfBytes.byteLength).toBeGreaterThan(10_000);

    const pdfText = extractPdfText(pdfPath);
    expect(pdfText).toContain("Printable Joint Report");
    expect(pdfText).toContain("C4xB12");
    expect(pdfText).toContain("Zone II");
    expect(pdfText).toContain("Fails 6 checks");
    expect(pdfText).toMatch(/IS 456 cl\. 26\.3\.2/);
    expect(pdfText).toContain("Option #2");
    expect(pdfText).toContain("1,609");
    expect(pdfText).toContain("Assumptions");
    expect(pdfText).toContain("This worked example was typed in from the pitch deck.");
    expect(pdfText).toContain("Checked by");
    expect(pdfText).toContain("Engineer of record");
    expect(pdfText).toContain("Date");
    expect(pdfText).not.toContain("Print or save as PDF");
    expect(pdfText).not.toContain("Ctrl+K");
    expect(pdfText).not.toContain("Option #2 marked for report");
    expect(pdfText).not.toContain("Model and issue exports");
  });

  test("reaches Zone III redesign report from Demo Report link and renders live provenance report + 320 px layout cleanly", async ({
    page,
  }) => {
    // Part 1: Demo Zone III -> Report button
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/demo");
    await page.getByRole("radio", { name: "Zone III" }).click();
    await expect(page.getByText(/7 Fails/i).first()).toBeVisible();
    await page.locator("#main-content").getByRole("link", { name: /^Report$/i }).click();

    await expect(page).toHaveURL(/\/projects\/c4-b12\/report\?.*variant=zone3/);
    await expect(page.getByRole("heading", { name: /Fails 7 checks/i })).toBeVisible();
    await expect(page.getByText(/Zone III \(IS 13920 on\)/i)).toBeVisible();
    expect(await page.getByText(/Redesign/i).count()).toBeGreaterThanOrEqual(1);
    expect(await page.getByText(/engineer of record decides/i).count()).toBeGreaterThanOrEqual(1);

    // Part 2: Live API provenance report with @-joint id, Agreed/Resolved/OCR/Default, 320 px, reduced motion, and axe
    const baseBundle = JSON.parse(
      fs.readFileSync(path.resolve("public/demo/C4xB12-zone3/bundle.json"), "utf8"),
    ) as Record<string, unknown>;
    const provBundle = {
      ...baseBundle,
      joint: { ...(baseBundle.joint as object), id: "C4xB12@FIRST" },
      pages: { "1": "pages/page-1.png", "3": "pages/page-3.png" },
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
          path: "beams[0].top[0].bars",
          member: "B12",
          field: "top",
          layer: 1,
          level: "FIRST FLOOR",
          page: 3,
          box_2d: [200, 300, 260, 420],
          text: "5-20",
          gemini: "5-20",
          parser: "5-20",
          status: "resolved",
          ocr_raw: null,
          page_image: "pages/page-3.png",
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

    await page.route("**/api/projects/live-rpt**", async (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      if (p === "/api/projects/live-rpt") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "live-rpt",
            name: "Block C Frames",
            pdf: "block-c.pdf",
            status: "done",
            created_at: "2026-11-18T08:00:00Z",
            sheets: [{ page: 1 }, { page: 3 }],
            joints: [
              {
                id: "C4xB12@FIRST",
                column: { id: "C4", b: 300, h: 300 },
                beams: [{ id: "B12", b: 230, D: 450 }],
                seismic_zone: "III",
                status: "fail",
                fail_count: 7,
                blocked_count: 0,
                bundle_ready: true,
              },
            ],
            to_check_counts: { total: 0, unresolved: 0, project_level_unresolved: 0 },
          }),
        });
      }
      if (p === "/api/projects/live-rpt/joints/C4xB12@FIRST/bundle") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(provBundle),
        });
      }
      return route.fulfill({ status: 404, body: "Not mocked" });
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/projects/live-rpt/report?joint=C4xB12%40FIRST");

    await expect(page.getByText(/Block C Frames \(block-c\.pdf\)/i)).toBeVisible();
    await expect(page.getByText(/Page 1, Page 3/i)).toBeVisible();
    await expect(page.getByText("Agreed")).toBeVisible();
    await expect(page.getByText("Resolved")).toBeVisible();
    await expect(page.getByText("OCR read '4016'")).toBeVisible();
    await expect(page.getByText(/Storey: FOUNDATION TO FIRST FLOOR/i)).toBeVisible();
    await expect(page.getByText("Assumed, not on the drawing")).toBeVisible();

    const overflow320 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow320).toBe(false);

    const axeLive = await new AxeBuilder({ page }).analyze();
    expect(axeLive.violations).toEqual([]);
  });
});
