import { Incident } from "../../models/healthSafety/incidentModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// Helper function to process file uploads
const processFile = (file) => {
  if (!file) return null;
  
  let fileUrl = null;
  if (file.location) {
    fileUrl = file.location; // S3
  } else if (file.path) {
    fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/${file.path.replace(/\\/g, '/')}`;
  }
  
  return {
    fileUrl,
    fileName: file.originalname,
    fileType: file.mimetype?.startsWith('image/') ? 'image' : 
               file.mimetype?.startsWith('video/') ? 'video' : 'document',
    uploadedAt: new Date(),
    uploadedBy: null // Will be set by controller
  };
};

// ✅ Create Incident
export const createIncident = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const {
      date,
      time,
      location,
      locationType,
      type,
      severity,
      reportedBy,
      reportedByRole,
      description,
      hasInjury
    } = req.body;

    if (!date || !time || !location || !locationType || !type || !severity || !reportedBy || !description) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields."
      });
    }

    // Process file uploads (if any)
    const photoEvidence = req.files?.photoEvidence?.map(file => ({
      ...processFile(file),
      uploadedBy: req.user._id
    })) || [];
    
    const videoEvidence = req.files?.videoEvidence?.map(file => ({
      ...processFile(file),
      uploadedBy: req.user._id
    })) || [];

    // Generate incident number (with retry logic for race conditions)
    let incidentNumber;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const year = new Date().getFullYear();
      const query = {
        incidentNumber: new RegExp(`^INC-${year}-`)
      };
      
      // Filter by company if provided (for multi-tenant support)
      if (companyId) {
        query.company = companyId;
      }
      
      const count = await Incident.countDocuments(query);
      incidentNumber = `INC-${year}-${String(count + 1).padStart(4, '0')}`;
      
      const payload = {
        incidentNumber,
        date: new Date(date),
        time,
        location: location.trim(),
        locationType,
        type,
        severity,
        status: 'open',
        reportedBy: reportedBy.trim(),
        reportedByRole: reportedByRole?.trim() || 'Unknown',
        description: description.trim(),
        hasInjury: hasInjury === true || hasInjury === 'true',
        photoEvidence,
        videoEvidence,
        company: isSuperadmin ? req.body.company || null : companyId,
        createdBy: req.user._id
      };

      try {
        const incident = new Incident(payload);
        await incident.save();
        
        // Success - break out of retry loop
        await incident.populate('createdBy', 'name email');
        
        return res.status(201).json({
          success: true,
          message: "Incident created successfully",
          data: incident
        });
      } catch (saveError) {
        // If it's a duplicate key error, retry with a new number
        if (saveError.code === 11000 && saveError.keyPattern?.incidentNumber) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique incident number after multiple attempts');
          }
          // Wait a bit before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 100 * attempts));
          continue;
        }
        // If it's not a duplicate key error, throw it
        throw saveError;
      }
    }
  } catch (err) {
    console.error('Create incident error:', err);
    // Provide more detailed error message
    const errorMessage = err.message || "Failed to create incident";
    const validationErrors = err.errors ? Object.keys(err.errors).map(key => ({
      field: key,
      message: err.errors[key].message
    })) : [];
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      errors: validationErrors.length > 0 ? validationErrors : undefined
    });
  }
};

// ✅ Get All Incidents
export const getIncidents = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { status, type, search } = req.query;
    const query = {};

    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    if (search) {
      query.$or = [
        { incidentNumber: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
        { reportedBy: { $regex: search, $options: 'i' } }
      ];
    }

    const incidents = await Incident.find(query)
      .populate('createdBy', 'name email')
      .populate('capa.assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: incidents
    });
  } catch (err) {
    console.error('Get incidents error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch incidents"
    });
  }
};

// ✅ Get Incident By ID
export const getIncidentById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const incident = await Incident.findOne(query)
      .populate('createdBy', 'name email')
      .populate('capa.assignedTo', 'name email')
      .populate('investigation.lead', 'name email')
      .lean();

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: "Incident not found"
      });
    }

    res.json({
      success: true,
      data: incident
    });
  } catch (err) {
    console.error('Get incident by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch incident"
    });
  }
};

// ✅ Update Incident
export const updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const incident = await Incident.findOne(query);
    if (!incident) {
      return res.status(404).json({
        success: false,
        message: "Incident not found"
      });
    }

    const updateData = {};

    // Handle date conversion
    if (req.body.date) {
      updateData.date = new Date(req.body.date);
    }

    // Handle status updates
    if (req.body.status) {
      updateData.status = req.body.status;
    }

    // Handle description updates
    if (req.body.description) {
      updateData.description = req.body.description;
    }

    // Handle other text fields
    if (req.body.incidentNumber) updateData.incidentNumber = req.body.incidentNumber;
    if (req.body.location) updateData.location = req.body.location;
    if (req.body.locationType) updateData.locationType = req.body.locationType;
    if (req.body.type) updateData.type = req.body.type;
    if (req.body.severity) updateData.severity = req.body.severity;
    if (req.body.time) updateData.time = req.body.time;
    if (req.body.hasInjury !== undefined) updateData.hasInjury = req.body.hasInjury === 'true' || req.body.hasInjury === true;

    // Process new file uploads if any
    if (req.files?.photoEvidence && req.files.photoEvidence.length > 0) {
      const newPhotos = req.files.photoEvidence.map(file => ({
        ...processFile(file),
        uploadedBy: req.user._id
      }));
      incident.photoEvidence = [...(incident.photoEvidence || []), ...newPhotos];
    }

    if (req.files?.videoEvidence && req.files.videoEvidence.length > 0) {
      const newVideos = req.files.videoEvidence.map(file => ({
        ...processFile(file),
        uploadedBy: req.user._id
      }));
      incident.videoEvidence = [...(incident.videoEvidence || []), ...newVideos];
    }

    // Handle witness statements if provided
    if (req.body.workerStatements) {
      const statements = typeof req.body.workerStatements === 'string' 
        ? JSON.parse(req.body.workerStatements) 
        : req.body.workerStatements;
      updateData.workerStatements = statements;
    }

    if (req.body.witnessReports) {
      const reports = typeof req.body.witnessReports === 'string'
        ? JSON.parse(req.body.witnessReports)
        : req.body.witnessReports;
      updateData.witnessReports = reports;
    }

    Object.assign(incident, updateData);
    await incident.save();

    await incident.populate('createdBy', 'name email');
    await incident.populate('capa.assignedTo', 'name email');

    res.json({
      success: true,
      message: "Incident updated successfully",
      data: incident
    });
  } catch (err) {
    console.error('Update incident error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update incident"
    });
  }
};

// ✅ Delete Incident
export const deleteIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const incident = await Incident.findOneAndDelete(query);
    if (!incident) {
      return res.status(404).json({
        success: false,
        message: "Incident not found"
      });
    }

    res.json({
      success: true,
      message: "Incident deleted successfully"
    });
  } catch (err) {
    console.error('Delete incident error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete incident"
    });
  }
};

// ✅ Update Investigation
export const updateInvestigation = async (req, res) => {
  try {
    console.log('🔍 updateInvestigation called:', {
      incidentId: req.params.id,
      userRole: req.user?.role,
      userId: req.user?._id,
      body: req.body
    });

    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    const query = { _id: id };
    if (!isSuperadmin && hasValidCompany) {
      query.company = companyId;
    } else if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ updateInvestigation: No company assigned');
      return res.status(400).json({
        success: false,
        message: "Company assignment required"
      });
    }

    console.log('🔍 updateInvestigation query:', query);
    const incident = await Incident.findOne(query);
    if (!incident) {
      console.log('❌ updateInvestigation: Incident not found');
      return res.status(404).json({
        success: false,
        message: "Incident not found or access denied"
      });
    }

    console.log('✅ updateInvestigation: Incident found:', incident.incidentNumber);

    // Map frontend field names to backend field names
    const lead = req.body.lead || req.body.investigationLead;
    const findings = req.body.findings || req.body.analysis;
    const startDate = req.body.startDate;
    const completedDate = req.body.completedDate;
    const rootCause = req.body.rootCause;
    const rootCauseAnalysisMethod = req.body.rootCauseAnalysisMethod || req.body.rootCauseType;
    const fiveWhys = req.body.fiveWhys;
    const fishboneData = req.body.fishboneData;
    
    // Handle rootCauseAnalysis - can come directly or be constructed from parts
    let parsedRootCauseAnalysis = req.body.rootCauseAnalysis;
    
    // If rootCauseAnalysis is provided as a string, parse it
    if (typeof parsedRootCauseAnalysis === 'string' && parsedRootCauseAnalysis.trim() !== '') {
      try {
        parsedRootCauseAnalysis = JSON.parse(parsedRootCauseAnalysis);
      } catch (e) {
        // Keep as is if parsing fails
      }
    }
    
    // If rootCauseAnalysis is not provided but we have the parts, construct it
    if (!parsedRootCauseAnalysis && rootCauseAnalysisMethod && rootCause) {
      if (rootCauseAnalysisMethod === '5-why' && fiveWhys && Array.isArray(fiveWhys)) {
        parsedRootCauseAnalysis = {
          type: '5-why',
          rootCause: rootCause,
          findings: fiveWhys.filter(w => w && w.trim() !== ''),
          analysis: findings || req.body.analysis || ''
        };
      } else if (rootCauseAnalysisMethod === 'fishbone' && fishboneData) {
        // Convert fishbone data object to findings array
        const fishboneFindings = Object.entries(fishboneData)
          .filter(([key, value]) => value && value.trim() !== '')
          .map(([key, value]) => `${key}: ${value}`);
        
        parsedRootCauseAnalysis = {
          type: 'fishbone',
          rootCause: rootCause,
          findings: fishboneFindings,
          analysis: findings || req.body.analysis || ''
        };
      }
    }

    // Build investigation object, ensuring required fields are present
    // If investigation doesn't exist, we need all required fields
    // If it exists, we can merge with existing data
    const existingInvestigation = incident.investigation || {};
    
    // Validate required fields - if creating new investigation, both are required
    const newLead = lead || existingInvestigation.lead;
    const newFindings = findings || existingInvestigation.findings;
    
    if (!newLead || !newFindings) {
      return res.status(400).json({
        success: false,
        message: "Both 'lead' (or 'investigationLead') and 'findings' (or 'analysis') are required for investigation"
      });
    }

    incident.investigation = {
      lead: newLead,
      startDate: startDate ? new Date(startDate) : (existingInvestigation.startDate || new Date()),
      completedDate: completedDate ? new Date(completedDate) : existingInvestigation.completedDate,
      rootCauseAnalysis: parsedRootCauseAnalysis || existingInvestigation.rootCauseAnalysis,
      findings: newFindings
    };

    if (!incident.status || incident.status === 'open') {
      incident.status = 'investigating';
    }

    await incident.save();
    
    // Populate if lead is an ObjectId
    if (incident.investigation?.lead && typeof incident.investigation.lead === 'object') {
      await incident.populate('investigation.lead', 'name email');
    }

    res.json({
      success: true,
      message: "Investigation updated successfully",
      data: incident
    });
  } catch (err) {
    console.error('Update investigation error:', err);
    // Provide more detailed error message
    const errorMessage = err.message || "Failed to update investigation";
    const validationErrors = err.errors ? Object.keys(err.errors).map(key => ({
      field: key,
      message: err.errors[key].message
    })) : [];
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      errors: validationErrors.length > 0 ? validationErrors : undefined
    });
  }
};

// ✅ Update Injury Record
export const updateInjuryRecord = async (req, res) => {
  try {
    console.log('🔍 updateInjuryRecord called:', {
      incidentId: req.params.id,
      userRole: req.user?.role,
      userId: req.user?._id,
      body: req.body
    });

    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    const query = { _id: id };
    if (!isSuperadmin && hasValidCompany) {
      query.company = companyId;
    } else if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ updateInjuryRecord: No company assigned');
      return res.status(400).json({
        success: false,
        message: "Company assignment required"
      });
    }

    console.log('🔍 updateInjuryRecord query:', query);
    const incident = await Incident.findOne(query);
    if (!incident) {
      console.log('❌ updateInjuryRecord: Incident not found');
      return res.status(404).json({
        success: false,
        message: "Incident not found or access denied"
      });
    }

    console.log('✅ updateInjuryRecord: Incident found:', incident.incidentNumber);

    // Check if incident has an injury record
    let existingInjuryRecord = incident.injuryRecord || null;
    
    // If no injury record exists but incident is marked as having injury,
    // we'll create one using inferred/default values from the incident
    if (!existingInjuryRecord && incident.hasInjury) {
      // No required fields provided - we'll create a minimal injury record
      // using incident data as defaults
      existingInjuryRecord = {
        injuredWorker: req.body.injuredWorker || incident.reportedBy || 'Unknown Worker',
        injuryDate: req.body.injuryDate ? new Date(req.body.injuryDate) : (incident.date || new Date()),
        injuryType: req.body.injuryType || (incident.type === 'Driver Injury' ? 'Workplace Injury' : 'Other'),
        bodyPart: req.body.bodyPart || 'Not Specified',
        severity: req.body.severity || incident.severity || 'medium',
        modifiedDutyPlan: '',
        doctorRestrictions: '',
        returnToWorkDate: undefined,
        progressNotes: [],
        wcbClaimNumber: '',
        wcbDocuments: []
      };
      // Set it on the incident so it's available for merging
      incident.injuryRecord = existingInjuryRecord;
    } else if (!existingInjuryRecord) {
      // No injury record and incident not marked as having injury
      // Check if we have all required fields to create one
      const requiredFields = {
        injuredWorker: req.body.injuredWorker,
        injuryDate: req.body.injuryDate,
        injuryType: req.body.injuryType,
        bodyPart: req.body.bodyPart,
        severity: req.body.severity
      };
      
      // Check if all required fields are provided
      const missingFields = Object.entries(requiredFields)
        .filter(([key, value]) => !value || (typeof value === 'string' && value.trim() === ''))
        .map(([key]) => key);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `This incident does not have an injury record. To create one, please provide all required fields: ${missingFields.join(', ')}`
        });
      }
      
      // If we have all required fields, we'll create a new injury record
      incident.hasInjury = true;
      existingInjuryRecord = {};
    }
    const updateData = {};
    
    // Parse progress notes if provided as string
    if (req.body.progressNotes) {
      try {
        updateData.progressNotes = typeof req.body.progressNotes === 'string'
          ? JSON.parse(req.body.progressNotes)
          : req.body.progressNotes;
        // Convert date strings to Date objects
        if (Array.isArray(updateData.progressNotes)) {
          updateData.progressNotes = updateData.progressNotes.map((note) => ({
            ...note,
            date: note.date ? new Date(note.date) : new Date()
          }));
        }
      } catch (e) {
        // Keep as is if parsing fails
      }
    }

    // Handle date fields
    if (req.body.injuryDate) {
      updateData.injuryDate = new Date(req.body.injuryDate);
    }
    if (req.body.returnToWorkDate) {
      updateData.returnToWorkDate = new Date(req.body.returnToWorkDate);
    }

    // Copy other fields (only if provided)
    if (req.body.injuredWorker !== undefined) updateData.injuredWorker = req.body.injuredWorker;
    if (req.body.injuryType !== undefined) updateData.injuryType = req.body.injuryType;
    if (req.body.bodyPart !== undefined) updateData.bodyPart = req.body.bodyPart;
    if (req.body.severity !== undefined) updateData.severity = req.body.severity;
    if (req.body.modifiedDutyPlan !== undefined) updateData.modifiedDutyPlan = req.body.modifiedDutyPlan;
    if (req.body.doctorRestrictions !== undefined) updateData.doctorRestrictions = req.body.doctorRestrictions;
    if (req.body.wcbClaimNumber !== undefined) updateData.wcbClaimNumber = req.body.wcbClaimNumber;

    // Process WCB documents if uploaded
    if (req.files?.wcbDocuments && req.files.wcbDocuments.length > 0) {
      const wcbDocs = req.files.wcbDocuments.map(file => ({
        ...processFile(file),
        uploadedBy: req.user._id
      }));
      updateData.wcbDocuments = [...(existingInjuryRecord?.wcbDocuments || []), ...wcbDocs];
    }

    // Merge with existing injury record, ensuring all required fields are present
    // Required fields: injuredWorker, injuryDate, injuryType, bodyPart, severity
    const mergedInjuryRecord = {
      // If creating new record, use values from request body
      // If updating existing, preserve existing required fields if not being updated
      injuredWorker: (updateData.injuredWorker && updateData.injuredWorker.trim() !== '') 
        ? updateData.injuredWorker 
        : (existingInjuryRecord?.injuredWorker || req.body.injuredWorker || ''),
      injuryDate: updateData.injuryDate 
        ? updateData.injuryDate 
        : (existingInjuryRecord?.injuryDate ? existingInjuryRecord.injuryDate : (req.body.injuryDate ? new Date(req.body.injuryDate) : new Date())),
      injuryType: (updateData.injuryType && updateData.injuryType.trim() !== '') 
        ? updateData.injuryType 
        : (existingInjuryRecord?.injuryType || req.body.injuryType || ''),
      bodyPart: (updateData.bodyPart && updateData.bodyPart.trim() !== '') 
        ? updateData.bodyPart 
        : (existingInjuryRecord?.bodyPart || req.body.bodyPart || ''),
      severity: (updateData.severity && updateData.severity.trim() !== '') 
        ? updateData.severity 
        : (existingInjuryRecord?.severity || req.body.severity || ''),
      // Optional fields
      modifiedDutyPlan: updateData.modifiedDutyPlan !== undefined ? updateData.modifiedDutyPlan : (existingInjuryRecord?.modifiedDutyPlan),
      doctorRestrictions: updateData.doctorRestrictions !== undefined ? updateData.doctorRestrictions : (existingInjuryRecord?.doctorRestrictions),
      returnToWorkDate: updateData.returnToWorkDate || existingInjuryRecord?.returnToWorkDate,
      progressNotes: updateData.progressNotes || existingInjuryRecord?.progressNotes || [],
      wcbClaimNumber: updateData.wcbClaimNumber !== undefined ? updateData.wcbClaimNumber : (existingInjuryRecord?.wcbClaimNumber),
      wcbDocuments: updateData.wcbDocuments || existingInjuryRecord?.wcbDocuments || []
    };

    // Validate that all required fields are present and not empty
    if (!mergedInjuryRecord.injuredWorker || mergedInjuryRecord.injuredWorker.trim() === '' ||
        !mergedInjuryRecord.injuryDate ||
        !mergedInjuryRecord.injuryType || mergedInjuryRecord.injuryType.trim() === '' ||
        !mergedInjuryRecord.bodyPart || mergedInjuryRecord.bodyPart.trim() === '' ||
        !mergedInjuryRecord.severity || mergedInjuryRecord.severity.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Missing required fields for injury record. Required: injuredWorker, injuryDate, injuryType, bodyPart, severity. The existing injury record may be incomplete."
      });
    }

    incident.injuryRecord = mergedInjuryRecord;

    incident.hasInjury = true;
    await incident.save();

    res.json({
      success: true,
      message: "Injury record updated successfully",
      data: incident
    });
  } catch (err) {
    console.error('Update injury record error:', err);
    // Provide more detailed error message
    const errorMessage = err.message || "Failed to update injury record";
    const validationErrors = err.errors ? Object.keys(err.errors).map(key => ({
      field: key,
      message: err.errors[key].message
    })) : [];
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      errors: validationErrors.length > 0 ? validationErrors : undefined
    });
  }
};

