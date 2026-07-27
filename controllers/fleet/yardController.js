import { Yard } from "../../models/fleet/yardModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

// Helper function to geocode address using Nominatim API
const geocodeAddress = async (address, city, stateProvince, country, zipPostalCode) => {
  try {
    // Map country codes to full names for better geocoding
    const countryMap = {
      'CA': 'Canada',
      'US': 'United States',
      'USA': 'United States'
    };
    
    const countryName = countryMap[country?.toUpperCase()] || country || '';
    
    // Build multiple address formats to try
    const addressFormats = [];
    
    // Format 1: Full address with all components
    const fullAddress = [
      address,
      city,
      stateProvince,
      zipPostalCode,
      countryName
    ].filter(Boolean).join(', ');
    if (fullAddress) addressFormats.push(fullAddress);
    
    // Format 2: City, State, Country (if address is not a street address)
    if (address && !address.match(/^\d+/)) {
      const cityStateCountry = [
        city,
        stateProvince,
        zipPostalCode,
        countryName
      ].filter(Boolean).join(', ');
      if (cityStateCountry && cityStateCountry !== fullAddress) {
        addressFormats.push(cityStateCountry);
      }
    }
    
    // Format 3: Just city and state/province with country
    const cityState = [
      city,
      stateProvince,
      countryName
    ].filter(Boolean).join(', ');
    if (cityState && !addressFormats.includes(cityState)) {
      addressFormats.push(cityState);
    }
    
    // Try each address format until one works
    for (const addressToGeocode of addressFormats) {
      if (!addressToGeocode || addressToGeocode.trim().length < 3) {
        continue;
      }

      console.log('Attempting to geocode:', addressToGeocode);
      
      // Use Nominatim API to geocode the address
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressToGeocode)}&format=json&limit=1`;
      
      // Add a delay to respect Nominatim rate limits (1 second between requests)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'BlackRiver-Logistics-App/1.0 (Contact: support@blackriver.com)',
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          console.error('Nominatim API error:', response.status, response.statusText);
          continue; // Try next format
        }

        const data = await response.json();
        
        if (data && data.length > 0) {
          const result = data[0];
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          
          if (!isNaN(lat) && !isNaN(lon)) {
            console.log('Successfully geocoded:', addressToGeocode, '->', lat, lon);
            return {
              latitude: lat,
              longitude: lon,
              geocodedAt: new Date()
            };
          }
        }
      } catch (fetchError) {
        console.error('Error fetching from Nominatim:', fetchError.message);
        continue; // Try next format
      }
    }
    
    console.warn('Failed to geocode address with all formats:', {
      address,
      city,
      stateProvince,
      country,
      zipPostalCode
    });
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
};

// Get all yards
export const getAllYards = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === "superadmin";
    
    // Get company filter with strict validation
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getAllYards: Admin has no company - returning empty data');
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const filter = await getCombinedFilter(req.user, companyFilter);

    // CRITICAL: For non-superadmin, query MUST include company filter
    let query = {};
    if (isSuperadmin) {
      query = filter || {};
    } else {
      // Non-superadmin MUST have company filter
      if (filter) {
        if (filter.$and && Array.isArray(filter.$and)) {
          const hasCompany = filter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            query = {
              ...filter,
              $and: [...filter.$and, { company: companyId }]
            };
          } else {
            query = filter;
          }
        } else if (filter.company) {
          query = filter;
        } else {
          query = { ...filter, company: companyId };
        }
      } else {
        query = { company: companyId };
      }
    }

    const yards = await Yard.find(query)
      .populate("company", "companyName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: yards,
      count: yards.length
    });
  } catch (error) {
    console.error("Error fetching yards:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch yards"
    });
  }
};

// Get yard by ID
export const getYardById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    let query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const yard = await Yard.findOne(query)
      .populate("company", "companyName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!yard) {
      return res.status(404).json({
        success: false,
        message: "Yard not found"
      });
    }

    res.json({
      success: true,
      data: yard
    });
  } catch (error) {
    console.error("Error fetching yard:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch yard"
    });
  }
};

// Create yard
export const createYard = async (req, res) => {
  try {
    const { 
      yardName, 
      yardCode, 
      yardType, 
      status,
      address,
      unit,
      city,
      stateProvince,
      country,
      zipPostalCode
    } = req.body;
    const companyId = getUserCompanyId(req.user);

    // Validation
    if (!yardName || !yardCode || !yardType) {
      return res.status(400).json({
        success: false,
        message: "yardName, yardCode, and yardType are required fields"
      });
    }

    // Validate address fields
    if (!address || !city || !stateProvince || !country || !zipPostalCode) {
      return res.status(400).json({
        success: false,
        message: "Address, City, State/Province, Country, and ZIP/Postal Code are required fields"
      });
    }

    // Check if yardCode already exists for this company
    const existingYard = await Yard.findOne({
      yardCode: yardCode.trim(),
      company: companyId
    });

    if (existingYard) {
      return res.status(400).json({
        success: false,
        message: "Yard code already exists for this company"
      });
    }

    // Geocode the address to get coordinates
    const coordinates = await geocodeAddress(
      address,
      city,
      stateProvince,
      country,
      zipPostalCode
    );

    const yardData = {
      yardName: yardName.trim(),
      yardCode: yardCode.trim(),
      yardType,
      status: status || "active",
      address: address.trim(),
      unit: unit ? unit.trim() : "",
      city: city.trim(),
      stateProvince: stateProvince.trim(),
      country: country.trim(),
      zipPostalCode: zipPostalCode.trim(),
      coordinates: coordinates || {
        latitude: null,
        longitude: null,
        geocodedAt: null
      },
      company: companyId,
      createdBy: req.user._id,
      updatedBy: req.user._id
    };

    const yard = new Yard(yardData);
    await yard.save();

    const populatedYard = await Yard.findById(yard._id)
      .populate("company", "companyName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.status(201).json({
      success: true,
      message: "Yard created successfully",
      data: populatedYard
    });
  } catch (error) {
    console.error("Error creating yard:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create yard"
    });
  }
};

// Update yard
export const updateYard = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      yardName, 
      yardCode, 
      yardType, 
      status,
      address,
      unit,
      city,
      stateProvince,
      country,
      zipPostalCode
    } = req.body;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    let query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const yard = await Yard.findOne(query);

    if (!yard) {
      return res.status(404).json({
        success: false,
        message: "Yard not found"
      });
    }

    // Check if yardCode is being changed and if it already exists
    if (yardCode && yardCode.trim() !== yard.yardCode) {
      const existingYard = await Yard.findOne({
        yardCode: yardCode.trim(),
        company: companyId,
        _id: { $ne: id }
      });

      if (existingYard) {
        return res.status(400).json({
          success: false,
          message: "Yard code already exists for this company"
        });
      }
    }

    // Update fields
    if (yardName !== undefined) yard.yardName = yardName.trim();
    if (yardCode !== undefined) yard.yardCode = yardCode.trim();
    if (yardType !== undefined) yard.yardType = yardType;
    if (status !== undefined) yard.status = status;
    
    // Update address fields
    let addressChanged = false;
    if (address !== undefined) {
      yard.address = address.trim();
      addressChanged = true;
    }
    if (unit !== undefined) yard.unit = unit ? unit.trim() : "";
    if (city !== undefined) {
      yard.city = city.trim();
      addressChanged = true;
    }
    if (stateProvince !== undefined) {
      yard.stateProvince = stateProvince.trim();
      addressChanged = true;
    }
    if (country !== undefined) {
      yard.country = country.trim();
      addressChanged = true;
    }
    if (zipPostalCode !== undefined) {
      yard.zipPostalCode = zipPostalCode.trim();
      addressChanged = true;
    }

    // If address fields changed, geocode the new address
    if (addressChanged) {
      const coordinates = await geocodeAddress(
        yard.address,
        yard.city,
        yard.stateProvince,
        yard.country,
        yard.zipPostalCode
      );
      
      if (coordinates) {
        yard.coordinates = coordinates;
      } else {
        // Keep existing coordinates if geocoding fails
        if (!yard.coordinates) {
          yard.coordinates = {
            latitude: null,
            longitude: null,
            geocodedAt: null
          };
        }
      }
    }
    
    yard.updatedBy = req.user._id;

    await yard.save();

    const populatedYard = await Yard.findById(yard._id)
      .populate("company", "companyName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.json({
      success: true,
      message: "Yard updated successfully",
      data: populatedYard
    });
  } catch (error) {
    console.error("Error updating yard:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update yard"
    });
  }
};

// Delete yard
export const deleteYard = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    let query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const yard = await Yard.findOneAndDelete(query);

    if (!yard) {
      return res.status(404).json({
        success: false,
        message: "Yard not found"
      });
    }

    res.json({
      success: true,
      message: "Yard deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting yard:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete yard"
    });
  }
};

// Geocode all yards without coordinates (utility endpoint)
export const geocodeAllYards = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === "superadmin";

    let query = {
      $or: [
        { 'coordinates.latitude': null },
        { 'coordinates.latitude': { $exists: false } },
        { 'coordinates.longitude': null },
        { 'coordinates.longitude': { $exists: false } }
      ]
    };
    
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Also need address fields to geocode
    query.address = { $exists: true, $ne: null, $ne: '' };
    query.city = { $exists: true, $ne: null, $ne: '' };

    const yards = await Yard.find(query);

    if (yards.length === 0) {
      return res.json({
        success: true,
        message: "No yards found that need geocoding",
        geocoded: 0,
        total: 0
      });
    }

    let geocodedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < yards.length; i++) {
      const yard = yards[i];
      
      try {
        const coordinates = await geocodeAddress(
          yard.address,
          yard.city,
          yard.stateProvince,
          yard.country,
          yard.zipPostalCode
        );

        if (coordinates) {
          yard.coordinates = coordinates;
          await yard.save();
          geocodedCount++;
          console.log(`Geocoded yard ${yard.yardId}: ${coordinates.latitude}, ${coordinates.longitude}`);
        } else {
          failedCount++;
          console.warn(`Failed to geocode yard ${yard.yardId}`);
        }

        // Add delay between requests to respect rate limits
        if (i < yards.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error) {
        console.error(`Error geocoding yard ${yard.yardId}:`, error);
        failedCount++;
      }
    }

    res.json({
      success: true,
      message: `Geocoding completed. ${geocodedCount} yards geocoded, ${failedCount} failed.`,
      geocoded: geocodedCount,
      failed: failedCount,
      total: yards.length
    });
  } catch (error) {
    console.error("Error geocoding all yards:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to geocode yards"
    });
  }
};

