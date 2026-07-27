import { Paystub } from "../../models/hr/paystubModel.js";
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { CompanySettings } from "../../models/driver/companysettingsModel.js";
import { DeductionAddition } from "../../models/hr/settlementModel.js";

// ✅ Get all paystubs
export const getPaystubs = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { userId, startDate, endDate, search, workType, role } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    // Build filter
    const filter = {};
    if (!isSuperadmin) {
      filter.company = companyId;
    }

    if (userId) {
      filter.userId = userId;
    }

    // Filter by workType (Employee, Driver, Owner-Operator)
    if (workType) {
      filter.workType = workType;
    }

    // Filter by role
    if (role) {
      filter.employeeRole = role;
    }

    if (startDate || endDate) {
      filter['payPeriod.payDate'] = {};
      if (startDate) {
        filter['payPeriod.payDate'].$gte = new Date(startDate);
      }
      if (endDate) {
        filter['payPeriod.payDate'].$lte = new Date(endDate);
      }
    }

    // Get paystubs
    let paystubs = await Paystub.find(filter)
      .populate('userId', 'name email role internalId companyFlag details')
      .populate('payrollId', 'baseSalary bonus deductions totalSalary')
      .populate('company', 'name')
      .sort({ 'payPeriod.payDate': -1 })
      .lean();

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      paystubs = paystubs.filter(paystub => {
        const nameMatch = paystub.employeeName?.toLowerCase().includes(searchLower);
        const idMatch = paystub.employeeId?.toLowerCase().includes(searchLower);
        const emailMatch = paystub.employeeEmail?.toLowerCase().includes(searchLower);
        return nameMatch || idMatch || emailMatch;
      });
    }

    res.json({
      success: true,
      message: "Paystubs fetched successfully",
      data: paystubs
    });
  } catch (error) {
    console.error("❌ Error fetching paystubs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching paystubs",
      error: error.message
    });
  }
};

