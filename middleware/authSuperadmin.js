import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export const authMiddlewareSuperAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.superadmin = decoded;

    // Check if super admin
    if (req.superadmin.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Only Super Admin allowed." });
    }

    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};
