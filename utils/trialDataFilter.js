export const getTrialDataFilter = async () => null;

/**
 * Combine company filter with trial data filter
 * @param {Object} user - User object from req.user
 * @param {Object} companyFilter - Company filter object (from getUserCompanyId)
 * @returns {Promise<Object>} Combined filter object
 */
export const getCombinedFilter = async (user, companyFilter = null) => {
  try {
    const trialFilter = await getTrialDataFilter(user);
    
    // If no filters, return null
    if (!companyFilter && !trialFilter) {
      return null;
    }

    // Build combined filter
    const combinedFilter = {};
    
    // Add company filter
    if (companyFilter) {
      Object.assign(combinedFilter, companyFilter);
    }
    
    // Add trial filter
    if (trialFilter) {
      // If we already have conditions, combine with $and
      if (Object.keys(combinedFilter).length > 0) {
        return {
          $and: [
            combinedFilter,
            trialFilter
          ]
        };
      } else {
        return trialFilter;
      }
    }
    
    return combinedFilter;
  } catch (error) {
    console.error('Error getting combined filter:', error);
    return companyFilter; // Fallback to company filter only
  }
};