// ✅ Get paystub by ID
export const getPaystubById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const filter = { _id: id };
    if (!isSuperadmin) {
      filter.company = companyId;
    }

    const paystub = await Paystub.findOne(filter)
      .populate('userId', 'name email role internalId phone country state city companyFlag details')
      .populate('payrollId')
      .populate('company', 'name address phone email logoUrl')
      .lean();

    if (!paystub) {
      return res.status(404).json({
        success: false,
        message: "Paystub not found"
      });
    }

    // Fetch company logo from CompanySettings if not in paystub.companyDetails
    if (!paystub.companyDetails?.companyLogo || paystub.companyDetails.companyLogo === '') {
      try {
        const companyId = paystub.company?._id || paystub.company;
        if (companyId) {
          const companySettings = await CompanySettings.findById(companyId).lean();
          if (companySettings && companySettings.logoUrl) {
            if (!paystub.companyDetails) {
              paystub.companyDetails = {};
            }
            paystub.companyDetails.companyLogo = companySettings.logoUrl;
          }
        }
      } catch (err) {
        console.error('Error fetching company logo from CompanySettings:', err);
      }
    }

    // Generate signed URL for company logo if it exists and is an S3 URL
    const logoUrlToSign = paystub.companyDetails?.companyLogo || paystub.company?.logoUrl;
    if (logoUrlToSign) {
      try {
        const logoUrl = logoUrlToSign;
        const isS3Url = logoUrl.includes('s3.amazonaws.com') || logoUrl.includes('.s3.');
        
        if (isS3Url) {
          const { getS3ClientForBucket } = await import("../../config/awsConfig.js");
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          
          // Parse S3 URL to get bucket and key
          const cleanUrl = logoUrl.split('?')[0].split('#')[0];
          const urlObj = new URL(cleanUrl);
          let bucketName = process.env.AWS_S3_BUCKET_NAME;
          let key = decodeURIComponent(urlObj.pathname.substring(1));
          
          if (urlObj.hostname.includes('.s3.')) {
            bucketName = urlObj.hostname.split('.s3.')[0];
            key = decodeURIComponent(urlObj.pathname.substring(1));
          } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            bucketName = pathParts[0];
            key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
          }
          
          if (key.includes('?')) key = key.split('?')[0];
          if (key.includes('&')) key = key.split('&')[0];
          
          // Get the correct S3 client for the bucket
          const s3Client = await getS3ClientForBucket(bucketName, logoUrl);
          
          if (s3Client) {
            // Determine content type based on file extension
            const getContentType = (fileUrl) => {
              const ext = fileUrl.split('.').pop()?.toLowerCase();
              const mimeMap = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'svg': 'image/svg+xml'
              };
              return mimeMap[ext] || 'image/jpeg';
            };
            
            const contentType = getContentType(logoUrl);
            const command = new GetObjectCommand({
              Bucket: bucketName,
              Key: key,
              ResponseContentType: contentType
            });
            
            const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            if (!paystub.companyDetails) {
              paystub.companyDetails = {};
            }
            paystub.companyDetails.companyLogo = signedUrl;
            console.log('✅ Generated signed URL for company logo in paystub');
          }
        }
      } catch (s3Error) {
        console.error('❌ Error generating signed URL for company logo:', s3Error);
        // Keep original URL if signing fails
      }
    }

    // Fetch additions and deductions from driver profile (DeductionAddition model)
    if (paystub.userId && paystub.payPeriod) {
      try {
        const driverId = paystub.userId._id || paystub.userId;
        const payPeriodStart = new Date(paystub.payPeriod.startDate);
        const payPeriodEnd = new Date(paystub.payPeriod.endDate);
        
        // Fetch active additions and deductions for this driver
        const driverAdditionsDeductions = await DeductionAddition.find({
          assignedTo: driverId,
          isActive: true,
          company: paystub.company?._id || paystub.company
        }).lean();

        // Helper function to check if an item should be included in this pay period
        const shouldIncludeItem = (item) => {
          const itemStart = item.startDate ? new Date(item.startDate) : null;
          const itemEnd = item.endDate ? new Date(item.endDate) : null;
          
          // If no start date, don't include (should have a start date)
          if (!itemStart) {
            return false;
          }
          
          // For one-time items: include if start date is within or on the pay period
          const recurrence = (item.recurrence || '').toString().trim().toLowerCase();
          const isOneTime = recurrence === 'one-time' || recurrence === 'one time' || recurrence === 'onetime';
          if (isOneTime) {
            // Include if start date is on or before pay period end, and (no end date or end date is on or after pay period start)
            return itemStart <= payPeriodEnd && (!itemEnd || itemEnd >= payPeriodStart);
          }
          
          // For recurring items: include if the item is active during the pay period
          // Item is active if:
          // 1. Start date is on or before pay period end, AND
          // 2. (No end date OR end date is on or after pay period start)
          if (itemStart <= payPeriodEnd) {
            if (!itemEnd || itemEnd >= payPeriodStart) {
              // For recurring items, check if at least one occurrence falls within the pay period
              // This is a simplified check - for Monthly/Weekly/etc, we include if the item is active
              // and the start date is within or before the pay period
              return true;
            }
          }
          
          return false;
        };

        // Filter and format additions
        const additions = [];
        for (const item of driverAdditionsDeductions) {
          if (item.type === 'Addition' && shouldIncludeItem(item)) {
            // Use the item's start date if it's within the pay period, otherwise use pay period start
            const itemStartDate = new Date(item.startDate);
            let effectiveDate;
            if (itemStartDate >= payPeriodStart && itemStartDate <= payPeriodEnd) {
              // Item starts within the pay period - use item start date
              effectiveDate = itemStartDate;
            } else if (itemStartDate < payPeriodStart) {
              // Item started before pay period - use pay period start
              effectiveDate = payPeriodStart;
            } else {
              // Item starts after pay period (shouldn't happen due to shouldIncludeItem check, but just in case)
              effectiveDate = payPeriodStart;
            }
            
            // Format recurrence for display
            let perDisplay = 'One Time';
            if (item.recurrence === 'Weekly') {
              perDisplay = 'Weekly';
            } else if (item.recurrence === 'Bi-weekly') {
              perDisplay = 'Bi-weekly';
            } else if (item.recurrence === 'Monthly') {
              perDisplay = 'Monthly';
            } else if (item.recurrence === 'Quarterly') {
              perDisplay = 'Quarterly';
            } else if (item.recurrence === 'Yearly') {
              perDisplay = 'Yearly';
            }
            
            additions.push({
              loadDate: effectiveDate.toISOString(),
              memo: item.name || item.description || '',
              amount: item.amount || 0,
              per: perDisplay,
              gst: 0, // GST can be calculated if needed
              totalCAD: item.currency === 'USD' ? (item.amount || 0) * 1.35 : (item.amount || 0), // Simple conversion, adjust as needed
              _id: item._id
            });
          }
        }

        // Filter and format deductions (excluding taxes which are already in deductionsBreakdown)
        // Format deductions like additions with same structure
        const deductions = [];
        const deductionsBreakdown = [];
        
        for (const item of driverAdditionsDeductions) {
          if (item.type === 'Deduction' && shouldIncludeItem(item)) {
            // Only include non-tax deductions (taxes are already in deductionsBreakdown from paystub)
            const deductionType = item.name || item.description || 'Other Deduction';
            const isTax = deductionType.toLowerCase().includes('tax') || 
                         deductionType.toLowerCase().includes('income') ||
                         deductionType.toLowerCase().includes('social security') ||
                         deductionType.toLowerCase().includes('medicare') ||
                         deductionType.toLowerCase().includes('cpp') ||
                         deductionType.toLowerCase().includes('ei') ||
                         deductionType.toLowerCase().includes('disability') ||
                         deductionType.toLowerCase().includes('local');
            
            if (!isTax) {
              // Use the item's start date if it's within the pay period, otherwise use pay period start
              const itemStartDate = new Date(item.startDate);
              let effectiveDate;
              if (itemStartDate >= payPeriodStart && itemStartDate <= payPeriodEnd) {
                // Item starts within the pay period - use item start date
                effectiveDate = itemStartDate;
              } else if (itemStartDate < payPeriodStart) {
                // Item started before pay period - use pay period start
                effectiveDate = payPeriodStart;
              } else {
                // Item starts after pay period (shouldn't happen due to shouldIncludeItem check, but just in case)
                effectiveDate = payPeriodStart;
              }
              
              // Format recurrence for display
              let perDisplay = 'One Time';
              if (item.recurrence === 'Weekly') {
                perDisplay = 'Weekly';
              } else if (item.recurrence === 'Bi-weekly') {
                perDisplay = 'Bi-weekly';
              } else if (item.recurrence === 'Monthly') {
                perDisplay = 'Monthly';
              } else if (item.recurrence === 'Quarterly') {
                perDisplay = 'Quarterly';
              } else if (item.recurrence === 'Yearly') {
                perDisplay = 'Yearly';
              }
              
              // Format deduction like addition
              deductions.push({
                loadDate: effectiveDate.toISOString(),
                memo: deductionType,
                amount: item.amount || 0,
                per: perDisplay,
                gst: 0, // GST can be calculated if needed
                totalCAD: item.currency === 'USD' ? (item.amount || 0) * 1.35 : (item.amount || 0), // Simple conversion, adjust as needed
                _id: item._id
              });
              
              // Also add to deductionsBreakdown for backward compatibility
              deductionsBreakdown.push({
                type: deductionType,
                amount: item.amount || 0,
                _id: item._id
              });
            }
          }
        }

        // Replace paystub additions with driver profile data
        paystub.additions = additions;
        
        // Get existing tax deductions from paystub for deductionsBreakdown (preserve for calculations)
        let existingTaxDeductions = [];
        const deductionsObject = paystub.deductions || {};
        if (deductionsObject.deductionsBreakdown && Array.isArray(deductionsObject.deductionsBreakdown)) {
          existingTaxDeductions = deductionsObject.deductionsBreakdown.filter((d) => {
            const type = (d.type || '').toLowerCase();
            return type.includes('tax') || 
                   type.includes('income') ||
                   type.includes('social security') ||
                   type.includes('medicare') ||
                   type.includes('cpp') ||
                   type.includes('ei') ||
                   type.includes('disability') ||
                   type.includes('local tax');
          });
        }
        
        // Replace deductions with array format (like additions)
        // Only include driver profile deductions (non-tax), NOT tax deductions
        // Tax deductions should remain in deductionsBreakdown for calculations but not shown in the deductions table
        paystub.deductions = deductions;
        
        // Preserve deductionsBreakdown with tax deductions for backward compatibility and calculations
        // This keeps the original structure for any code that depends on it
        if (!paystub.deductionsBreakdown) {
          paystub.deductionsBreakdown = [];
        }
        paystub.deductionsBreakdown = [...existingTaxDeductions, ...deductionsBreakdown];
        
        console.log(`✅ Fetched ${additions.length} additions and ${deductions.length} deductions from driver profile (excluding tax deductions)`);
      } catch (error) {
        console.error('❌ Error fetching driver additions/deductions:', error);
        // Continue with existing paystub data if there's an error
      }
    }

    res.json({
      success: true,
      message: "Paystub fetched successfully",
      data: paystub
    });
  } catch (error) {
    console.error("❌ Error fetching paystub:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching paystub",
      error: error.message
    });
  }
};

