/**
 * Parse MongoDB duplicate key error and return user-friendly message
 * @param {Error} error - The error object from MongoDB
 * @returns {string|null} - User-friendly error message or null if not a duplicate key error
 */
export const handleDuplicateKeyError = (error) => {
  // Check if it's a MongoDB duplicate key error (E11000)
  if (error.code === 11000 || error.code === 11001) {
    const errorMessage = error.message || '';
    
    // Extract field name and value from error message
    // Format: "E11000 duplicate key error collection: blackriver.trailers index: internalId_1 dup key: { internalId: \"TRL--02\" }"
    const dupKeyMatch = errorMessage.match(/dup key: \{ ([^:]+): "([^"]+)" \}/);
    
    if (dupKeyMatch) {
      const fieldName = dupKeyMatch[1];
      const fieldValue = dupKeyMatch[2];
      
      // Convert field name to user-friendly format
      const friendlyFieldName = fieldName
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
        .trim();
      
      // Handle common field names
      const fieldDisplayNames = {
        'internalId': 'Internal ID',
        'plateNumber': 'Plate Number',
        'vinNumber': 'VIN Number',
        'email': 'Email',
        'phone': 'Phone',
        'trailer': 'Trailer',
        'vehicle': 'Vehicle'
      };
      
      const displayName = fieldDisplayNames[fieldName] || friendlyFieldName;
      
      return `${displayName} '${fieldValue}' already exists. Please use a different value.`;
    }
    
    // Fallback if we can't parse the error
    return 'This value already exists. Please use a different value.';
  }
  
  return null;
};

/**
 * Handle errors and return appropriate response
 * @param {Error} error - The error object
 * @param {Object} res - Express response object
 * @param {number} defaultStatus - Default HTTP status code (default: 500)
 */
export const handleError = (error, res, defaultStatus = 500) => {
  console.error('Error:', error);
  
  // Check for duplicate key error first
  const duplicateError = handleDuplicateKeyError(error);
  if (duplicateError) {
    return res.status(400).json({
      success: false,
      message: duplicateError
    });
  }
  
  // Handle validation errors
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      message: errors.join(', ')
    });
  }
  
  // Default error response
  return res.status(defaultStatus).json({
    success: false,
    message: error.message || 'Server error'
  });
};

