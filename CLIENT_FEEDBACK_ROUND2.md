# Client Feedback — Round 2 Implementation Notes (Backend)

This document records the backend changes made in response to the client's written feedback (`Implementation Review – Business Observations and Feedback.pdf`) on the Round 1 "Required Updates" work. See `REQUIRED_UPDATES.md` for Round 1. Matching frontend changes are documented in `CLIENT_FEEDBACK_ROUND2.md` in the `blackRiverFrontend` repo.

## Summary by feedback item

### 1. Configurable trial length
Trial length was hardcoded to 1 month (Round 1). Client wants it fully controllable: a global default, plus a per-customer override.

- `models/driver/userModel.js` — added `defaultTrialDays: { type: Number, default: null }`. Stored on the Super Admin's own `User` document, since that's what already backs "system settings" in this app (there's no separate singleton settings collection).
- `controllers/superAdminSettingsController.js` — `getSuperAdminSettings`/`updateSuperAdminSettings` now read/write `defaultTrialDays`.
- `utils/trialUtils.js` — new `resolveDefaultTrialDays(explicitDays)` helper: uses `explicitDays` if a valid positive number was given, otherwise looks up the earliest-created superadmin's `defaultTrialDays`, otherwise falls back to `30`. `startTrial(adminId, trialDays)` now uses `trialEndDate.setDate(+trialDays)` instead of the hardcoded `setMonth(+1)`.
- `controllers/adminManageController.js`:
  - `createAdmin` (Super-Admin-driven client creation) accepts an optional `trialDays` in the request body — the Super Admin's per-customer override.
  - `registerAdmin` (public self-signup) has no such field in its form; it resolves the trial length via `resolveDefaultTrialDays()` with no explicit value, i.e. always uses the configured global default (or 30).
- `services/emailService.js` — trial-start/trial-expired email subject and body copy no longer say "1-month"; the start email now computes and shows the actual trial length (`${trialLengthDays}-Day Free Trial`), and the expiry email just says "free trial period" without naming a specific length (it doesn't have the start date to compute one).

### 2. Super Admin: custom plan builder per customer
Client: "we shouldn't be limited to fixed plans... build a custom plan for each customer by choosing the modules, truck limits, billing options."

`assignPlanToAdmin` (built in Round 1) already assigns a plan to a client without Stripe, with a `planSnapshot` on the `Subscription`. Extended to accept per-customer overrides on top of the template plan:
- `customAmount` — overrides the computed price for this customer only (the template `Plan` document is untouched).
- `allowedRoles` / `blockedRoles` — overrides which staff roles this specific customer's account can create, stored into `Subscription.planSnapshot` instead of copied verbatim from the `Plan`.
- `truckCount` (already existed) — per-customer truck limit.

The preset plans in Super Admin → Billing remain as reusable templates; nothing about the base `Plan` model changed.

### 3. Active Plan Toggle / customer self-service
Client: "Customers shouldn't be able to browse or manage plans... Everything related to plan management should stay with the Super Admin."

- `controllers/subscriptionController.js` — added a guard at the very top of `createCheckoutSession` and `extraTruckCheckoutSession` that returns `403 Self-service plan changes are disabled. Please contact your account manager.` before any Stripe logic runs, gated behind `process.env.ENABLE_SELF_SERVICE_CHECKOUT === 'true'` (defaults to disabled). This blocks direct API calls even if someone bypasses the UI. The Stripe integration code itself was **not deleted** — it's intact below the guard and can be re-enabled by setting that env var, per the "hide don't delete" decision. `cancelSubscription` was left as-is (not gated) — see the matching frontend doc for how the UI now hides it.

### 4. Bug fix: Employee module hourly rate
Client: "Please fix the hourly rate functionality, as it's essential for payroll."

Root cause (confirmed by tracing the whole path): the Employee module's "Pay Rate (per hour)" field saved to `details.payRate`, but every payroll calculation path (`payrollController.js`, `automatedPayrollController.js`, `driverPayrollAIController.js`) reads a different field, `details.hourlyRate` — populated only by a separate Driver-management form. So any employee whose pay was set through the Employee module always computed to $0 in payroll. A second bug compounded it: `updateEmployee` reset `details.hourlyRate` to `0` on every save with no fallback, silently wiping out correctly-set rates on unrelated edits (e.g. just changing a phone number).

Fix — aligned the Employee module to write the field payroll already reads, rather than changing every payroll consumer:
- `controllers/employee/employeeController.js`:
  - `createEmployee` — when `payType === 'Hourly'`, also sets `details.hourlyRate = Number(payRate)`.
  - `updateEmployee` — same sync on update, **plus** the rate fields (`hourlyRate`, `mileRate`, `mileRateTeam`, `emptyMileRate`, `weightRate`, `percentageRate`) now fall back to the previously stored value when not provided in the request, matching the pattern already used for `wsib`/`companyFlag`/`csa`/`medicalRequired` in the same function — so an unrelated edit no longer zeroes them out.
- `models/driver/userModel.js` — expanded the `payType` enum to include `'Biweekly'`, `'SemiMonthly'`, `'Monthly'` (the frontend's actual dropdown options) alongside the pre-existing `'Hourly'`/`'Salary'`/`'Commission'`/`'Per Trip'`/`'Per Mile'` — previously saving anything but `'Hourly'` from that dropdown would have failed Mongoose enum validation.

### 8b/8c. Fleet Maintenance invoices visible to Accounts
Client: "invoices should be available to both Fleet Maintenance and Accounts... for billing, expense tracking, and financial reporting."

Confirmed by code trace: the Accounts Finance Report page already calls `getFleetInvoices()` to populate a "Payables" list, but the request 403'd for `accountant` users and failed silently (wrapped in `Promise.allSettled`) — so the feature existed in the frontend but was blocked purely by the backend role list.

- `routes/adminRoute.js` — added `'accountant'` to the three **read-only** fleet-invoice routes: `GET /fleet-invoices`, `GET /fleet-invoices/summary`, `GET /fleet-invoices/:id`. Create/update/delete/status/email/upload-extract remain restricted to Fleet Maintenance Manager/admin/superadmin — Accounts can see invoices, not manage them.

## Not changed in this round
- Items 5, 6, 7, and 8a from the client's feedback (Compliance dashboard, Accounts dashboard, GPS Dashboard, Fleet Maintenance's due/overdue reminders) were confirmed already satisfied by Round 1 — the client's comments there were agreement/context, not defect reports.

## Verification
- `node --check` passed on every modified file.
- Live end-to-end testing against a real database is still not possible in this environment (no `.env`/credentials) — see the frontend doc's verification section for what was checked via a live dev-server pass instead.

## Files changed
```
controllers/adminManageController.js
controllers/employee/employeeController.js
controllers/subscriptionController.js
controllers/superAdminSettingsController.js
models/driver/userModel.js
routes/adminRoute.js
services/emailService.js
utils/trialUtils.js
```