// ✅ Get paystubs by user ID
export const getPaystubsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const filter = { userId };
    if (!isSuperadmin) {
      filter.company = companyId;
    }

    const paystubs = await Paystub.find(filter)
      .populate('payrollId', 'baseSalary bonus deductions totalSalary')
      .sort({ 'payPeriod.payDate': -1 })
      .lean();

    res.json({
      success: true,
      message: "Paystubs fetched successfully",
      data: paystubs
    });
  } catch (error) {
    console.error("❌ Error fetching paystubs by user:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching paystubs",
      error: error.message
    });
  }
};

// ✅ Get paystub by payroll ID
export const getPaystubByPayrollId = async (req, res) => {
  try {
    const { payrollId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const filter = { payrollId };
    if (!isSuperadmin) {
      filter.company = companyId;
    }

    const paystub = await Paystub.findOne(filter)
      .populate('userId', 'name email role internalId phone country state city companyFlag details')
      .populate('payrollId')
      .populate('company', 'name address phone email')
      .lean();

    if (!paystub) {
      return res.status(404).json({
        success: false,
        message: "Paystub not found for this payroll"
      });
    }

    res.json({
      success: true,
      message: "Paystub fetched successfully",
      data: paystub
    });
  } catch (error) {
    console.error("❌ Error fetching paystub by payroll ID:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching paystub",
      error: error.message
    });
  }
};

