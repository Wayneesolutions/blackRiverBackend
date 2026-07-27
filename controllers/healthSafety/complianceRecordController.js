import { PolicyDocument } from "../../models/healthSafety/policyDocumentModel.js";
import { Training } from "../../models/healthSafety/trainingModel.js";
import { Certificate } from "../../models/healthSafety/certificateModel.js";
import { Incident } from "../../models/healthSafety/incidentModel.js";
import { Hazard } from "../../models/healthSafety/hazardModel.js";
import { Inspection } from "../../models/healthSafety/inspectionModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Get All Compliance Records (Aggregated from all modules)
export const getComplianceRecords = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    // Fetch all data in parallel
    const [policies, trainings, certificates, incidents, hazards, inspections] = await Promise.all([
      PolicyDocument.find(query).populate('createdBy', 'name email').lean(),
      Training.find(query).populate('createdBy', 'name email').lean(),
      Certificate.find(query).populate('employeeId', 'name email role').lean(),
      Incident.find(query).populate('createdBy', 'name email').lean(),
      Hazard.find(query).populate('createdBy', 'name email').lean(),
      Inspection.find(query).populate('createdBy', 'name email').lean()
    ]);

    // Map policies to PolicyRecord format
    const policyRecords = policies.map(policy => {
      const today = new Date();
      const reviewDate = new Date(policy.reviewDate);
      const daysUntilReview = (reviewDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
      
      let status = policy.status;
      if (status === 'active' && daysUntilReview > 0 && daysUntilReview <= 90) {
        status = 'expiring';
      } else if (status === 'active' && daysUntilReview < 0) {
        status = 'expired';
      }

      let complianceLevel = 'compliant';
      if (status === 'expired') {
        complianceLevel = 'non-compliant';
      } else if (status === 'expiring') {
        complianceLevel = 'at-risk';
      }

      return {
        _id: policy._id.toString(),
        recordId: policy.policyNumber || `POL-${policy._id}`,
        title: policy.title,
        policyType: policy.category?.toLowerCase().includes('safety') ? 'safety' :
                   policy.category?.toLowerCase().includes('hr') ? 'hr' :
                   policy.category?.toLowerCase().includes('driver') ? 'driver' :
                   policy.category?.toLowerCase().includes('shop') ? 'shop' : 'wellness',
        specificPolicyName: policy.title,
        category: policy.category || 'Internal Policy',
        status: status,
        issueDate: policy.effectiveDate ? new Date(policy.effectiveDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        expiryDate: policy.reviewDate ? new Date(policy.reviewDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        renewalCycle: 12, // Default, can be calculated from reviewDate - effectiveDate
        lastReviewed: policy.lastReviewedDate ? new Date(policy.lastReviewedDate).toISOString().split('T')[0] : null,
        nextReviewDate: policy.reviewDate ? new Date(policy.reviewDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        responsiblePerson: policy.approvedBy?.name || policy.createdBy?.name || 'N/A',
        department: policy.category || 'Safety',
        complianceLevel: complianceLevel,
        assignedRoles: [], // Not in current schema
        acknowledgments: [], // Not in current schema
        versionHistory: [], // Not in current schema
        currentVersion: policy.version || '1.0',
        documentUrl: policy.fileUrl || '',
        autoAssignOnHire: false,
        remindersSent: [],
        linkedTraining: []
      };
    });

    // Map certificates to TrainingRecord format
    const trainingRecords = certificates.map(cert => {
      const today = new Date();
      const expiryDate = cert.expiryDate ? new Date(cert.expiryDate) : null;
      
      let status = 'active';
      let complianceLevel = 'compliant';
      
      if (expiryDate) {
        const daysUntilExpiry = (expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
        if (daysUntilExpiry < 0) {
          status = 'expired';
          complianceLevel = 'non-compliant';
        } else if (daysUntilExpiry <= 60) {
          status = 'expiring';
          complianceLevel = 'at-risk';
        }
      }

      return {
        _id: cert._id.toString(),
        recordId: cert.certificateNumber || `CERT-${cert._id}`,
        title: cert.type || 'Training Certificate',
        trainingType: cert.type || 'Certificate',
        category: 'Federal Compliance',
        status: status,
        issueDate: cert.issueDate ? new Date(cert.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        expiryDate: expiryDate ? expiryDate.toISOString().split('T')[0] : null,
        certificateNumber: cert.certificateNumber || '',
        certificateUrl: cert.certificateUrl || '',
        instructor: cert.issuingAuthority || 'N/A',
        employeeName: cert.employeeId?.name || cert.employee || 'N/A',
        employeeId: cert.employeeId?._id?.toString() || cert.employeeId?.toString() || '',
        department: cert.employeeId?.role || 'Operations',
        validityPeriod: expiryDate && cert.issueDate ? 
          Math.round((new Date(expiryDate).getTime() - new Date(cert.issueDate).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 24,
        automaticRenewalReminder: true,
        reminderDaysBefore: 60,
        complianceLevel: complianceLevel
      };
    });

    // Map trainings to TrainingRecord format
    const trainingModuleRecords = trainings.map(training => {
      const today = new Date();
      const expiryDate = training.expiryDate ? new Date(training.expiryDate) : null;
      
      let status = training.status || 'active';
      let complianceLevel = 'compliant';
      
      if (expiryDate) {
        const daysUntilExpiry = (expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
        if (daysUntilExpiry < 0) {
          status = 'expired';
          complianceLevel = 'non-compliant';
        } else if (daysUntilExpiry <= 60) {
          status = 'expiring';
          complianceLevel = 'at-risk';
        }
      }

      return {
        _id: training._id.toString(),
        recordId: training.trainingNumber || `TRN-${training._id}`,
        title: training.title,
        trainingType: training.type || 'Training',
        category: 'Federal Compliance',
        status: status,
        issueDate: training.date ? new Date(training.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        expiryDate: expiryDate ? expiryDate.toISOString().split('T')[0] : null,
        certificateNumber: training.trainingNumber || '',
        certificateUrl: training.materials?.[0]?.fileUrl || '',
        instructor: training.instructor || 'N/A',
        employeeName: 'Multiple Participants',
        employeeId: '',
        department: training.location || 'Operations',
        validityPeriod: expiryDate && training.date ? 
          Math.round((new Date(expiryDate).getTime() - new Date(training.date).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 24,
        automaticRenewalReminder: true,
        reminderDaysBefore: 60,
        complianceLevel: complianceLevel
      };
    });

    // Map incidents to IncidentRecord format
    const incidentRecords = incidents.map(incident => {
      let complianceLevel = 'compliant';
      if (!incident.investigation || !incident.investigation.completedDate) {
        complianceLevel = 'at-risk';
      }

      // Map incident type
      let incidentType = 'workplace-incident';
      if (incident.type === 'Driver Injury') {
        incidentType = 'driver-injury';
      } else if (incident.type === 'Vehicle Accident') {
        incidentType = 'vehicle-accident';
      } else if (incident.type === 'Near Miss') {
        incidentType = 'near-miss';
      }

      // Map status
      let status = 'reported';
      if (incident.investigation && incident.investigation.completedDate) {
        status = 'closed';
      } else if (incident.investigation) {
        status = 'investigating';
      } else if (incident.status === 'open') {
        status = 'reported';
      } else {
        status = incident.status || 'reported';
      }

      return {
        _id: incident._id.toString(),
        recordId: incident.incidentNumber || `INC-${incident._id}`,
        title: incident.type || 'Incident Report',
        incidentType: incidentType,
        category: 'Internal Policy',
        status: status,
        incidentDate: incident.date ? new Date(incident.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        reportedDate: incident.reportedDate ? new Date(incident.reportedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        location: typeof incident.location === 'string' ? incident.location : (incident.location?.address || 'N/A'),
        reportedBy: incident.reportedBy || incident.createdBy?.name || 'N/A',
        involvedPersons: incident.involvedPersons || [],
        witnesses: (incident.witnessReports || []).map((w) => ({
          name: w.witnessName || 'N/A',
          statement: w.statement || ''
        })),
        description: incident.description || '',
        photosVideos: [...(incident.photoEvidence || []).map((p) => p.fileUrl || ''), ...(incident.videoEvidence || []).map((v) => v.fileUrl || '')].filter(Boolean),
        investigationMethod: incident.investigation?.rootCauseAnalysis?.type || null,
        investigationNotes: incident.investigation?.findings || '',
        correctiveActions: incident.capa ? [incident.capa.description] : [],
        wcbClaimNumber: incident.wcbClaimNumber || incident.injuryRecord?.wcbClaimNumber || null,
        wcbDocuments: (incident.wcbDocuments || []).map((d) => d.fileUrl || ''),
        severity: incident.severity || 'moderate',
        complianceLevel: complianceLevel
      };
    });

    // Map hazards to HazardRecord format
    const hazardRecords = hazards.map(hazard => {
      let complianceLevel = 'compliant';
      if (hazard.status === 'identified' || hazard.status === 'assessed') {
        complianceLevel = 'at-risk';
      } else if (hazard.status === 'resolved' && !hazard.resolvedDate) {
        complianceLevel = 'at-risk';
      }

      // Calculate risk rating from severity
      const severityMap = { 'low': 1, 'medium': 3, 'high': 4, 'critical': 5 };
      const likelihood = 3; // Default
      const severity = severityMap[hazard.severity?.toLowerCase()] || 3;
      const total = likelihood * severity;

      return {
        _id: hazard._id.toString(),
        recordId: hazard.hazardNumber || `HAZ-${hazard._id}`,
        title: hazard.description || 'Hazard Report',
        hazardType: hazard.category || 'General',
        category: 'Federal Compliance',
        status: hazard.status === 'resolved' ? 'closed' : (hazard.status || 'reported'),
        reportedDate: hazard.identifiedDate ? new Date(hazard.identifiedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        reportedBy: hazard.createdBy?.name || 'N/A',
        location: hazard.location || 'N/A',
        description: hazard.description || '',
        riskRating: {
          likelihood: likelihood,
          severity: severity,
          total: total
        },
        correctiveActions: hazard.controlMeasures ? [hazard.controlMeasures] : [],
        assignedTo: hazard.assignedTo?.toString() || 'N/A',
        deadline: hazard.dueDate ? new Date(hazard.dueDate).toISOString().split('T')[0] : null,
        resolutionVerified: hazard.status === 'resolved' && hazard.resolvedDate ? true : false,
        verificationDate: hazard.resolvedDate ? new Date(hazard.resolvedDate).toISOString().split('T')[0] : null,
        photos: [],
        complianceLevel: complianceLevel
      };
    });

    // Map inspections to InspectionRecord format
    const inspectionRecords = inspections.map(inspection => {
      let complianceLevel = 'compliant';
      if (inspection.status === 'overdue') {
        complianceLevel = 'non-compliant';
      } else if (inspection.findings && inspection.findings.length > 0) {
        complianceLevel = 'at-risk';
      }

      // Map findings to checklist format
      const checklist = (inspection.findings || []).map((f) => ({
        item: f.description || 'Finding',
        status: f.status === 'resolved' || f.status === 'closed' ? 'pass' : 'fail',
        notes: f.correctiveAction || '',
        photo: null
      }));

      return {
        _id: inspection._id.toString(),
        recordId: inspection.inspectionNumber || `INS-${inspection._id}`,
        title: inspection.title || 'Safety Inspection',
        inspectionType: inspection.type || 'General Inspection',
        category: 'Internal Policy',
        status: inspection.status === 'completed' ? 'completed' : (inspection.status || 'scheduled'),
        inspectionDate: inspection.date ? new Date(inspection.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        inspector: inspection.inspector || inspection.createdBy?.name || 'N/A',
        location: inspection.location || 'N/A',
        checklist: checklist,
        findingsCount: inspection.findings?.length || 0,
        correctiveActions: (inspection.findings || []).map((f) => f.correctiveAction || '').filter((a) => a),
        photos: [],
        nextInspectionDate: inspection.scheduledDate ? new Date(inspection.scheduledDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        complianceLevel: complianceLevel
      };
    });

    // Combine all records
    const allRecords = [
      ...policyRecords,
      ...trainingRecords,
      ...trainingModuleRecords,
      ...incidentRecords,
      ...hazardRecords,
      ...inspectionRecords
    ];

    res.json({
      success: true,
      data: allRecords,
      stats: {
        totalRecords: allRecords.length,
        policies: policyRecords.length,
        training: trainingRecords.length + trainingModuleRecords.length,
        incidents: incidentRecords.length,
        hazards: hazardRecords.length,
        inspections: inspectionRecords.length,
        expiringRecords: allRecords.filter(r => r.status === 'expiring').length,
        expiredRecords: allRecords.filter(r => r.status === 'expired').length,
        compliantRecords: allRecords.filter(r => r.complianceLevel === 'compliant').length,
        atRiskRecords: allRecords.filter(r => r.complianceLevel === 'at-risk').length
      }
    });
  } catch (err) {
    console.error('Get compliance records error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch compliance records"
    });
  }
};
