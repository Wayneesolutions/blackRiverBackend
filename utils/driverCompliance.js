import { EmployeeDocument } from "../models/driver/employeeDocumentModel.js";

/**
 * Calculate driver compliance status based on required documents
 * @param {Object} driver - Driver user object
 * @param {Array} documents - Array of employee documents for the driver
 * @returns {Object} - Compliance status object with status and details
 */
export async function calculateDriverCompliance(driver, documents = null) {
  try {
    // If documents not provided, fetch them
    if (!documents) {
      documents = await EmployeeDocument.find({ 
        employee: driver._id,
        isInUse: { $ne: false } // Include documents that are in use (true, null, or undefined)
      }).lean();
    }

    // Ensure documents is an array
    if (!Array.isArray(documents)) {
      documents = [];
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Required document types for compliance
    const requiredDocumentTypes = [
      "Driving Licence",
      "Commercial Driver's License (CDL)",
      "Medical Certificate",
      "Medical Certificate (DOT Physical)",
      "Passport",
      "ID Document"
    ];

    // Check for expired or missing documents
    let hasExpiredDocuments = false;
    let hasExpiringSoonDocuments = false;
    let missingRequiredDocuments = [];
    let expiredDocuments = [];
    let expiringSoonDocuments = [];

    // Check each required document type
    for (const docType of requiredDocumentTypes) {
      const doc = documents.find(d => 
        d.documentType === docType && 
        d.isInUse !== false
      );

      if (!doc) {
        // Document is missing
        missingRequiredDocuments.push(docType);
      } else if (doc.expiryDate && !doc.ignoreExpiration) {
        // Only check expiration if ignoreExpiration is not true
        const expiryDate = new Date(doc.expiryDate);
        
        if (expiryDate < now) {
          // Document is expired
          hasExpiredDocuments = true;
          expiredDocuments.push({
            type: docType,
            expiryDate: expiryDate,
            documentNumber: doc.documentNumber || 'N/A'
          });
        } else if (expiryDate <= thirtyDaysFromNow) {
          // Document is expiring soon (within 30 days)
          hasExpiringSoonDocuments = true;
          expiringSoonDocuments.push({
            type: docType,
            expiryDate: expiryDate,
            documentNumber: doc.documentNumber || 'N/A'
          });
        }
      }
    }

    // Check other compliance documents (training, certifications, etc.)
    const otherComplianceDocs = documents.filter(d => 
      !requiredDocumentTypes.includes(d.documentType) &&
      d.isInUse !== false &&
      (d.documentType.includes("Certificate") || 
       d.documentType.includes("Training") ||
       d.documentType.includes("Test"))
    );

    for (const doc of otherComplianceDocs) {
      if (doc.expiryDate && !doc.ignoreExpiration) {
        // Only check expiration if ignoreExpiration is not true
        const expiryDate = new Date(doc.expiryDate);
        
        if (expiryDate < now) {
          hasExpiredDocuments = true;
          expiredDocuments.push({
            type: doc.documentType,
            expiryDate: expiryDate,
            documentNumber: doc.documentNumber || 'N/A'
          });
        } else if (expiryDate <= thirtyDaysFromNow) {
          hasExpiringSoonDocuments = true;
          expiringSoonDocuments.push({
            type: doc.documentType,
            expiryDate: expiryDate,
            documentNumber: doc.documentNumber || 'N/A'
          });
        }
      }
    }

    // Determine compliance status
    let complianceStatus = 'COMPLIANT';
    if (hasExpiredDocuments || missingRequiredDocuments.length > 0) {
      complianceStatus = 'NON-COMPLIANT';
    } else if (hasExpiringSoonDocuments) {
      complianceStatus = 'EXPIRING SOON';
    }

    return {
      status: complianceStatus,
      hasExpiredDocuments,
      hasExpiringSoonDocuments,
      missingRequiredDocuments,
      expiredDocuments,
      expiringSoonDocuments,
      totalDocuments: documents.length,
      validDocuments: documents.filter(d => {
        // Skip documents with ignoreExpiration: true
        if (d.ignoreExpiration) return true;
        if (!d.expiryDate) return true;
        const expiryDate = new Date(d.expiryDate);
        return expiryDate >= now && expiryDate > thirtyDaysFromNow;
      }).length
    };
  } catch (error) {
    console.error('Error calculating driver compliance:', error);
    // Return non-compliant on error to be safe
    return {
      status: 'NON-COMPLIANT',
      hasExpiredDocuments: false,
      hasExpiringSoonDocuments: false,
      missingRequiredDocuments: [],
      expiredDocuments: [],
      expiringSoonDocuments: [],
      totalDocuments: 0,
      validDocuments: 0,
      error: error.message
    };
  }
}

