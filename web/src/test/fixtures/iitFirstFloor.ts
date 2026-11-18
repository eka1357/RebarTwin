import type { ProjectDetail, ProjectJointSummary } from "../../lib/api";

const GRID_COLS = ["A", "B", "C", "D", "E"] as const;
const GRID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const RULE_CYCLE = [
  {
    rule: "IS456-26.3.2-H",
    clause: "IS 456:2000 cl. 26.3.2",
    title: "Clear gap between parallel bars",
    unit: "mm",
    measured: 16,
    limit: 25,
    margin: -9,
  },
  {
    rule: "GEOM-CLASH",
    clause: "Geometry",
    title: "Bars that run into each other",
    unit: "mm",
    measured: -18,
    limit: 0,
    margin: -18,
  },
  {
    rule: "IS13920-7.1.1",
    clause: "IS 13920:2016 cl. 7.1.1",
    title: "Column width at least 20 beam-bar diameters",
    unit: "mm",
    measured: 300,
    limit: 400,
    margin: -100,
  },
  {
    rule: "IS456-26.4.2",
    clause: "IS 456:2000 cl. 26.4.2, Table 16",
    title: "Nominal concrete cover",
    unit: "mm",
    measured: 20,
    limit: 25,
    margin: -5,
  },
] as const;

/**
 * 45-joint fixture shaped like the IIT first-floor framing plan (5x9 bay grid),
 * intentionally mixed out of sort order so client/API overview sorting is verified.
 */
export function buildIitFirstFloorFixture(): ProjectDetail {
  const joints: ProjectJointSummary[] = [];
  const ruleCounts = new Map<string, { clause: string; title: string; failures: number; joints: number }>();

  let index = 0;
  for (const colLetter of GRID_COLS) {
    for (const rowNum of GRID_ROWS) {
      index += 1;
      const grid = `${colLetter}-${rowNum}`;
      const colId = `C${index}`;
      const bx = `B${index * 2 - 1}`;
      const by = `B${index * 2}`;
      const id = `${colId}x${bx}x${by}@FIRST`;

      // Intentionally interleave passing, blocked, and failing across the 45-joint fixture:
      // 14 failing, 9 blocked (to_check), 22 passing.
      if (index <= 22) {
        joints.push({
          id,
          grid,
          level: "FIRST",
          sheets: [1, 3],
          column: { id: colId, b: 350, h: 450, n_bars: 8, bar_dia: 20 },
          beams: [
            { id: bx, b: 230, D: 500, direction: "x" },
            { id: by, b: 230, D: 450, direction: "y" },
          ],
          seismic_zone: "III",
          exposure: "mild",
          status: "pass",
          fix_status: "clean",
          fail_count: 0,
          blocked_count: 0,
          worst_failure: null,
          failing_rules: [],
          bundle_ready: true,
        });
      } else if (index <= 31) {
        const blockCount = ((index - 23) % 3) + 1;
        joints.push({
          id,
          grid,
          level: "FIRST",
          sheets: [2, 4],
          column: { id: colId, b: 300, h: 450 },
          beams: [{ id: bx, b: 230, D: 450, direction: "x" }],
          seismic_zone: "III",
          exposure: "mild",
          status: "to_check",
          fix_status: null,
          fail_count: 0,
          blocked_count: blockCount,
          blocking_item_ids: Array.from({ length: blockCount }, (_, k) => `tc_${index}_${k + 1}`),
          worst_failure: null,
          failing_rules: [],
          bundle_ready: false,
        });
      } else {
        const failIdx = index - 32; // 0..13 (14 failing joints)
        const primaryRule = RULE_CYCLE[failIdx % RULE_CYCLE.length];
        const secondaryRule = RULE_CYCLE[(failIdx + 1) % RULE_CYCLE.length];
        const failCount = (failIdx % 4) + 2; // 2..5 failures
        const jointRules = [primaryRule.rule];
        if (failCount >= 4) jointRules.push(secondaryRule.rule);

        for (const rObj of failCount >= 4 ? [primaryRule, secondaryRule] : [primaryRule]) {
          const hitCount = rObj.rule === primaryRule.rule ? Math.max(1, failCount - (failCount >= 4 ? 1 : 0)) : 1;
          const prev = ruleCounts.get(rObj.rule);
          if (prev) {
            prev.failures += hitCount;
            prev.joints += 1;
          } else {
            ruleCounts.set(rObj.rule, {
              clause: rObj.clause,
              title: rObj.title,
              failures: hitCount,
              joints: 1,
            });
          }
        }

        joints.push({
          id,
          grid,
          level: "FIRST",
          sheets: [1, 2],
          column: { id: colId, b: 300, h: 300, n_bars: 8, bar_dia: 16 },
          beams: [
            { id: bx, b: 230, D: 450, direction: "x" },
            { id: by, b: 200, D: 450, direction: "y" },
          ],
          seismic_zone: "III",
          exposure: "mild",
          status: "fail",
          fix_status: primaryRule.rule === "IS13920-7.1.1" ? "redesign" : "fixed",
          fail_count: failCount,
          blocked_count: 0,
          worst_failure: {
            rule: primaryRule.rule,
            clause: primaryRule.clause,
            title: primaryRule.title,
            measured: primaryRule.measured,
            limit: primaryRule.limit,
            margin: primaryRule.margin,
            unit: primaryRule.unit,
          },
          failing_rules: jointRules,
          bundle_ready: true,
        });
      }
    }
  }

  return {
    id: "iit-first-floor",
    name: "IIT First Floor Framing",
    pdf: "IIT-first-floor.pdf",
    status: "done",
    created_at: "2026-11-18T09:00:00Z",
    sheets: [{ page: 1, words: 420 }, { page: 2, words: 380 }, { page: 3, words: 510 }, { page: 4, words: 290 }],
    counts: {
      found: 45,
      checked: 36,
      failing: 14,
      blocked: 9,
      passing: 22,
    },
    failures_by_rule: [...ruleCounts.entries()]
      .map(([rule, info]) => ({ rule, ...info }))
      .sort((a, b) => b.failures - a.failures || a.rule.localeCompare(b.rule)),
    beam_junctions: [
      {
        id: "BJ-1",
        beams: ["SB1", "B14"],
        grid: "A/B-3",
        level: "FIRST",
        page: 1,
        note: "Secondary beam on main beam; no column",
      },
      {
        id: "BJ-2",
        beams: ["SB4", "B22"],
        grid: "B/C-6",
        level: "FIRST",
        page: 2,
        note: "Stair landing beam junction; no column",
      },
      {
        id: "BJ-3",
        beams: ["SB7", "B31"],
        grid: "D-2/3",
        level: "FIRST",
        page: 3,
        note: "Cantilever tie beam; no column",
      },
      {
        id: "BJ-4",
        beams: ["SB9", "B40"],
        grid: "E-5/6",
        level: "FIRST",
        page: 4,
        note: "Secondary partition beam; no column",
      },
    ],
    joints,
    to_check_counts: {
      total: 18,
      unresolved: 18,
      project_level_unresolved: 0,
    },
    reading: {
      counts: { accepted: 210, to_check: 18, joints: 45 },
      seconds: 12.4,
      link_model: "gemini-4-argon",
    },
  };
}
