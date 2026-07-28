# Backend Repo Gap — Order/Trip API Missing From GitHub
Assigned to: Sant | Noted: 7/25/2026 | Found during QA-audit bug fixing

## Problem
The backend code running the live portal (portal.logistiqinnovations.ca) does not match
what is in the GitHub repo `Wayneesolutions/blackRiverBackend` (branch `main`, latest
commit `aa6c111` "updated service", 2025-10-16).

The frontend (`blackRiverFrontend`, branch `ui-update`) makes calls to these endpoints:

- `GET/POST/PUT dispatcher/order` (Order List, Order wizard — create/edit/list orders)
- `GET dispatcher/trip` + trip start/complete/approve endpoints (Trips / Load Board page)
- `GET hr/cash-flow-insights` (Cash Flow Insights page)
- `GET/POST/PUT hr/settlement` + `hr/settlement/stats` (Settlements page)
- `GET/POST/PUT hr/deduction-addition` (Deductions & Additions tab)
- `GET/POST/PUT hr/miles-tracking` + `hr/miles-tracking/stats` (Miles Tracking tab)
- `GET dispatcher/vehicle/tracking` (GPS Live Fleet Map / TruckTracker)

**None of these routes exist anywhere in the backend repo.** The only similar resource is
`/load` (models/loadModel.js) — an older, differently-shaped model with no
`orderNumber`/`customerOrderNo` fields. A repo-wide grep for `orderNumber` /
`customerOrderNo` returns zero hits.

Yet the live portal serves real order data (e.g. order 000267 / DEMO-ORDER-001 seen
during the audit), so the deployed server must be running newer/different code that was
never pushed to this repo.

## What was checked (all dead ends)
- `blackRiverBackend` remote branches: only `main` exists.
- `Wayneesolutions/VirtualStaggingBackend` (referenced in package.json metadata): an older
  ancestor (last commit Aug 2025), also has no order/trip routes.
- Public GitHub API listing of the Wayneesolutions account: no other candidate repo.

## What Sant needs to do
1. Locate the actual source code running on the production server (check the server
   itself — e.g. the deployed directory / PM2 config / Docker image — or a developer's
   local copy that was deployed directly).
2. Push that code to `blackRiverBackend` (or a new branch) so the repo reflects
   production.
3. Until then, these audit bugs are blocked because they can't be fixed/verified against
   the real API:
   - **Bug #6** — Load Board view tabs don't filter (a client-side stopgap has been
     applied in the frontend; real server-side filtering still needs the backend).
   - **Bug #13** — Cash Flow Insights "OpenAI service unavailable" (the endpoint isn't in
     the repo at all).
   - **Bug #8** — Settlements $0 totals: root cause is the settlement record itself being
     created with $0 gross/net. Frontend now blocks creating $0-gross settlements, but
     the settlement creation/calculation endpoint (hr/settlement) isn't in the repo, so
     auto-computing pay from actual payroll/miles data can't be implemented.
   - **Bug #10** — GPS map "No driver assigned": frontend correctly reads a populated
     `vehicle.driver`; the Vehicle model has the `driver` ref. The deployed
     `dispatcher/vehicle/tracking` endpoint either doesn't populate it, or dispatch
     assignments (stored on orders/trips) are never written to Vehicle.driver. Both
     possibilities live in backend code not present in this repo.
   - **Bug #11** — Orphaned "Unknown" assignments: frontend now shows "Deleted user" and
     no longer crashes when editing an orphaned row, but preventing/cleaning orphaned
     references needs the hr/deduction-addition backend.
   - Any other fix touching orders/trips (parts of #3, #4 verification).

## Context
Six audit bugs have already been fixed on local branches `fix/qa-audit-batch-1` in both
repos (not yet pushed): #1, #3, #5, #7, #9, #12. See Dev_Bug_List.md for the full audit.
