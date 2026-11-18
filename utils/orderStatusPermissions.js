// Who may move an order/trip into "delivered" or "completed" (client request, Nov 2026):
//   - Dispatch marks a trip DELIVERED
//   - Accounts marks a trip COMPLETED
// Admin/superadmin keep both. A user can also get the right through an Advanced
// Permissions portal grant (dispatch_load / accounts), same as the rest of the app.

const hasRoleOrPortal = (user, roles, portal) => {
  if (!user) return false;
  if (roles.includes(user.role)) return true;
  return Array.isArray(user.portals) && user.portals.includes(portal);
};

export const canMarkDelivered = (user) =>
  hasRoleOrPortal(user, ['admin', 'superadmin', 'dispatcher'], 'dispatch_load');

export const canMarkCompleted = (user) =>
  hasRoleOrPortal(user, ['admin', 'superadmin', 'accountant'], 'accounts');

// Returns an error message when `user` may not set `nextStatus`, else null.
export const getStatusPermissionError = (user, nextStatus) => {
  const s = String(nextStatus || '').toLowerCase();
  if (s === 'delivered' && !canMarkDelivered(user)) {
    return 'Only Dispatch can mark a trip as Delivered.';
  }
  if (s === 'completed' && !canMarkCompleted(user)) {
    return 'Only Accounts can mark a trip as Completed.';
  }
  return null;
};
