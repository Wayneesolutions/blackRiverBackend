import { Draft, DRAFT_ENTITY_TYPES } from "../models/draftModel.js";
import { getUserCompanyId } from "../utils/companyFilter.js";
import { handleError } from "../utils/errorHandler.js";

const isValidEntityType = (entityType) => DRAFT_ENTITY_TYPES.includes(entityType);

// GET /api/v1/drafts/:entityType/:entityId
export const getDraft = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!isValidEntityType(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${DRAFT_ENTITY_TYPES.join(", ")}`,
      });
    }

    const draft = await Draft.findOne({
      user: req.user._id,
      entityType,
      entityId,
    }).lean();

    return res.status(200).json({
      success: true,
      message: draft ? "Draft fetched successfully" : "No draft found",
      data: draft || null,
    });
  } catch (error) {
    return handleError(error, res, 500);
  }
};

// PUT /api/v1/drafts/:entityType/:entityId
// Upsert semantics: cheap enough to call every ~10-15s from the client autosave timer.
export const upsertDraft = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { formData } = req.body;

    if (!isValidEntityType(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${DRAFT_ENTITY_TYPES.join(", ")}`,
      });
    }

    if (formData === undefined || formData === null || typeof formData !== "object") {
      return res.status(400).json({ success: false, message: "formData (object) is required" });
    }

    const companyId = getUserCompanyId(req.user);

    const draft = await Draft.findOneAndUpdate(
      { user: req.user._id, entityType, entityId },
      {
        $set: {
          formData,
          company: companyId || req.user.company || undefined,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Draft saved successfully",
      data: draft,
    });
  } catch (error) {
    return handleError(error, res, 500);
  }
};

// DELETE /api/v1/drafts/:entityType/:entityId
export const deleteDraft = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!isValidEntityType(entityType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Must be one of: ${DRAFT_ENTITY_TYPES.join(", ")}`,
      });
    }

    await Draft.deleteOne({ user: req.user._id, entityType, entityId });

    return res.status(200).json({
      success: true,
      message: "Draft deleted successfully",
    });
  } catch (error) {
    return handleError(error, res, 500);
  }
};
