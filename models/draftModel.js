import mongoose from "mongoose";

// Entity types line up 1:1 with the dispatch/HR portal's four managed entities
// and with the {entityType} route segment used by the draft API.
export const DRAFT_ENTITY_TYPES = ["drivers", "trucks", "trailers", "employees"];

const draftSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    entityType: {
      type: String,
      enum: DRAFT_ENTITY_TYPES,
      required: true,
    },
    // "new" for a not-yet-created record, otherwise the entity's ObjectId as a string
    entityId: {
      type: String,
      required: true,
    },
    formData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
    },
  },
  {
    timestamps: true,
  }
);

// Only one active draft per (user, entityType, entityId) — enforced at the DB
// level so the PUT upsert stays a single atomic findOneAndUpdate.
draftSchema.index({ user: 1, entityType: 1, entityId: 1 }, { unique: true });

export const Draft = mongoose.model("Draft", draftSchema);
