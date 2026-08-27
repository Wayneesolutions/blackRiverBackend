import express from "express";
import {
  getTimeline,
  createTimelineEntry,
  updateTimelineEntry,
  deleteTimelineEntry,
} from "../controllers/timelineController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const timelineRoute = express.Router();

// Per-record activity/notes log for drivers, trucks, trailers, and employees.
// :entityType is one of drivers|trucks|trailers|employees.

// List entries for an entity, newest first, paginated
timelineRoute.get("/:entityType/:entityId", authMiddleware, getTimeline);

// Create a new entry — any authenticated portal user or admin
timelineRoute.post("/:entityType/:entityId", authMiddleware, createTimelineEntry);

// Edit an entry — author or admin only (enforced in controller)
timelineRoute.patch("/:entityType/:entityId/:entryId", authMiddleware, updateTimelineEntry);

// Delete an entry — author or admin only (enforced in controller)
timelineRoute.delete("/:entityType/:entityId/:entryId", authMiddleware, deleteTimelineEntry);

export default timelineRoute;
