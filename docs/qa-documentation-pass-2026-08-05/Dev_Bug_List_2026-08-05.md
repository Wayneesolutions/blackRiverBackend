# Logistiq Innovations Portal — Bug List (Documentation Pass)
Compiled: 8/5/2026 | Found while building the Super Admin / Admin manuals, testing locally against a demo company ("Maple Leaf Freight Lines")
Companion docs: `Dev_Bug_List.md` (original 7/25 audit, 12/13 items fixed — see `Dev_Team_Handoff.md`), `Logistiq_SuperAdmin_Manual.pdf`, `Logistiq_Admin_Manual.pdf`

This is a fresh set of issues found incidentally while populating a full demo company and screenshotting every screen for the two manuals — not a repeat of the 7/25 audit. Reproduce these against a real environment (not just the local build used here) before treating severity as final.

## HIGH PRIORITY

### 1. Dispatch > New Load — pickup/delivery location picker never returns results, blocking load creation
- **Location:** Admin > Dispatch > Available Dispatch > + New Load > Pickup Location / Delivery Location
- **Steps:**
  1. Create a Yard under Fleet Maintenance > Yards (e.g. name "Mississauga Main Yard", full address filled in) — saves successfully.
  2. Open Dispatch > + New Load, fill in Customer/Order#/Commodity.
  3. Click into "Search pickup location..." and type any text, including the exact name/address of the Yard just created.
- **Actual:** Dropdown always shows "No places found," even for a Yard that was just saved. Typed free text does not get accepted as the location value either — clicking Save Load with a typed-but-unselected location silently does nothing (no error, no network request, modal just stays open).
- **Expected:** Either the saved Yard should appear as a selectable location, or typed text should be accepted as a valid pickup/delivery address.
- **Root cause (found in code, not fixed — out of scope for this pass):** the location search calls a `dispatcher.places` API, which is a completely separate dataset from Yards (`fleetmaintenance/yards`). A "Places" management page exists in the codebase (`src/pages/admin/dispatch/resources/places/index.tsx` and `NewPlacesSidebar.tsx`) but isn't wired into any route in the current build, so there is no reachable UI to populate the Places dataset that the load form actually reads from.
- **Impact:** A dispatcher cannot create a load with a pickup/delivery location at all through the normal UI — this blocks the core dispatch workflow end-to-end.
- **Recommendation:** either (a) have the location picker also query/include Yards, so Yards double as usable places, or (b) add a route/nav entry for the existing Places page so locations can be created directly. Either is a small fix since the UI code already exists.

## MEDIUM PRIORITY

### 2. Mechanics Portal shows wrong role label for Admin users
- **Location:** Admin > Mechanics > any page (e.g. `/admin/mechanics/orders`)
- **Steps:** Log in as an Admin, navigate to any Mechanics section.
- **Actual:** The user badge in the bottom-left sidebar shows the admin's name with the role label "Mechanic" (e.g. "Michael Bergeron / Mechanic") instead of "Admin"/"Administrator".
- **Expected:** The role label should reflect the actual logged-in user's role, not the section currently being viewed.
- **Impact:** Cosmetic, but could confuse an admin about their own permission level, or confuse anyone screen-sharing/training off of it.

## LOW PRIORITY

### 3. Inconsistent required-field validation UX between creation forms
- **Location:** compare Admin > Drivers > + New Driver vs. Admin > Employees > + New Employee
- **Issue:** New Driver's validation lists everything missing at once ("Please fix 7 required fields before submitting. Missing: Date of Birth, Drivers License Number, ..."), while New Employee's validation surfaces one missing field at a time ("SIN number is required"), forcing repeated fix-and-resubmit cycles to discover each missing field.
- **Impact:** Minor but real UX friction — the single-field forms take noticeably longer to fill out correctly, especially on forms with several tabs (Employee has 6, Driver has 11).

### 4. Truck/Trailer "Weight" field visually appears filled but isn't
- **Location:** Fleet Maintenance > Trucks (or Trailers) > + Add Truck/Trailer > Weight field
- **Steps:** Open the Add Truck form and look at Weight without touching it, then submit.
- **Actual:** The field displays "0", which reads as a legitimate entered value, but submitting without explicitly typing a number still throws "Weight is required".
- **Expected:** Either show an empty field with a "0" placeholder (not a real value) so it's visually obvious it's unfilled, or accept 0 as a valid submitted weight.
- **Impact:** Minor, but will trip up new users who don't realize a visually-populated field is actually still empty.

## Not a bug — confirmed working correctly
Everything on the Super Admin side (Dashboard, Admin Accounts creation, Plan Management, Revenue, Invoices, System Settings) worked cleanly with no issues found. Driver/Truck/Trailer/Employee/Customer/Yard creation all work correctly once the right field is targeted — see the two manuals for the exact required fields per form, which aren't always obvious from the UI alone (e.g. Country must be picked before Province/State appears; Canadian Citizen status still requires a SIN Number).
