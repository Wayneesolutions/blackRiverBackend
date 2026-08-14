// Maps each role to its portal key — used to check advanced portal permissions
const ROLE_PORTAL_MAP = {
  dispatcher: 'dispatch_load',
  hr: 'human_resource',
  accountant: 'accounts',
  'Fleet Maintenance Manager': 'fleet_maintenance',
  'Compliance Manager': 'compliance',
  'safety officer': 'health_safety',
  'Maintenance Crew (Mechanics)': 'mechanic',
};

// Check if user has required role(s) OR has been granted a portal that maps to one of those roles
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.error('❌ authorizeRoles: No user found in request');
      return res.status(403).json({
        success: false,
        message: "Access denied: User not authenticated"
      });
    }

    const userRole = req.user.role || "";

    // Allow if the user's role directly matches
    if (roles.includes(userRole)) return next();

    // Allow if the user has a granted portal that corresponds to one of the required roles
    const userPortals = Array.isArray(req.user.portals) ? req.user.portals : [];
    const requiredPortals = roles.map(r => ROLE_PORTAL_MAP[r]).filter(Boolean);
    if (userPortals.some(p => requiredPortals.includes(p))) return next();

    console.error('❌ authorizeRoles: Role mismatch', {
      userRole: userRole,
      requiredRoles: roles,
      userId: req.user._id,
      email: req.user.email,
      path: req.path
    });
    return res.status(403).json({
      success: false,
      message: `Access denied. Required roles: ${roles.join(', ')}, Your role: ${userRole || 'none'}`
    });
  };
};