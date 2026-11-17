# PRODUCT.md

## One line

RebarTwin reads a building's structural drawings, rebuilds the steel at every beam-column joint in 3D, and proves
which joints break IS 456 and IS 13920, with a fix that passes every rule. Gemini reads and proposes; geometry
decides; the engineer of record signs off.

## The problem

Indian buildings are designed and built from 2D drawings. At a beam-column joint, column bars, beam bars from two
directions, ties and stirrups meet in one small block of concrete. Clear spacing, cover and seismic detailing are
checked on flat sheets, if at all, so clashes surface on site while bars are being tied, and crews bend or cut bars
to make them fit (IIT Kanpur and BMTPC, Earthquake Tip 20). Joints that are badly detailed are where frames fail in
earthquakes.

General AI is not the answer on its own: on Google's Physical-Engineering's Last Exam (November 2026), the best agent
met 91% of individual constraints, yet only 41% of its deliverables passed every hard safety check. RebarTwin uses
the model for what it is good at, reading and proposing, and computes every pass and fail itself.

## Who it is for

| Who | Job to be done | What they need from us |
|---|---|---|
| Structural design engineer (consultant) | "Before I issue these drawings, show me which joints can't be built as drawn." | Every failing joint, the clause, the measured gap, a fix that passes, in minutes |
| Proof checker or third-party reviewer | "Check someone else's set and give me issues I can send back." | Findings tied to the exact drawing crop, BCF issues, a printable report |
| Site engineer or contractor | "Show me how these bars actually fit before the crew ties them." | The joint in 3D, bar by bar, with layers and spacers |
| Owner or developer (indirect) | "Fewer surprises on site, safer buildings." | A short report and a count of issues caught |

Buildathon judges are a fifth audience: they score founder, product, market, architecture and Google AI, and they
see the product for three minutes.

## Principles

1. **Proof, not opinion.** Every finding shows the measured value, the limit and the clause. No number comes from a
   model.
2. **Show the source.** Every value links to the crop of the drawing it came from, and says which channel read it.
3. **Doubt goes to a person.** When Gemini and the parser disagree, the value waits in To check. We never guess.
4. **A fix is checked before it is shown.** Candidates that break any rule never reach the screen; the Workings
   replay shows them failing.
5. **Advisory.** The engineer of record decides. Redesigns (a bigger column) are flagged, never applied.
6. **Fast to the first finding.** Upload to the first red bar in under two minutes for a typical sheet.

## What it does

1. **Upload** a drawing set (PDF as issued).
2. **Read**: Gemini 3.8 Flash reads every schedule row and callout with a box on the sheet; an independent text
   parser reads the same values; they must agree. Gemini 4 Argon links sheets into joints.
3. **To check**: any disagreement or missing value waits for a person, shown side by side on the crop.
4. **Rebuild and prove**: each joint's bars are placed in 3D and every rule runs: IS 456 spacing and cover, bar
   clashes, and IS 13920 joint rules in zones III to V.
5. **Fix**: candidate re-arrangements are proposed and re-checked against every rule; the best that pass are shown
   with what changes (steel, effective depth) and what the engineer must recheck.
6. **Export**: IFC model, BCF issues for BIM tools, a report.

## Scope by milestone

| Milestone | Date | In scope |
|---|---|---|
| City round, Hyderabad | 20 to 21 Nov 2026 | Workspace for one joint with findings, source crop, fixes, Workings replay; reader on one real sheet with To check; demo mode that runs offline |
| Showcase | 27 Nov | Full upload flow, project view with all joints, Gemini fix proposals, Cloud Run deployment, landing page |
| Finale, Google Bengaluru | 2 Dec | Report export, accuracy evidence on a labelled set, an engineer's review of real findings, polish |

## Not now

Design (sizing members), analysis, BBS for whole buildings, slabs and footings, exterior and corner joints (bars
ending in the column), anchorage and laps, Revit or AutoCAD plug-ins, user accounts and billing, any language other
than English in the UI.

## Core journeys

1. **First look (demo).** Landing, then "Try the example" opens a joint that fails. The camera settles on the
   joint, failing bars glow, gap callouts read "16 mm, needs 25". One click shows the fix; Before and After morphs
   the bars; Workings replays the 34 candidates and why 27 failed.
2. **Check a set.** Upload a PDF, watch pages being read, clear the To check queue, then open the project: joints by
   sheet, failures first.
3. **Understand one finding.** Click a red bar: its findings, each with a gauge of measured against limit, the
   clause and its basis, and the drawing crop it came from.
4. **Choose a fix.** Compare options, preview each in 3D, accept one for the report; flags say what the engineer
   must recheck.
5. **Send it on.** Export the report, BCF issues and IFC.

## How we measure success

| Measure | Target |
|---|---|
| Reading accuracy on the labelled set (60 callouts) | at least 95% accepted and correct; zero wrong values accepted |
| Time from upload to first finding | under 2 minutes for one sheet |
| Findings confirmed by a practising engineer | at least 3 on a real drawing set before the finale |
| Demo | the whole story in 3 minutes, offline-capable, no dead time |
| Accessibility | WCAG 2.2 AA, zero axe violations on core screens |

## The three-minute demo

1. (0:00) The problem in one sentence and the PLE number.
2. (0:20) Upload a real sheet; tiles read; one value lands in To check and is resolved in a click.
3. (0:50) The joint opens: red bars, "16 mm, needs 25, IS 456 cl. 26.3.2", the 18 mm clash ring.
4. (1:30) Click a bar: the drawing crop it came from, read by both channels.
5. (1:50) Fix: 2-25 over 2-20, Before and After morph, depth drop flagged.
6. (2:20) Workings replay: candidates failing one by one, each with the clause that rejected it.
7. (2:45) Zone III: no bar change passes; the engine says why. Export BCF. Close.

## Risks

| Risk | What we do |
|---|---|
| Real drawings read badly | To check queue; demo on pre-checked sheets; accuracy reported honestly |
| Gemini 4 Argon not enabled on our key | Gemini 3.8 Flash takes its job |
| Venue Wi-Fi fails | Demo mode runs from local bundles with no network |
| A judge questions a rule | Each rule shows its clause and basis; docs/rules.md says what is verified |
| Time | The cut list in IMPLEMENTATION_PLAN.md |

## Glossary

| Term | Meaning |
|---|---|
| Beam-column joint | Where beams frame into a column; the block of concrete they share |
| Main bars | Longitudinal bars that carry bending (beam top and bottom, column verticals) |
| Ties, stirrups (links) | Closed loops around main bars: ties in columns, stirrups in beams |
| Cover | Concrete outside the steel. "To links" means outside the ties or stirrups |
| Layer | A row of bars across a beam's width; layer 1 is outermost |
| Spacer | The bar or gap between two layers |
| Callout | Drawing notation for bars, count then diameter: "5-20" is five 20 mm bars |
| Effective depth (d) | Depth from the compression face to the centroid of the tension steel |
| IS 456:2000 | Indian code for plain and reinforced concrete |
| IS 13920:2016 | Indian code for ductile detailing in seismic zones |
| Seismic zone | II to V in IS 1893; IS 13920 runs in III, IV and V |
| IFC | Open 3D building model format |
| BCF | Open format for issues raised on a BIM model |
| BBS | Bar bending schedule |
