import VehicleDocuments from "../models/driver/vehicleDocumentsModel.js";

/**
 * Calculate vehicle compliance status based on vehicle documents
 * @param {Object} vehicle - Vehicle object
 * @param {Array} documents - Array of vehicle documents for the vehicle
 * @returns {Object} - Compliance status object with status and details
 */
export async function calculateVehicleCompliance(vehicle, documents = null) {
  try {
    // If documents not provided, fetch them
    // Support both vehicles and trailers
    if (!documents) {
      documents = await VehicleDocuments.find({ 
        $or: [
          { vehicleId: vehicle._id },
          { trailerId: vehicle._id },
          { fleetUnitId: vehicle._id }
        ],
        ignoreExpiration: { $ne: true } // Only check documents that are not ignored
      }).lean();
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Check for expired or expiring documents
    let hasExpiredDocuments = false;
    let hasExpiringSoonDocuments = false;
    let expiredDocuments = [];
    let expiringSoonDocuments = [];

    // If no documents exist, vehicle is NON-COMPLIANT
    if (!documents || documents.length === 0) {
      return {
        status: 'NON-COMPLIANT',
        hasExpiredDocuments: false,
        hasExpiringSoonDocuments: false,
        missingRequiredDocuments: true,
        expiredDocuments: [],
        expiringSoonDocuments: [],
        totalDocuments: 0,
        validDocuments: 0
      };
    }

    // Check each document
    for (const doc of documents) {
      // Skip documents with ignoreExpiration: true
      if (doc.ignoreExpiration === true) {
        continue;
      }

      // Check document status first (set by cron job)
      if (doc.status === 'expired') {
        hasExpiredDocuments = true;
        expiredDocuments.push({
          type: doc.documentType || 'Unknown',
          expiryDate: doc.expiryDate,
          documentNumber: doc.documentNumber || 'N/A'
        });
      } else if (doc.status === 'expiring-soon') {
        hasExpiringSoonDocuments = true;
        expiringSoonDocuments.push({
          type: doc.documentType || 'Unknown',
          expiryDate: doc.expiryDate,
          documentNumber: doc.documentNumber || 'N/A'
        });
      } else if (doc.expiryDate && !doc.ignoreExpiration) {
        // Also check expiryDate directly as fallback
        const expiryDate = new Date(doc.expiryDate);
        
        if (expiryDate < now) {
          hasExpiredDocuments = true;
          expiredDocuments.push({
            type: doc.documentType || 'Unknown',
            expiryDate: expiryDate,
            documentNumber: doc.documentNumber || 'N/A'
          });
        } else if (expiryDate <= thirtyDaysFromNow) {
          hasExpiringSoonDocuments = true;
          expiringSoonDocuments.push({
            type: doc.documentType || 'Unknown',
            expiryDate: expiryDate,
            documentNumber: doc.documentNumber || 'N/A'
          });
        }
      }
    }

    // Determine compliance status
    let complianceStatus = 'COMPLIANT';
    if (hasExpiredDocuments) {
      complianceStatus = 'NON-COMPLIANT';
    } else if (hasExpiringSoonDocuments) {
      complianceStatus = 'EXPIRING SOON';
    }

    return {
      status: complianceStatus,
      hasExpiredDocuments,
      hasExpiringSoonDocuments,
      expiredDocuments,
      expiringSoonDocuments,
      totalDocuments: documents.length,
      validDocuments: documents.filter(d => {
        // Skip documents with ignoreExpiration: true
        if (d.ignoreExpiration) return true;
        // Valid if status is completed and not expired/expiring
        if (d.status === 'completed' && d.status !== 'expired' && d.status !== 'expiring-soon') {
          return true;
        }
        // Also check expiryDate directly
        if (!d.expiryDate) return true;
        const expiryDate = new Date(d.expiryDate);
        return expiryDate >= now && expiryDate > thirtyDaysFromNow;
      }).length
    };
  } catch (error) {
    console.error('Error calculating vehicle compliance:', error);
    // Return non-compliant on error to be safe
    return {
      status: 'NON-COMPLIANT',
      hasExpiredDocuments: false,
      hasExpiringSoonDocuments: false,
      expiredDocuments: [],
      expiringSoonDocuments: [],
      totalDocuments: 0,
      validDocuments: 0,
      error: error.message
    };
  }
}

