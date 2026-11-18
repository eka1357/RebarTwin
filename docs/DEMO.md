# Demo Runbook (`RebarTwin`)

Commands, click path for the live structural drawing walkthrough, and offline fallback for venue demos.

## 1. Fresh Laptop Setup

1. Install Python dependencies (`Python >= 3.10`, `uv`) and the web viewer dependencies (`Node >= 20`):

   ```powershell
   uv sync --extra ifc --extra reader --extra api
   cd web
   npm install
   npm run build
   cd ..
   ```

2. Copy `.env.example` to `.env` and fill in local settings (never commit `.env` or PDFs):

   ```dotenv
   # Optional for live un-cached calls; not needed when REBARTWIN_REPLIES_DIR holds saved replies
   GEMINI_API_KEY=
   VISION_API_KEY=

   # Shared reply cache so uploading the demo PDF replays saved readings cleanly with zero API cost
   REBARTWIN_REPLIES_DIR=out/_replies
   ```

   If your saved IIT drawing replies live in another folder (for example `out/iith-t3000/replies`), point `REBARTWIN_REPLIES_DIR` at that folder before starting the API.

## 2. Start the API and Production Web Preview

Run in two terminals from the repository root:

- **Terminal 1 (FastAPI service on `127.0.0.1:8000`):**

  ```powershell
  uv run uvicorn rebartwin.api:app --host 127.0.0.1 --port 8000
  ```

- **Terminal 2 (Vite production preview on `127.0.0.1:4173`, proxying `/api/*` to port `8000`):**

  ```powershell
  cd web
  npm run preview -- --host 127.0.0.1 --port 4173
  ```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) in Chrome.

## 3. Live Drawing Click Path (IIT Hyderabad Residence Set)

1. From the landing page, click **Upload drawings**.
2. In **Pages (optional)**, enter `7-9,15-21`.
3. Click **Upload a drawing set** (or drag and drop `uploads/iith-director-residence-structural.pdf`).
4. Watch **ReadingBoard** stream pages `7`, `8`, `9`, `15` through `21` and **ReadingLog** log dual-channel progress using the saved replies in `REBARTWIN_REPLIES_DIR` (zero live Gemini tokens when cached; takes about 3 to 4 minutes on CPU for first-time A1 PNG rasterization and geometry alignment). When reading finishes, the app navigates to the project overview `/projects/<id>`.
5. On **Joints Overview** (`/projects/<id>`):
   - Review the summary counts (`53` joints found across the 10 sheets, initially blocked by `To check`), **Failures by rule**, sorted **Joints** rows (failing first, then blocked and `Draft` joints showing accepted values beside `not on the drawing yet` for nulls, then passing), and **Beam-on-beam junctions (`35`)** shown as **Information**.
6. Click **Resolve project items** (or **To check** in the top navigation bar) to open `/projects/<id>/review`.
   - Confirm **ALL · seismic_zone** using quick chip **Zone II (IS 13920 off)**.
   - Confirm **ALL · exposure** using quick chip **Mild**.
7. Return to **Project** overview and open **C1xXB17@FIRST@L1+M+M1-28**:
   - Note that resolving the project-level zone and exposure reduces its blockers cleanly (`6` to `3`), while joint-specific items from the drawing remain visible (`C1 · column.main` mixed `4-16 + 4-12` bars and `beams[0].stirrups` missing links).
   - If the joint is still blocked when clicked, follow **Go to To check** to open `?joint=C1xXB17%40FIRST%40L1%2BM%2BM1-28`, confirm `column.main` (for example `8-16`) and `beams[0].stirrups` (`8@150`), and the API checks `C1xXB17@FIRST@L1+M+M1-28` immediately (`9` failures across `Geometry` and `IS 456 cl. 26.3.2`).
8. Inspect the unlocked **3D Joint Workspace**: toggle concrete visibility, pick a failing bar or finding, and open the **Source** tab to see the red bounding box over real CAD schedule/plan sheets (`Agreed`, `Geometry`, `Resolved`, and `Assumed, not on the drawing`).
9. Click **Report** to open `/projects/<id>/report?joint=C1xXB17%40FIRST%40L1%2BM%2BM1-28`, verify the light-theme A4 layout, failing-check grouping, assumptions, provenance ledger, sign-off block, and `joint.ifc` / `issues.bcf` export links, and click **Print or save as PDF** (`window.print()`).

## 4. Offline Fallback (`/demo`) If Network Fails

Everything under `/demo` is pre-cached inside `web/public/demo/` and runs completely offline with the API stopped:

```powershell
cd web
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open [http://127.0.0.1:4173/demo](http://127.0.0.1:4173/demo):

- Press **Space** to step through the 5-beat guided tour on `C4 × B12`:
  1. Six IS 456 + Geometry failures in 3D.
  2. Source provenance note (pitch-deck worked example).
  3. Best verified fix (`2-25 over 2-20`, `1,610 mm²`) with `700 ms` animated rebar morph and effective-depth `Recheck` flag (`21 mm` drop).
  4. **Workings** replay across every tried arrangement (`Gemini` proposer + `Enumerator`, rejecting clauses, `Failed only` filter).
  5. Switch to **Zone III** (`IS 13920 on`): shows all 7 failures including the `300 mm · needs 400 · IS 13920 cl. 7.1.1` column depth check and why bar edits alone cannot pass (`Redesign`: `325 × 300`, `4-16 over 4-16`).
- Click **Report** (or **Use in report** -> **Open report**) to demonstrate the single-page A4 print output and download `joint.ifc`, `fixed.ifc`, or `issues.bcf`.
