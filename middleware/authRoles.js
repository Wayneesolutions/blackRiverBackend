// Check if user has required role(s)
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
    if (!roles.includes(userRole)) {
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
    }
    next();
  };
};