# Black River / Logistiq Portal — Developer Team Handoff
Updated: 7/28/2026 | Environment: portal.logistiqinnovations.ca
Companion docs: Dev_Bug_List.md (original audit), Backend_Gap_Note_For_Sant.md (repo gap — now resolved, kept for history)

## ✅ Backend gap resolved
Sant pushed the real deployed backend to `blackRiverBackend` `main` on 2026-07-28 (this replaced/recreated the repo, so the earlier PR #1 there is gone — expected). All previously-missing endpoints now exist: `dispatcher/order`, `dispatcher/trip`, `hr/settlement(+/stats)`, `hr/deduction-addition`, `hr/miles-tracking(+/stats)`, `dispatcher/vehicle/tracking`, `hr/cash-flow-insights`. This unblocked bugs #4, #6 (server-side), #8, #10, #11, #13 — all handled below.

## PRs — all merged, ready to deploy
| PR | Repo / base | Contains |
|---|---|---|
| [blackRiverFrontend#1](https://github.com/Wayneesolutions/blackRiverFrontend/pull/1) | frontend → `ui-update` | **Merged.** Bugs #3, #6 (client-side stopgap, since superseded), #7, #8 (partial), #9, #11 (partial), #12 |
| [blackRiverFrontend#3](https://github.com/Wayneesolutions/blackRiverFrontend/pull/3) | frontend → `ui-update` | **Merged 7/28.** Bug #6 (real server-side wiring, replaces the batch-1 stopgap) |
| [blackRiverBackend#1](https://github.com/Wayneesolutions/blackRiverBackend/pull/1) | backend → `main` | **Merged 7/28.** Bugs #10, #4, #11 (see below) |

All fix branches merged and deleted. `ui-update` (frontend) and `main` (backend) contain everything — **Sant just needs to deploy both.**

## Bug status (numbering matches Dev_Bug_List.md) — 12 of 13 fully resolved

### Fixed by us
- **#1 New Driver save fails silently** — `policies` field requirement removed, `joinDate` now defaults sensibly. *(Superseded: the real backend already had its own, more complete fix for this — no action needed, just confirming it's resolved.)*
- **#3 Customer/Shipper mixup** — order save no longer overwrites the selected Customer with the Shipper. File: `NewOrderSidebar.tsx`.
- **#5 Overlapping payroll runs** — 409 on overlapping periods per driver. *(Superseded: real backend has its own equivalent fix, company-scoped.)*
- **#6 Load Board view tabs** — now use the real `dispatcher/order?loadBoard=...` server-side filter (backend already supported it; frontend just needed the value-mapping and wiring). Files: `distapcher.ts`, `order-list/index.tsx`.
- **#7 Duplicate Drop Off row** — Assignment step dedupes receiver stops identical to the primary receiver. File: `NewOrderSidebar.tsx`.
- **#8 Settlements $0 total** — creation now rejects gross pay ≤ $0. Backend `createSettlement`/`getSettlementStats` logic verified sound (auto-computes from miles×rate when no gross pay given). **The existing STL-2026-001 $0/$0 record is stale data — needs manual DB correction/deletion, not a code fix.**
- **#9 "Create Order" label on edit** — button now shows "Save Changes"/"Saving..." in edit mode. File: `NewOrderSidebar.tsx`.
- **#10 GPS shows no drivers** — root cause found: `getVehiclesWithTracking`'s active-order filter used status values `['in-progress', 'in-delivery', 'planned', 'pending_completion']`, but two of those don't exist in the real Order status enum (`planned/quoted/in-delivery/delivered/completed/canceled/verification_pending/pending_review`), and several valid non-terminal statuses were excluded. Fixed to exclude only terminal statuses. File: `controllers/vehicleController.js`.
- **#11 Orphaned "Unknown" assignees** — root cause found: `deleteDriver` already cascaded deduction/addition cleanup on delete, but `deleteEmployee` and `deleteUser` didn't. Both now cascade the same cleanup, so future deletions won't create orphans. Frontend also shows "Deleted user" instead of "Unknown" and no longer crashes Edit on such rows. Files: `controllers/employee/employeeController.js`, `controllers/user/userController.js`, `settlements/index.tsx`. **Existing orphaned entries ("wtet", "ewrwe") still need manual cleanup.**
- **#12 Fake fuel trucks (T-101…)** — hardcoded `STATIC_TOP_TRUCKS` removed; real aggregation or an honest empty state. File: `fuel-reports/index.tsx`.
- **#4 Finance Dashboard vs Finance Report mismatch** — root cause found: Finance Report's Overview totals were derived from `truckWiseData`, which only includes invoices/expenses tied to a truck — orders without a truck assigned yet were silently excluded. Dashboard sums company-wide totals with no such restriction. Fixed Overview to compute the same broad way as Dashboard (truckWise/tripWise breakdowns unchanged, still correctly truck-scoped). Also fixed the Dashboard's `fleetInvoiceCost`, which read `fi.amount` — a field that doesn't exist on `FleetInvoice` (schema only has `total`), so it always evaluated to 0. Files: `controllers/hr/financeReportController.js`, `controllers/hr/accountsDashboardController.js`.

### Already fixed independently (no action needed — verified only)
- **#2 Employee creation requires password** — the real backend already implements a full invite-email flow: password is optional, a random temp password is generated if omitted, an invite token/email is sent. Frontend (`Users.tsx`) already reflects this (no submission block, UI explains the invite flow). Nothing to do here.

### Not a code bug — ops/config task
- **#13 Cash Flow Insights OpenAI fallback** — the code is correctly implemented: `callOpenAI()` reads `process.env.OPENAI_API_KEY`; when that call fails, a legitimate deterministic fallback calculation runs and correctly labels itself. **Action for Sant: set `OPENAI_API_KEY` in the production environment.** No `.env` is committed to the repo (correct), so this can't be fixed from code.

## Other follow-ups
1. **Driver data loss (flagged while fixing #1, later resolved):** the real backend's `createDriver` now maps the full ~50-field set the New Driver form submits (DOB, license, passport, SIN, pay rates, documents, certifications, etc.) — confirmed already handled, no outstanding work.
2. **Manual data cleanup needed regardless of deploy:**
   - kuldeep singh's 4 overlapping paystubs (pre-existing bad data; the new overlap check only prevents *future* duplicates)
   - settlement STL-2026-001 ($0/$0 — pre-existing bad data)
   - orphaned deduction/addition entries "wtet", "ewrwe" (pre-existing; new deletes won't create more)
3. **Set `OPENAI_API_KEY`** on the production server for bug #13.
4. **Regression retest on the live portal after deploy** — New Driver creation end-to-end, order edit (customer field preserved), payroll duplicate rejection UX, all 5 Load Board views, GPS map driver display, Finance Dashboard vs Finance Report agreement, Cash Flow Insights (after the API key is set).
