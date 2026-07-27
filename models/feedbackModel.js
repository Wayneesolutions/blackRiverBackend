import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, min: 1, max: 5 }, // optional, star rating
    comment: { type: String, required: true }, // feedback text
  },
  { timestamps: true }
);

const Feedback = mongoose.model("Feedback", feedbackSchema);
export default Feedback;
