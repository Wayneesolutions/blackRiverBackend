import mongoose from "mongoose";
import { TimelineEntry, TIMELINE_ENTITY_TYPES } from "../models/timelineEntryModel.js";
import { User } from "../models/driver/userModel.js";
import { Vehicle } from "../models/driver/vehicleModel.js";
import { Trailer } from "../models/driver/trailerModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { handleError } from "../utils/errorHandler.js";

// Maps the {entityType} route segment to the Mongoose model backing that entity
const ENTITY_MODELS = {
  drivers: User,
  employees: User,
  trucks: Vehicle,
  trailers: Trailer,
};

const isValidEntityType = (entityType) => TIMELINE_ENTITY_TYPES.includes(entityType);

// Confirms the entity exists (and, for non-superadmins, belongs to their company)
// before any timeline entry is read/written against it.
const entityExists = async (entityType, entityId, req) => {
  if (!mongoose.Types.ObjectId.isValid(entityId)) return false;

  const Model = ENTITY_MODELS[entityType];
  const query = { _id: entityId };

  const companyId = getUserCompanyId(req.user);
  if (companyId) {
    query.company = companyId;
  }

  const doc = await Model.findOne(query).select("_id").lean();
  return !!doc;
};

// GET /api/v1/timeline/:entityType/:entityId
export const getTimeline = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!isValidEntityType(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${TIMELINE_ENTITY_TYPES.join(", ")}`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ success: false, message: "Invalid entity id" });
    }

    if (!(await entityExists(entityType, entityId, req))) {
      return res.status(404).json({ success: false, message: `${entityType.slice(0, -1)} not found` });
    }

    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.max(parseInt(limit) || 20, 1);
    const skip = (pageNum - 1) * limitNum;

    const filter = { entityType, entityId };

    const [entries, total] = await Promise.all([
      TimelineEntry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TimelineEntry.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      success: true,
      message: "Timeline fetched successfully",
      data: entries,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalEntries: total,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    return handleError(error, res, 500);
  }
};

// POST /api/v1/timeline/:entityType/:entityId
export const createTimelineEntry = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { note } = req.body;

    if (!isValidEntityType(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${TIMELINE_ENTITY_TYPES.join(", ")}`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ success: false, message: "Invalid entity id" });
    }

    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: "Note text is required" });
    }

    if (!(await entityExists(entityType, entityId, req))) {
      return res.status(404).json({ success: false, message: `${entityType.slice(0, -1)} not found` });
    }

    const companyId = getUserCompanyId(req.user);

    const entry = await TimelineEntry.create({
      entityType,
      entityId,
      note: String(note).trim(),
      author: req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role,
      company: companyId || req.user.company || undefined,
    });

    return res.status(201).json({
      success: true,
      message: "Timeline entry created successfully",
      data: entry,
    });
  } catch (error) {
    return handleError(error, res, 500);
  }
};

// PATCH /api/v1/timeline/:entityType/:entityId/:entryId
export const updateTimelineEntry = async (req, res) => {
  try {
    const { entityType, entityId, entryId } = req.params;
    const { note } = req.body;

    if (!isValidEntityType(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${TIMELINE_ENTITY_TYPES.join(", ")}`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json({ success: false, message: "Invalid entry id" });
    }

    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: "Note text is required" });
    }

    const entry = await TimelineEntry.findOne({ _id: entryId, entityType, entityId });
    if (!entry) {
      return res.status(404).json({ success: false, message: "Timeline entry not found" });
    }

    const isAuthor = entry.author.toString() === req.user._id.toString();
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied: you can only edit your own timeline entries",
      });
    }

    entry.note = String(note).trim();
    await entry.save();

    return res.status(200).json({
      success: true,
      message: "Timeline entry updated successfully",
      data: entry,
    });
  } catch (error) {
    return handleError(error, res, 500);
  }
};

// DELETE /api/v1/timeline/:entityType/:entityId/:entryId
export const deleteTimelineEntry = async (req, res) => {
  try {
    const { entityType, entityId, entryId } = req.params;

    if (!isValidEntityType(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${TIMELINE_ENTITY_TYPES.join(", ")}`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json({ success: false, message: "Invalid entry id" });
    }

    const entry = await TimelineEntry.findOne({ _id: entryId, entityType, entityId });
    if (!entry) {
      return res.status(404).json({ success: false, message: "Timeline entry not found" });
    }

    const isAuthor = entry.author.toString() === req.user._id.toString();
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied: you can only delete your own timeline entries",
      });
    }

    await entry.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Timeline entry deleted successfully",
    });
  } catch (error) {
    return handleError(error, res, 500);
  }
};
