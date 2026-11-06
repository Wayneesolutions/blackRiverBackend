import { ROLE_PORTAL_MAP } from "./authRoles.js";

// Office roles that read their own Role-Based Training content.
export const STAFF_TRAINING_ROLES = [
  "dispatcher",
  "Fleet Maintenance Manager",
  "Compliance Manager",
  "safety officer",
  "accountant",
];

// Roles that manage or take driver training and are not limited to one role's content.
const UNRESTRICTED_ROLES = ["admin", "superadmin", "hr", "driver"];

// Training roles this user may read: their own role, plus any role whose
// portal they have been granted. Returns null when the user is unrestricted.
export const getAllowedTrainingRoles = (user) => {
  const role = user?.role || "";
  if (UNRESTRICTED_ROLES.includes(role)) return null;

  const portals = Array.isArray(user?.portals) ? user.portals : [];
  const allowed = STAFF_TRAINING_ROLES.filter(
    (r) => r === role || portals.includes(ROLE_PORTAL_MAP[r])
  );
  return allowed;
};

// Sets req.trainingRoleScope for office roles:
//   { roles: [...allowed], role: <role to list> }
// Controllers use it so a dispatcher can't read the accountant's content.
export const scopeTrainingRole = (req, res, next) => {
  const allowed = getAllowedTrainingRoles(req.user);
  if (allowed === null) return next();

  if (allowed.length === 0) {
    return res.status(403).json({
      success: false,
      message: "Your role has no training content.",
    });
  }

  const requested = req.query?.role;
  if (requested && requested !== "all" && !allowed.includes(requested)) {
    return res.status(403).json({
      success: false,
      message: "You can only view training for your own role.",
    });
  }

  req.trainingRoleScope = {
    roles: allowed,
    role: requested && requested !== "all" ? requested : null,
  };
  next();
};
