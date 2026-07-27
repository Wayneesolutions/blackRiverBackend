import Feedback from "../models/feedbackModel.js";

// Create Feedback (User Side)
export const createFeedback = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const userId = req.user._id; // comes from auth middleware (JWT/session)

    if (!comment) {
      return res.status(400).json({success:false, message: "Comment is required" });
    }

    const feedback = new Feedback({
      driver: userId,
      rating,
      comment,
    });

    await feedback.save();
    res.status(201).json({success:true, message: "Feedback submitted", data: feedback });
  } catch (error) {
    res.status(500).json({success:false, message: "Error submitting feedback", error: error.message });
  }
};

// List All Feedback (Admin Side)
export const listFeedback = async (req, res) => {
  try {
    const feedbacks = await Feedback.find().populate("driver", "name");
    res.status(200).json({success:true,data:feedbacks});
  } catch (error) {
    res.status(500).json({success:false, message: "Error fetching feedbacks", error: error.message });
  }
};

// Delete Feedback (Admin Side)
export const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findByIdAndDelete(id);

    if (!feedback) {
      return res.status(404).json({success:false, message: "Feedback not found" });
    }

    res.status(200).json({success:true, message: "Feedback deleted successfully" });
  } catch (error) {
    res.status(500).json({success:false, message: "Error deleting feedback", error: error.message });
  }
};
