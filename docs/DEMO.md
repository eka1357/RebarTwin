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

**Pre-stage at least 15 minutes before a 3-minute pitch.** Even with saved replies in `REBARTWIN_REPLIES_DIR`, reading all 10 A1 sheets (`pages 7-9,15-21`) takes about 3 to 4 minutes on CPU for PNG rasterization, OCR, and geometry alignment, which is too slow for a 3-minute pitch. Upload and read the drawing set before the session, and open the already-read project directly during the demo.

### A. Pre-stage (at least 15 minutes before presenting)

1. Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) and click **Upload drawings**.
2. In **Pages (optional)**, enter `7-9,15-21`.
3. Click **Upload a drawing set** (or drag and drop `uploads/iith-director-residence-structural.pdf`).
4. Let **ReadingBoard** and **ReadingLog** finish all 10 pages from `REBARTWIN_REPLIES_DIR` (`103` cached calls, `0` uncached calls, ~`130 s` on CPU) until the app navigates to `/projects/<id>`.
5. Bookmark or note that `/projects/<id>` URL (currently pre-staged on `master` as `iith-director-residence-structur-ve7h`, the only live project listed by `GET /projects`) and keep both servers running.

### B. Live pitch click path (starts from the already-read project)

1. Open the pre-read project overview at `http://127.0.0.1:4173/projects/iith-director-residence-structur-ve7h` (do not re-upload during the pitch):
   - Initial counts before answering zone and exposure: `301` accepted values, `45` joints found (`0` checked, `45` blocked), `1,340` To check items (`1,009` blocking, `331` non-blocking, `2` project-level), and `35` **Beam-on-beam junctions** shown as **Information**.
   - On `iith-director-residence-structur-ve7h`, Zone II (`tc_1642`) and mild exposure (`tc_1643`) are already answered for direct rehearsal: `45` joints found, `1` checked (`1` failing, `44` blocked), and `1,338` unresolved To check items (`1,007` blocking, `331` non-blocking, `0` project-level).
2. If rehearsing from a fresh upload before resolution, click **Resolve project items** (or **To check** in the header) to open `/projects/iith-director-residence-structur-ve7h/review` (blocking items appear first):
   - Confirm **ALL · seismic_zone** (`tc_1642`) using quick chip **Zone II (IS 13920 off)**.
   - Confirm **ALL · exposure** (`tc_1643`) using quick chip **Mild**.
3. Return to **Project** overview and click **Joint** on **C1xXB17@FIRST@L1+M+M1-28**:
   - Answering `seismic_zone = II` and `exposure = mild` unlocks `C1xXB17@FIRST@L1+M+M1-28` immediately (`9 Fails`: `8` clashes between `XB17`'s outer bars and `C1`'s 12 mm face bars, plus `1` bar gap at `IS 456 cl. 26.3.2`; `fix.status = "fixed"`, `78` of `102` candidates pass every rule, best fix `XB17 top: 2-16 in layer 1, 2-12 in layer 2; C1 face bars at y = -40, 40 mm`). Its row displays `C1 200 × 450 (4-16 corners + 4-12 faces) · XB17 200 × 450`.
4. In the **3D Joint Workspace**, verify `4-16 corners + 4-12 faces` in the Inspector header and Column `C1` `SectionGlyph`, toggle concrete visibility, pick a failing bar or finding, inspect the **Fix** tab (`XB17 top: 2-16 in layer 1, 2-12 in layer 2; C1 face bars at y = -40, 40 mm`), and open **Source** to show the red bounding box over real CAD schedule/plan sheets (`Agreed`, `Geometry`, `Resolved`, and `Assumed, not on the drawing`).
5. Click **Report** to open `/projects/iith-director-residence-structur-ve7h/report?joint=C1xXB17%40FIRST%40L1%2BM%2BM1-28`, verify the light-theme A4 layout, mixed corner/face column glyphs, failing-check grouping, assumptions, provenance ledger, sign-off block, and `joint.ifc` / `fixed.ifc` / `issues.bcf` export links, and click **Print or save as PDF** (`window.print()`).

## 4. Offline Fallbacks If Network or API Fails

### First fallback (`/demo/iit`): Real Pre-Checked IIT Joint (`C1xXB17@FIRST@L1+M+M1-28`)

The checked IIT bundle, `option_scenes`, `attempt_scenes`, `joint.ifc` / `fixed.ifc` / `issues.bcf` exports, and PNG page crops (`pages/*.png`) live in `web/public/live/iit-demo/` (git-ignored) and run completely offline with the API stopped:

