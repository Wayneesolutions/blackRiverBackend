import express from "express";
import {
  getAllTrailers,
  getTrailerById,
  updateTrailerLocation,
  getTrailerStats
} from "../controllers/trailerTrackingController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/authRoles.js";

export const trailerTrackingRoute = express.Router();

// ✅ GET ALL TRAILERS WITH FILTERS
trailerTrackingRoute.get(
  "/",
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getAllTrailers
);

// ✅ GET TRAILER BY ID
trailerTrackingRoute.get(
  "/:id",
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getTrailerById
);

// ✅ UPDATE TRAILER LOCATION
trailerTrackingRoute.patch(
  "/:id/location",
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  updateTrailerLocation
);

// ✅ GET TRAILER STATISTICS
trailerTrackingRoute.get(
  "/stats/overview",
  authMiddleware,
  authorizeRoles('admin', 'superadmin', 'dispatcher'),
  getTrailerStats
);
