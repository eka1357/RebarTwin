# Provenance

An honest record of what was made when, and from what, kept the way ORCA keeps `BUILT_DURING_HACKATHON.md`.

## 17 November 2026: the engine

Written in a Claude (Cowork) session for Team Building Bad: the joint model, the 3D bar layout, the closed-form
geometry, the IS 456 and IS 13920 rules, the fix loop, the IFC and BCF exports, the report, the command line and
the tests. Built in the cloud workspace, tested there (11 tests), then copied into this folder.

Adapted from ORCA (MIT, IssueLab Inc.): the shape of the fix loop and the BCF zip layout and camera. No ORCA code
runs here; see `THIRD_PARTY_NOTICES.md` and `docs/orca-teardown.md`.

## 17 November 2026: the viewer (Build 4)

Built in Google Antigravity (`web/`): Vite, React, TypeScript, three.js, and web-ifc viewer loading `bundle.json`,
`joint.ifc`, and `fixed.ifc` from `rebartwin check`. Renders failing bars red with see-through concrete, 3D-projected
gap and clash labels (`(x, y, z) -> (x, z, -y)` scaled to metres), bar click inspection (with drawing provenance
crop support for `box_2d`), ranked fixes with Before/After toggle, ORCA-style Workings replay over `fix.attempts`,
and IFC/BCF downloads.

## Next: built in Google Antigravity

The Gemini reader, the Gemini fix proposer and the API on Cloud Run, from `prompts/antigravity-build-prompt.md`.
Record each piece here when it lands.

## Data

`examples/c4_b12.json` is the pitch deck's worked example with assumed sizes, checked by hand. Its bottom bars
(4-16) and the 40 mm cover to the column's main bars are assumptions the deck does not state. No customer data.