```powershell
cd web
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open [http://127.0.0.1:4173/demo/iit](http://127.0.0.1:4173/demo/iit):

- **3D & Findings**: inspects `C1 200 × 450 mm` (`4-16 corners + 4-12 faces`) and `XB17 200 × 450 mm` with all `9 Fails` (`8` clashes between `XB17` and `C1`'s 12 mm face bars + `1` bar gap at `IS 456 cl. 26.3.2`).
- **Source**: opens real CAD schedule and plan crops from `/live/iit-demo/pages/` (`Agreed`, `Geometry`, `Resolved`, and `Assumed, not on the drawing`).
- **Fix**: shows Option #1 (`XB17 top: 2-16 in layer 1, 2-12 in layer 2; C1 face bars at y = -40, 40 mm`), `Recheck` (no redesign), moved **After column** `SectionGlyph`, effective depth drop (`410 -> 395 mm`), and the 5 mm placing tolerance note.
- **Report**: click **Report** (or **Use in report** -> **Open report**) to open `/demo/iit/report` with light-theme A4 layout, failing-check grouping, Before/After `SectionGlyph`s, flags, provenance ledger, sign-off block, and static `.ifc` / `.bcf` downloads.

### Second fallback (`/demo`): Worked Example (`C4 × B12`)

Everything under `/demo` is pre-cached inside `web/public/demo/` and also runs completely offline with the API stopped.

Open [http://127.0.0.1:4173/demo](http://127.0.0.1:4173/demo):

- Press **Space** to step through the 5-beat guided tour on `C4 × B12`:
  1. Six IS 456 + Geometry failures in 3D.
  2. Source provenance note (pitch-deck worked example).
  3. Best verified fix (`2-25 over 2-20`, `1,610 mm²`) with `700 ms` animated rebar morph and effective-depth `Recheck` flag (`21 mm` drop).
  4. **Workings** replay across every tried arrangement (`Gemini` proposer + `Enumerator`, rejecting clauses, `Failed only` filter).
  5. Switch to **Zone III** (`IS 13920 on`): shows all 7 failures including the `300 mm · needs 400 · IS 13920 cl. 7.1.1` column depth check and why bar edits alone cannot pass (`Redesign`: `325 × 300`, `4-16 over 4-16`).
- Click **Report** (or **Use in report** -> **Open report**) to demonstrate the single-page A4 print output and download `joint.ifc`, `fixed.ifc`, or `issues.bcf`.

## 5. Public Cloud Run Deployment (`asia-south1`, `DEMO_ONLY=true`)

RebarTwin deploys as a single Cloud Run service (`Dockerfile`) where FastAPI serves both the built `web/dist` web app and `/api/*`. Public mode (`DEMO_ONLY=true`) is enabled by default with zero API keys in the container: `/demo` and `/demo/iit` work interactively, while uploads, `To check` edits, and all Gemini/Vision calls are blocked (`403 application/problem+json`).

**Live URL:** [https://rebartwin-17371270384.asia-south1.run.app](https://rebartwin-17371270384.asia-south1.run.app) (direct `/demo`, `/demo/iit`, and `/demo/iit/report` work on phone and laptop; `/api/health` returns `{"status":"ok","demo_only":true}`).

### Local single-service check (`DEMO_ONLY=true`)

```powershell
cd web && npm run build && cd ..
$env:DEMO_ONLY="true"
uv run uvicorn rebartwin.api:app --host 127.0.0.1 --port 8080
```

### Enable APIs and deploy / redeploy

`.gcloudignore` includes `web/public/live/iit-demo/` (for `/demo/iit`) and excludes `.env`, `uploads/`, `.venv/`, `out/`, and every other `web/public/live/*` folder.

```powershell
gcloud auth login
gcloud config unset billing/quota_project
gcloud config set project rebartwin
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=rebartwin
gcloud run deploy rebartwin --source . --project=rebartwin --region=asia-south1 --allow-unauthenticated --set-env-vars="DEMO_ONLY=true" --memory=1Gi
```

Run the same `gcloud run deploy rebartwin --source . ...` command to redeploy after code or data changes.

### Turn it off after judging

Revoke public unauthenticated access or delete the service:

```powershell
gcloud run services remove-iam-policy-binding rebartwin --project=rebartwin --region=asia-south1 --member="allUsers" --role="roles/run.invoker"
# Or remove the Cloud Run service completely:
gcloud run services delete rebartwin --project=rebartwin --region=asia-south1
```
