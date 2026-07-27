import multer from "multer";

// File upload error handler - only handles file upload related errors
export const fileUploadErrorHandler = (err, req, res, next) => {
  // Only handle file upload errors (multer errors or file-related errors)
  const isFileUploadError = 
    err instanceof multer.MulterError ||
    (err.message && (
      err.message.includes("Invalid file type") ||
      err.message.includes("Image size must be less than") ||
      err.message.includes("Video size must be less than") ||
      err.message.includes("Media upload")
    ));

  if (!isFileUploadError) {
    // Not a file upload error, pass to next error handler
    return next(err);
  }

  console.error("File Upload Error:", err);

  // Multer-specific errors (file size, unexpected field, etc.)
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.message || "Media upload failed, please try after some time",
    });
  }

  // Custom file type validation errors
  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // Custom image/video size errors from fileFilter
  if (
    err.message &&
    (err.message.includes("Image size must be less than") ||
      err.message.includes("Video size must be less than"))
  ) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // General fallback for file upload errors
  return res.status(500).json({
    success: false,
    message: "Media upload failed, please try after some time",
  });
};
