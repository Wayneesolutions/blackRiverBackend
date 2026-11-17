# Logistiq Accounts Handover: Double-Test Fixes (17 Nov 2026)

**Portal:** portal.logistiqinnovations.ca (still demo/test data only)
**Repos:** Wayneesolutions/blackRiverBackend, Wayneesolutions/blackRiverFrontend
**Branch (both repos):** `fix/accounts-double-test-17nov`

| Repo | PR | Status |
|---|---|---|
| Backend | [#29](https://github.com/Wayneesolutions/blackRiverBackend/pull/29) | Open, not merged |
| Frontend | [#37](https://github.com/Wayneesolutions/blackRiverFrontend/pull/37) | Open, not merged |

---

## 1. Summary

| # | Bug from the double test | Status |
|---|---|---|
| 1 | Trailer shows its raw ID instead of TRL-203 in Fleet & Maint. Finance | Fixed (backend) |
| 2 | Expense date defaults to the previous day before 5:30 AM IST | Fixed (frontend) |
| 3 | Expense list doesn't update after saving an expense with no employee | Fixed (frontend + backend) |
| 4 | Driver payroll AI fills in its bonus by itself ($2,931) | Changed: now a suggestion only |
| 5 | Driver Payroll $29,312.01 vs Settlement $29,312.04 (3¢) | Fixed (backend) |
| 6 | O/O settlement: rate per mile empty → gross $0, net negative | Fixed (backend + frontend) |
| 7 | Order invoice shows $0 because the order's rate is 0 | Partly fixed; waiting on client |
| 8 | Gross Payroll shows 3 paystubs, Employees Payroll has 10 records | Fixed (backend) |
| 9 | Dispatch #14 | Waiting on client |

Note: the earlier report said items 1 and 2 were already fixed in "follow-up patches". No such patch existed in either repo, so both bugs were still live. They're fixed in these PRs.

---

## 2. Deploy steps

> **Important:** the server serves the frontend from the **backend repo's `dist.zip`**. Before this PR, the backend's `dist.zip` hadn't been updated since 16 Nov 10:34. So the frontend fixes from late 16 Nov (commits `024bd73`, `684b9be`) were probably **not live** during the double test. Backend PR #29 has a fresh `dist.zip` with **all** frontend fixes, including this round's.

1. Merge **frontend PR #37** first (it keeps the frontend repo in sync), then **backend PR #29**.
2. On EC2 `i-0e92973d9d4328fa7` (us-east-1, user `ubuntu`):
   ```bash
   cd ~/logistiqbackend
   git pull origin main
   pm2 restart all --update-env
   cd ~/frontend
   sudo rm -rf dist
   sudo unzip -o ~/logistiqbackend/dist.zip -d ~/frontend/dist
   ```
3. Hard refresh the browser (Ctrl+Shift+R) before retesting.

No DB migration. No new env variables.

**Rebuilding the frontend locally:** `npm run build` needs `.env.production.local` (git-ignored):
```
VITE_APP_BASE_URL=https://portal.logistiqinnovations.ca/api/v1
VITE_SOCKET_URL=https://portal.logistiqinnovations.ca
```
Then zip the **contents** of `dist/` (index.html at the zip root) and copy the zip to the backend repo as `dist.zip`.

---

## 3. What changed, bug by bug

### 1. Trailer raw ID in Fleet & Maint. Finance
**File:** `controllers/fleet/fleetMaintenanceFinanceController.js` (`getMaintenanceExpenseSummary`)
- **Cause:** a trailer was named only if it was in the company-scoped unit lists, or if it first showed up through an expense. If a repair, service or parts record saw the trailer first, its raw ID got registered as the name, and later lookups skipped it.
- **Fix:**
  - At the end of the report, every unit still named by its ID is looked up across FleetUnit, Vehicle and Trailer.
  - `trailer-` / `vehicle-` / `custom-` prefixes (from the fleet units list) are stripped.
  - Trailer name order is now `trailer` (the trailer number) → `unitNumber` → `internalId` → plate. This matches the fleet units list.
  - A unit that no longer exists shows as `Trailer (deleted) …1a2b` instead of a 24-character ID.

### 2. Expense date one day off
**Files:** all Accounts pages that default a date to "today": `expenses`, `payroll`, `driverpayroll`, `invoice`, `payables`, `receipts-notes`, `staff`, `config`, `fleet-maintenance`
- **Cause:** `new Date().toISOString().split('T')[0]` gives the **UTC** date. In India it's yesterday before 5:30 AM. In Canada (the client) it's **tomorrow** after about 6–7 PM.
- **Fix:** replaced with the existing helper `todayLocalISO()` from `src/utils/fuelDate.ts`.
- Other sections outside Accounts still use the old pattern (about 40 files). This round didn't touch them.

### 3. Expense list not updating after save
**Files:** `src/pages/admin/accounts/expenses/index.tsx`, `controllers/user/expenseController.js`
- **Frontend:** the saved or edited expense shows in the list immediately (from the save response), then the list and the stat cards refresh.
- **Backend `getExpenses`:** used to run 2–4 DB queries plus several `console.log` lines **per expense**, which got slow as expenses grew. Now it uses 3 batch queries in total.
- **Also fixed:**
  - Trailer-model trailers now show their trailer number in the expense list.
  - **Editing** an expense used to silently drop a truck or trailer that is a Vehicle/Trailer, because update only checked FleetUnit. Now it checks both.
  - The create/update response now includes Vehicle/Trailer-model units. Before, populate set them to null.

### 4. AI bonus filled in automatically
**Files:** `src/pages/admin/accounts/driverpayroll/index.tsx`, `controllers/hr/driverPayrollAIController.js`
- **Decision:** the AI bonus and deductions are **suggestions only**.
- **Single AI analysis:** nothing is filled in. The analysis card shows "Suggested Bonus / Suggested Deductions" with a **Use suggestion** button.
- **Bulk AI:** the backend returns `bonus: 0` plus `recommendedBonus`. Gross and tax no longer include the AI bonus. Under each Bonus field the UI shows "AI suggests $X · Use".
- If the client wants the old auto-fill back, it's a small revert.

### 5. 3¢ rounding difference
**Files:** `controllers/orderController.js` (`getCompletedOrdersByDriver`, which the Driver Payroll page uses), `controllers/hr/driverPayrollAIController.js` (2 places)
- **Cause:** Driver Payroll did `unrounded miles × rate`. Settlement does `miles rounded to 2 decimals × rate`.
- **Fix:** Driver Payroll rounds miles first too, so pay = shown miles × rate and both screens match.
- **Existing payrolls are not recalculated.** Only new ones change.

### 6. O/O settlement rate empty
**Files:** `controllers/hr/settlementController.js` (`getTruckWork`), `src/components/accounts/TruckSettlementModal.tsx`
- **Cause:** the test owner-operator has no mile rate on their profile, so the rate was 0.
- **Backend:** if the profile has no rate, the rate from **this truck's last settlement** is used (solo/team/empty). The response has `rates.source`: `entered` / `profile` / `lastSettlement` / `none`.
- **Frontend:**
  - An empty rate is outlined in red with a hint.
  - If the rate came from the last settlement, the modal says so.
  - **A settlement with $0 gross can't be saved.**
- If the truck has no previous settlement, the rate still starts empty and has to be typed. That's expected.

### 7. Order invoice $0
**Files:** `controllers/orderController.js` (`updateOrder`), `src/pages/admin/accounts/invoice/index.tsx`
- The auto-invoice uses `order.totalAmount || order.rate`. Both are 0 on the test orders, so this is mostly test data.
- **Added:**
  - When an order's rate or total is set later, its **unpaid $0 invoice** is updated with the new amount.
  - $0 invoices show "No rate on order" in the list.
- **Open:** what the client explained "yesterday" about invoicing is still unknown. Get it from the client before changing invoice logic further.

### 8. Gross Payroll missing paystubs
**File:** `controllers/hr/paystubController.js`
- **Cause:** a paystub was written inside a try/catch while the payroll was being created. Any error was swallowed, so the payroll existed with no paystub. Payrolls made by other screens had none either.
- **Fix:** `GET /hr/paystubs` first finds payrolls (same company, user and date filter) that have no paystub, and builds one from the stored payroll:
  - earnings, with bonus and itemised additions with memos
  - deductions, with memos
  - taxes, net pay, hours, driver miles, company details
- New exported helpers: `buildPaystubFromPayroll`, `backfillMissingPaystubs`.
- **Not fixed:** the root cause of the failing paystub creation inside `createPayroll`. The real error is still in the PM2 logs. Search `pm2 logs` for `Error creating paystub`.

### 9. Dispatch #14
Nothing changed. We need the client's exact order problem (which order and what goes wrong) to retest.

---

## 4. Retest checklist (after deploy)

- [ ] **Fleet & Maint. Finance:** the trailer shows **TRL-203**, not a long ID. Check the trailer filter and the Excel export too.
- [ ] **Expenses:** before 5:30 AM IST (or on any device), the Add Expense date = today's local date.
- [ ] **Expenses:** save an expense with **no employee**. It appears at the top immediately and the stat cards update.
- [ ] **Expenses:** edit an expense that has a truck/trailer and save. The truck/trailer is still attached.
- [ ] **Driver Payroll → AI analysis:** Bonus stays empty/0. "Use suggestion" fills in $2,931 (or whatever the AI says).
- [ ] **Driver Payroll → Bulk AI:** Bonus = 0. "AI suggests $X · Use" works.
- [ ] **Rounding:** create a **new** driver payroll and a settlement for the same trip. The totals match to the cent.
- [ ] **Settle by Truck (O/O):** with no profile rate, the rate is red and Create is blocked at $0. After typing a rate, gross and net are correct. Retest the same truck later: the rate pre-fills "From this truck's last settlement".
- [ ] **Invoices:** a $0 invoice shows "No rate on order". Set a rate on that order and the invoice amount updates.
- [ ] **Gross Payroll:** the count matches Employees Payroll (10). Open a backfilled paystub: earnings, memos and net look right. Download the PDF.
- [ ] **Smoke test:** Expenses, Payroll, Driver Payroll, Settlements, Invoices and Fleet & Maint. pages load without errors.

---

## 5. Open items / follow-ups

1. **Client:** what was explained "yesterday" about invoicing (item 7).
2. **Client:** the exact Dispatch #14 order problem (item 9).
3. **Client:** confirm the AI bonus should stay a suggestion (item 4).
4. **Dev:** find out why paystub creation fails inside `createPayroll` (check the PM2 logs). The backfill hides the symptom but not the cause.
5. **Dev:** the UTC "today" bug also exists outside Accounts (about 40 files, e.g. dispatch, compliance, fleet). Fix it in a separate PR.
6. **Dev:** the Settlement modal's "Rate per mile" box sets **every** line (solo, team and empty) to one rate. That's the old behaviour, unchanged. Ask the client if team/empty lines need their own rates.
7. **Deploy:** from now on, every frontend change must also update the **backend repo's `dist.zip`**, or it won't go live.

---

## 6. Testing done

- Frontend: `tsc -b && vite build` passes.
- Backend: `node --check` and a module import on every changed controller.
- A paystub built from a sample payroll passes Mongoose validation (gross, net and memo lines are correct).
- **Not tested against the live database.** The checklist in section 4 is the real confirmation.
