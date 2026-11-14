// How-to knowledge for the in-app AI Assistant.
// Client (14 Nov): asked "guide me to download report" and the assistant said it had no
// access to that. It only knew database figures, not where things are in the portal.
// Keep this list in step with the sidebars in the frontend (src/utils/*SidebarLinks.tsx).

export const APP_GUIDE = `
HOW THE PORTAL IS ORGANISED (use this to give step-by-step directions)
The left sidebar changes with the department panel the user is in. Admins switch panels with the portal switcher at the top. Most list pages have Export / Download buttons at the top right, next to "+ Add".

Compliance panel: Compliance Summary, HOS & ELD, CVSA Inspection, Carrier Profile, Tickets (Fines & Penalties), Accidents, Insurance Claims, Training Content, GPS Dashboard.
- HOS report: Compliance → HOS & ELD → "Export HOS Report" (top right). "View Log" on a row opens the log details; an audit can be printed as a PDF for the driver to sign.
- CVSA: Compliance → CVSA Inspection. Pick the Canada or USA tab, then use the download icon next to "+ Add Inspection".
- Carrier profile: Compliance → Carrier Profile → "Upload Carrier Profile" (the PDF from the NSC / FMCSA portal), "Download PDF" or "Download Excel". Canada / USA / All tabs filter it.
- Tickets, Accidents, Insurance Claims: each page has Canada / USA tabs and an Export button.

HR / Management panel: Home, Drivers, Employees, Customers, Company Documents, Attendance Tracking, Employee Portfolio, Driver Portfolio, Driver Training Center, Drug Test, ELD Documents, Trucks, Trailers, Role-Based Training, Training Content, Audit Trail, GPS Dashboard.
- Employee / Driver / Customer lists: open the page and use the Export (Excel) button at the top.
- Employee Portfolio and Driver Portfolio: choose the period (1 week, 2 weeks, 1 month or Custom), then "Export to Excel".
- Portal access for an employee: Employees → Advanced Permissions.
- Training files: Driver Training Center → Training Content → upload a PDF, image or video and choose its category. Drivers see it in the mobile app under Driver Training.

Fleet Maintenance panel: Dashboard, Trucks, Trailers, Scheduled Services Log, Maintenance Orders Log, Regulatory & Safety, Parts, Fleet Invoices, Customers, Yards, Truck & Trailer Profile, Issues, Training Content, Maintenance Settings, GPS Dashboard.
- Schedule a service and assign it to a mechanic: Scheduled Services Log → "Add Service" (type any service name). When the mechanic completes it, it moves to the Maintenance Orders Log.
- Repairs (tires, brakes, accidents): Maintenance Orders Log → "+ Add Maintenance Order"; "Export" at the top.
- Invoices: Fleet Invoices → "+ New Invoice"; open an invoice to download or print its PDF.

Mechanic panel: Dashboard, Assign Tasks (scheduled services and repair orders given to the mechanic), Completed Orders, Parts, Invoices. Completing a task moves it to Completed Orders.

Health & Safety panel: Health & Safety Summary, Incidents & Accidents, Hazards Management, Safety Inspections, Training & Certificates, Policy & Documents, Compliance Records, H&S Committee & CAPA, Trucking Operations, Emergency Procedures, Document Library, Reports & Analytics.
- Safety Inspections: "Schedule Inspection", then "Mark Complete" on the row to record the result and upload the inspection forms.
- Reports & Analytics has the downloadable safety reports.

Accounts panel: Dashboard, Finance Report, Settlements, Expense Management, Invoicing, Employees Payroll, Driver Payroll, Gross Payroll, Fleet & Maint. Finance, Fuel Reports, Receipts & Notes, Accounting Config, Cash Flow Insights, Tax Setup & Rate Management. Payroll and finance pages have Download / Export buttons at the top.

Dispatch panel: Dashboard, GPS Dashboard, Trips, Trip Scheduling, Drivers, Fleets, Customer, Truck & Trailer Utilization, Revenue Per Mile, Deliveries, Pickups, Drivers on Leave, Audit Trail, Chat.

Messaging drivers: the speech-bubble icon in the top bar opens Driver messages (one driver, or Compose to several).

When the user asks HOW to do something, answer with the panel, the sidebar item and the button name as numbered steps. If a feature is not listed here, say you are not sure where it is and suggest the closest page; do not tell them to contact an administrator unless it is a permission problem.
`;
