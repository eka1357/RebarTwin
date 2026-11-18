import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { BeamJunctionsList } from "../BeamJunctionsList";
import { FailuresByRuleChart } from "../FailuresByRuleChart";
import { ProjectJointsTable } from "../ProjectJointsTable";
import { ProjectSummaryCards } from "../ProjectSummaryCards";
import { buildIitFirstFloorFixture } from "../../../test/fixtures/iitFirstFloor";
import { useState } from "react";

function OverviewHarness() {
  const project = buildIitFirstFloorFixture();
  const [statusFilter, setStatusFilter] = useState<"all" | "fail" | "to_check" | "pass">("all");
  const [ruleFilter, setRuleFilter] = useState<string | null>(null);

  return (
    <MemoryRouter>
      <div className="space-y-4">
        <ProjectSummaryCards
          counts={project.counts!}
          unresolvedToCheck={project.to_check_counts.unresolved}
          statusFilter={statusFilter}
          onSelectFilter={setStatusFilter}
        />
        <FailuresByRuleChart
          stats={project.failures_by_rule!}
          selectedRule={ruleFilter}
          onSelectRule={setRuleFilter}
        />
        <ProjectJointsTable
          projectId={project.id}
          joints={project.joints}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          ruleFilter={ruleFilter}
          onClearRuleFilter={() => setRuleFilter(null)}
        />
        <BeamJunctionsList junctions={project.beam_junctions!} />
      </div>
    </MemoryRouter>
  );
}

describe("W10 Project Overview (IIT 45-joint fixture)", () => {
  it("renders summary counts, sorted 45 joints (failing -> blocked -> passing), links, failures-by-rule bars, and informational beam-on-beam junctions", () => {
    render(<OverviewHarness />);

    // Counts at the top: 45 found, 36 checked, 14 failing, 9 blocked
    const countsRegion = screen.getByRole("region", { name: "Project joint counts" });
    expect(within(countsRegion).getByText("45")).toBeInTheDocument();
    expect(within(countsRegion).getByText("36")).toBeInTheDocument();
    expect(within(countsRegion).getByText("14")).toBeInTheDocument();
    expect(within(countsRegion).getByText("9")).toBeInTheDocument();

    // 45 joint rows, ordered failing -> blocked -> passing
    const list = screen.getByRole("list", { name: "Project joints list" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(45);

    // First 14 rows fail; next 9 are blocked; remaining 22 pass
    expect(rows[0].textContent).toMatch(/Fails/i);
    expect(rows[13].textContent).toMatch(/Fails/i);
    expect(rows[14].textContent).toMatch(/To check/i);
    expect(rows[14].textContent).toMatch(/Blocked by \d+ To check/i);
    expect(rows[22].textContent).toMatch(/To check/i);
    expect(rows[23].textContent).toMatch(/Passes/i);

    // Row contains grid, column/beams, icon+word status, worst failing rule, and all 3 links
    expect(within(rows[0]).getByText(/Grid [A-E]-\d/i)).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: /^Joint /i })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/projects\/iit-first-floor\/joints\/.+%40FIRST/),
    );
    expect(within(rows[0]).getByRole("link", { name: /^Report for /i })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/projects\/iit-first-floor\/report\?joint=/),
    );
    expect(within(rows[0]).getByRole("link", { name: /^To check items for /i })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/projects\/iit-first-floor\/review\?joint=/),
    );

    // Clicking a rule bar in Failures by rule filters the joint rows cleanly
    const ruleBar = screen.getByRole("button", { name: /IS 13920 cl\. 7\.1\.1/i });
    fireEvent.click(ruleBar);
    const filteredRows = within(list).getAllByRole("listitem");
    expect(filteredRows.length).toBeGreaterThan(0);
    expect(filteredRows.length).toBeLessThan(14);
    expect(filteredRows.every((r) => /Fails/i.test(r.textContent ?? ""))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Clear rule filter/i }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(45);

    // Beam-on-beam junctions listed as Information, not as failures
    const bjSection = screen.getByRole("region", { name: /Beam-on-beam junctions \(4\)/i });
    expect(within(bjSection).getByText("Information")).toBeInTheDocument();
    expect(within(bjSection).getByText("SB1 into B14")).toBeInTheDocument();
    expect(within(bjSection).getByText("Grid A/B-3")).toBeInTheDocument();
  });
});
