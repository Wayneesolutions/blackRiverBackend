# Logistiq Innovations Portal — Bug List
Compiled: 7/25/2026 | Environment: portal.logistiqinnovations.ca

## HIGH PRIORITY

### 1. New Driver form — Save button non-functional (silent failure)
- Location: Admin > Drivers > (+) New Driver
- Steps: Fill all required fields (Driver ID, First Name, Last Name, Email, DOB, Primary Phone) > click SAVE
- Actual: No network request fires, no console error, no toast/validation message, modal stays open. Record is not created.
- Expected: Either the record saves and modal closes/confirms, or a validation error is shown.
- Impact: Admins cannot add drivers at all; failure gives no clue why.

### 2. Employee/Mechanic creation requires password field
- Location: Admin > Employees > Users tab > (+) New Employee (used for all roles incl. Mechanic)
- Issue: "Password" is a required field on the creation form, forcing whoever creates the account to set another person's login credential.
- Impact: Poor security practice (admin knows employee's password) and blocks streamlined onboarding. Recommend invite-link/email-set-password flow instead.

### 3. Customer/Shipper mixup in Order wizard
- Location: Dispatch > Trips > Edit Order > Step 1 (Customer) & Step 2 (Shipper)
- Issue: Shipper is auto-populated as the same entity as the selected Customer ("Prairie Foods Distribution Ltd." appears as both), rather than pulling the actual shipper location/entity for the order.
- Confirmed still reproducing as of this session on order DEMO-ORDER-001 / 000267.

### 4. Finance figures inconsistent between Accounts Dashboard and Finance Report
- Location: Accounts Dashboard vs. Accounts > Finance Report > Overview/Truck-wise
- Data seen:
  - Dashboard: Revenue $11,225 | Expenses $21,231 | Net Profit -$71,497.44
  - Finance Report: Revenue $6,225 | Expenses $21,508 | Net Profit -$76,775
- Impact: Two "sources of truth" for the same KPIs disagree — undermines trust in financial reporting.

## MEDIUM PRIORITY

### 5. Duplicate/overlapping Driver Payroll runs
- Location: Accounts > Gross Payroll
- Issue: Driver "kuldeep singh" has 4 paystub entries with overlapping pay periods (e.g. two runs both spanning Feb 1–Mar 31, 2026), with wildly different gross amounts ($38,158.76 / $129,204.39 / $150,493.75 / $154,493.75 for overlapping windows).
- Impact: Risk of double-paying drivers or reporting incorrect payroll liabilities.

### 6. Load Board filter tabs do not filter data
- Location: Dispatch > Trips > view selector dropdown
- Issue: Selecting TO/FROM YARD, HISTORICAL LOAD BOARD, INBOUND, or OUTBOUND all return the identical, unfiltered set of 10 orders (same as LOAD BOARD default).
- Impact: These views currently provide no functional value beyond the default view.

### 7. Duplicate drop-off row in order Assignment step
- Location: Dispatch > Edit Order > Step 5 (Assignment)
- Issue: Order 000267 shows two identical "Drop Off" rows (same receiver, address, date, truck, trailer) instead of one.

### 8. Settlements dashboard total doesn't match underlying record
- Location: Accounts > Settlements > Driver/O-O Settlements
- Issue: "Total Settlements" tile shows $0.00 while 1 settlement record (STL-2026-001) exists; that record itself shows Gross Pay $0 / Net Pay $0, which is likely itself incorrect given the driver has other payroll activity.

### 9. Edit Order wizard submit button mislabeled
- Location: Dispatch > Edit Order > Step 6 (Notes/Audit)
- Issue: Final action button reads "Create Order" even when editing an existing order. Should read "Update Order" / "Save Changes".

### 10. GPS Tracking shows no driver assignments
- Location: Live Fleet Map / Truck Tracking (full map view)
- Issue: All trucks show "No driver assigned" and "Location unavailable," despite those same trucks having drivers assigned in Dispatch (e.g., truck yu765 → test driver 2 on order 000267).

## LOW PRIORITY / DATA QUALITY

### 11. Orphaned "Unknown" assignments in Deductions & Additions
- Location: Accounts > Settlements > Deductions & Additions
- Issue: Two entries ("wtet" Addition $2,342/yr, "ewrwe" Deduction $325/wk) show "Unknown" as the assigned employee/driver — likely pointing to a deleted or unresolvable record reference.

### 12. Fuel Reports "Top Consuming Trucks" shows non-existent trucks
- Location: Accounts > Fuel Reports
- Issue: Leaderboard lists truck IDs T-101, T-205, T-089, T-312, T-156 with large consumption figures (7,820–12,450 L) that don't match any real truck in the fleet (2423, TRK-501, LQ102, iyuy76). Appears to be hardcoded placeholder/demo content left in production UI.

### 13. Cash Flow Insights running on fallback/broken AI service
- Location: Accounts > Cash Flow Insights
- Issue: Page displays "Fallback analysis: OpenAI service unavailable. Calculations based on available data." Figures shown (e.g., pending invoice counts vs. dollar totals) are internally inconsistent.

## RESOLVED / NO LONGER REPRODUCING
- Top search bar and Ctrl+K shortcut: both now open the Quick Action search and return navigable results. (Previously reported broken.)

## CONFIRMED WORKING AS EXPECTED
- Invoice detail/preview view (Accounts > Invoicing > open invoice) renders correctly with full line items and totals.
- Roles/Permissions management exists at Settings > Employees > Advanced Permissions tab (previously thought missing).
