import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Middleware to protect routes
export const authAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // attach admin info
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};
