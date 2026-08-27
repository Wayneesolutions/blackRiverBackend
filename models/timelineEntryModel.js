import mongoose from "mongoose";

// Entity types line up 1:1 with the dispatch/HR portal's four managed entities
// and with the {entityType} route segment used by the timeline API.
export const TIMELINE_ENTITY_TYPES = ["drivers", "trucks", "trailers", "employees"];

const timelineEntrySchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: TIMELINE_ENTITY_TYPES,
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    note: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    authorRole: {
      type: String,
    },
    // Company association for data isolation (matches other entity models)
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanySettings",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Newest-first pagination per entity is the primary access pattern
timelineEntrySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const TimelineEntry = mongoose.model("TimelineEntry", timelineEntrySchema);
