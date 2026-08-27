import express from "express";
import { getDraft, upsertDraft, deleteDraft } from "../controllers/draftController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const draftRoute = express.Router();

// Server-side autosave draft store — survives a full browser/device loss.
// :entityType is one of drivers|trucks|trailers|employees; :entityId is "new"
// for a not-yet-created record, otherwise the record's id.

draftRoute.get("/:entityType/:entityId", authMiddleware, getDraft);
draftRoute.put("/:entityType/:entityId", authMiddleware, upsertDraft);
draftRoute.delete("/:entityType/:entityId", authMiddleware, deleteDraft);

export default draftRoute;
