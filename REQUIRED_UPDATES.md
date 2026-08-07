# Required Updates — Implementation Notes (Backend)

This document records the backend changes made to satisfy the "Required Updates" request (trial/billing, Super Admin plan management, dashboard stats, GPS access, Fleet Maintenance). The matching frontend changes are documented in `REQUIRED_UPDATES.md` in the `blackRiverFrontend` repo (branch `ui-update`).

Companion repo/branch: [blackRiverFrontend](https://github.com/Wayneesolutions/blackRiverFrontend) @ `ui-update`.

## Summary by requirement

### 1. One-month free trial for new customers
- `utils/trialUtils.js` — `startTrial()` now grants a 1-month trial (`setMonth(+1)`) instead of 7 days. Doc comments and log lines updated to match.
- `controllers/adminManageController.js` — registration success messages ("Your 1-month free trial has started!") updated in both `registerAdmin` and `createAdmin`.
- `services/emailService.js` — trial-start and trial-expired email templates (subject, HTML, and plain-text bodies) updated from "7-day"/"7 days" to "1-month".
- No schema change: `User.trialStartDate` / `trialEndDate` already store real dates; only the duration constant and copy changed.

### 2. Super Admin: assign & display plans per client
- New `Subscription` model field usage: `assignPlanToAdmin` (new function in `controllers/adminManageController.js`) lets a Super Admin manually activate a plan for a specific client (admin account) **without going through Stripe checkout**. It:
  - Loads the target admin + `Plan`, computes `amount`/`currency`/`maxTrucks` using the same pricing rules as the self-service checkout flow (`calculateTruckPricing`, now exported from `controllers/subscriptionController.js`).
  - Supersedes (cancels) any existing active/pending-paid subscription for that admin.
  - Creates a new `Subscription` with `status: 'active'`, `paymentStatus: 'paid'`, no Stripe IDs, and a `planSnapshot` (consistent with how the Stripe checkout flow snapshots plan config at subscription time).
- New route: `POST /api/v1/superadmin/admin/:id/assign-plan` (`superadmin` only) in `routes/superAdminRoute.js`.
- `getAllAdmins` (`controllers/adminManageController.js`) now attaches each admin's current active/pending-paid `Subscription` (with populated `plan`) as `currentSubscription`, so the Super Admin client list can display each client's plan without a second round trip.

### 3. Super Admin panel — "Active" plan toggle
- No backend change required: `Plan.status` (`active`/`inactive`) and `updatePlan` already fully supported this. Only the frontend was missing a one-click toggle (see frontend doc).

### 4. New Employee module
- No backend change required — `employeeController.js` / `employeeRoute.js` already supported everything the improved frontend form needed.
- `routes/employeeRoute.js` — widened `GET /employee` and `GET /employee/:id` to also allow `accountant`, `Compliance Manager`, `Maintenance Crew (Mechanics)` (previously only admin/superadmin/hr/dispatcher/Fleet Maintenance Manager/safety officer), so the new shared GPS Dashboard (item 7 below) can list employees for those roles too. This is view-only (`GET`) — no write access was added.

### 5. Compliance module — dashboard stats
- `controllers/compilance/compilanceController.js` — `getComplianceDashboardData` now returns an `assetCounts` object: `{ trucks, trailers, drivers, gpsOnline }`, computed from the same company-scoped `Vehicle`/`Trailer`/`User` queries already used elsewhere in the function. `gpsOnline` counts vehicles/trailers whose `currentLocation.updatedAt` is within the last 24 hours. Included in both the normal response and the "please complete company setup" zero-state response.

### 6. Accounts module — totals for Drivers/Employees/Trucks/Trailers
- `controllers/hr/accountsDashboardController.js` — `getAccountsDashboard` now returns a `fleetCounts` object: `{ drivers, employees, trucks, trailers }`. Driver/employee counts reuse the `totalDriverCount`/`totalEmployeeCount` already computed in the function for payroll matching; truck/trailer counts are new company-scoped `Vehicle.countDocuments` / `Trailer.countDocuments` calls. Included in both the normal response and the zero-state response.

### 7. GPS dashboard access for every department (view-only)
- All widened routes are **GET-only** — no create/edit/delete access was granted anywhere, so this is genuinely view-only at the API layer, not just hidden in the UI.
- `routes/adminRoute.js` — `GET /admin/vehicles/live`, `/admin/vehicles/list`, `/admin/vehicle-details/:id`, `/admin/gps-vehicle/dashboard-stats` widened from `admin, superadmin, dispatcher(, hr, Compliance Manager)` to also include `hr, accountant, Fleet Maintenance Manager, Compliance Manager, safety officer, Maintenance Crew (Mechanics)`.
- `routes/dispatcherRoute.js` — `GET /dispatcher/driver` and `GET /dispatcher/vehicle/tracking` (the endpoints the actual GPS drivers/tracking pages use) widened to also include `accountant, safety officer, Maintenance Crew (Mechanics)` (they already allowed hr/Fleet Maintenance Manager/Compliance Manager).
- `routes/employeeRoute.js` — see item 4 above.
- `PUT /admin/company/maintenance-policy` — see item 8 below.

### 8. Fleet Maintenance module
- **Preventive maintenance settings**: `routes/adminRoute.js` — `PUT /admin/company/maintenance-policy` widened to allow `Fleet Maintenance Manager` (previously admin/superadmin only), so Fleet Managers can configure service intervals themselves. The underlying model (`CompanySettings.maintenancePolicies.customServices`) and controller (`controllers/company/companySettingsController.js`) were already fully built — no other backend change needed.
- **Work orders → Mechanics Portal → completion → invoices**: already fully implemented end-to-end via the `GeneralRepair` model/controller (`models/fleet/generalRepairModel.js`, `controllers/fleet/generalRepairController.js`) — Fleet Manager creates/assigns work orders, mechanics see and complete them via dedicated Mechanics Portal endpoints, a Fleet Manager verification step exists, and Fleet Maintenance Invoices are generated from completed+verified repairs. **No backend changes were needed here** — this was verified by code review, not a fresh build. See the frontend doc for the dead-code cleanup (an unrouted, competing "Work Order" page/API) that was removed.

## Cross-cutting notes / known pre-existing issues NOT touched by this pass
- Two parallel "vehicle" models (`Vehicle` vs `FleetUnit`) and two parallel "work order" models (`WorkOrder` vs `GeneralRepair`) coexist in the codebase. This pass did not consolidate them — only `GeneralRepair` (the one actually used by the live UI) was relevant to the Fleet Maintenance requirement.
- Some routes authorize the role string `'accounts'`, which is not a valid value in the `User.role` enum (only `'accountant'` is). Pre-existing, not touched.
- A second, unused trial-check middleware (`middleware/checkTrial.js`) exists alongside the one actually wired into `authMiddleware.js`. Pre-existing, not touched.

## Verification performed
- `node --check` (syntax) passed on every modified file.
- **Not performed**: live end-to-end testing against a real database (no `.env`/credentials were available in this environment — no MongoDB URI, JWT secret, Stripe keys, etc.). Before merging, please run this against a real/staging environment and exercise at minimum: registration → 30-day trial, Super Admin manual plan assignment, the 4 widened GPS endpoints per role, and the Fleet Maintenance Manager maintenance-policy update.

## Files changed
```
controllers/adminManageController.js
controllers/compilance/compilanceController.js
controllers/hr/accountsDashboardController.js
controllers/subscriptionController.js   (calculateTruckPricing exported)
routes/adminRoute.js
routes/dispatcherRoute.js
routes/employeeRoute.js
routes/superAdminRoute.js
services/emailService.js
utils/trialUtils.js
```