// ✅ Update paystub status
export const updatePaystubStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!['draft', 'issued', 'void'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'draft', 'issued', or 'void'"
      });
    }

    const filter = { _id: id };
    if (!isSuperadmin) {
      filter.company = companyId;
    }

    const paystub = await Paystub.findOneAndUpdate(
      filter,
      { status },
      { new: true }
    );

    if (!paystub) {
      return res.status(404).json({
        success: false,
        message: "Paystub not found"
      });
    }

    res.json({
      success: true,
      message: "Paystub status updated successfully",
      data: paystub
    });
  } catch (error) {
    console.error("❌ Error updating paystub status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating paystub status",
      error: error.message
    });
  }
};

// ✅ Delete paystub (soft delete by setting status to void)
export const deletePaystub = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const filter = { _id: id };
    if (!isSuperadmin) {
      filter.company = companyId;
    }

    const paystub = await Paystub.findOneAndUpdate(
      filter,
      { status: 'void' },
      { new: true }
    );

    if (!paystub) {
      return res.status(404).json({
        success: false,
        message: "Paystub not found"
      });
    }

    res.json({
      success: true,
      message: "Paystub voided successfully",
      data: paystub
    });
  } catch (error) {
    console.error("❌ Error deleting paystub:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting paystub",
      error: error.message
    });
  }
};

