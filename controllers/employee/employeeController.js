import { User } from "../../models/driver/userModel.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { validationResult } from "express-validator";
import { getCoordinatesFromAddress } from "../../services/googlemap.js";
import { checkRoleCreationPermission } from "../../utils/subscriptionPermissions.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mongoose from "mongoose";
import { s3 } from "../../config/awsConfig.js";
import { sendEmployeeInviteEmail } from "../../services/emailService.js";
import { parseImportFile, mapRow } from "../../utils/importParser.js";

// ✅ CREATE EMPLOYEE
export const createEmployee = async (req, res) => {
    try {
        console.log('📁 File upload info (create):', {
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : 'No file uploaded',
            files: req.files ? {
                keys: Object.keys(req.files),
                file: req.files.file ? {
                    count: req.files.file.length,
                    first: {
                        fieldname: req.files.file[0].fieldname,
                        originalname: req.files.file[0].originalname,
                        mimetype: req.files.file[0].mimetype,
                        size: req.files.file[0].size
                    }
                } : 'No file field'
            } : 'No files'
        });
        console.log('🔄 Creating employee with data:', req.body);
        console.log('📋 employmentType from body:', req.body.employmentType);
        console.log('📋 jobTime from body:', req.body.jobTime);
        
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: errors.array()
            });
        }

        const {
            name,
            email,
            phone,
            country,
            password,
            role,
            policies,
            state,
            city,
            joinDate,
            dob,
            internalId,
            address,
            status = 'active',
            company,
            // Employee-specific fields
            title,
            department,
            jobType,
            jobTime,
            employmentType, // Frontend sends this, map to jobTime
            payType,
            notes,
            // Related data
            documents,
            deductions,
            additions,
            // Driver-specific fields
            incorporation,
            employeeCode,
            postalCode,
            fleet,
            citizenship,
            paymentMethod,
            account,
            wsib,
            wsibAccountNo,
            expiryDate,
            remark,
            gstNo,
            profileImage,
            companyFlag,
            cell1,
            cell2,
            extension,
            fax,
            gender,
            dateOfBirth,
            hireDate,
            termDate,
            csa,
            fastCardNo,
            fastCardExpiry,
            medicalRequired,
            defaultChargeName,
            defaultCurrency,
            chargesAppliedOn,
            defaultMode,
            defaultAmount,
            defaultRemarks,
            defaultPayrollType,
            paymentCurrency,
            mileRate,
            mileRateTeam,
            emptyMileRate,
            emptyMileRateTeam,
            hourlyRate,
            weightRate,
            percentageRate,
            localTaxNo,
            federalTaxNo,
            sinNo,
            craAccountNo,
            fedTaxExempt,
            provTaxExempt,
            cppQppExempt,
            eiExempt,
            qpipExempt,
            payPeriod,
            vacationPay,
            payRate,
            ltl,
            onSettlements,
            settlementCurrencyByOrder,
            isDefault
        } = req.body;

        // Get the requesting admin/user
        const requestingUserId = req.user._id;
        const requestingUser = await User.findById(requestingUserId);

        // Check if admin/user has company settings (except superadmin)
        if (requestingUser && requestingUser.role !== 'superadmin') {
            if (!requestingUser.company) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete company settings first before creating users. Go to Company Settings to set up your company."
                });
            }

            // Check subscription permissions
            // Role is required, no default
            const roleToCheck = role;
            
            const permissionCheck = await checkRoleCreationPermission(requestingUserId, roleToCheck);
            
            if (!permissionCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    message: permissionCheck.reason || "You don't have permission to create users with this role"
                });
            }
        }

        // Check if employee already exists
        const existingEmployee = await User.findOne({ email });
        if (existingEmployee) {
            return res.status(400).json({
                success: false,
                message: "Employee with this email already exists"
            });
        }

        // If password provided by admin, use it; otherwise generate invite flow
        let inviteRawToken = null;
        let inviteHashedToken = null;
        let hashedPassword;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 12);
        } else {
            inviteRawToken = crypto.randomBytes(32).toString("hex");
            inviteHashedToken = crypto.createHash("sha256").update(inviteRawToken).digest("hex");
            const tempPassword = crypto.randomBytes(24).toString("hex");
            hashedPassword = await bcrypt.hash(tempPassword, 12);
        }

        // Get coordinates from address if provided
        let coordinates = { latitude: null, longitude: null };
        if (address) {
            console.log('🗺️ Getting coordinates for address:', address);
            coordinates = await getCoordinatesFromAddress(address);
            console.log('📍 Coordinates received:', coordinates);
        }

        // Handle profile image upload
        let profileImageUrl = null;
        const profileImageFile = req.files?.file?.[0] || req.file; // Support both fields() and single() upload
        if (profileImageFile) {
            if (process.env.NODE_ENV === "production") {
                profileImageUrl = profileImageFile.location; // S3 URL
            } else {
                profileImageUrl = `${req.protocol}://${req.get("host")}/${profileImageFile.path.replace(/\\/g, '/')}`; // Local URL
            }
            console.log('✅ Profile image uploaded:', profileImageUrl);
        } else if (profileImage) {
            // If profileImage is provided in body (for backward compatibility)
            profileImageUrl = profileImage;
            console.log('✅ Profile image from body:', profileImageUrl);
        } else {
            console.log('⚠️ No profile image provided');
        }

        // Set company: use provided company, or creator's company, or null
        // This ensures all users created by an admin/HR belong to the same company
        const userCompany = company || requestingUser?.company || null;
        
        // Build employee data - only include fields that are provided
        const employeeData = {
            name: name,
            email,
            role,
            password: hashedPassword,
            status: status || 'active',
            company: userCompany, // Use creator's company if not specified
            ...(inviteHashedToken ? {
                passwordResetToken: inviteHashedToken,
                passwordResetExpires: Date.now() + 72 * 60 * 60 * 1000 // 72 hours
            } : {})
        };
        
        // Only set joinDate if explicitly provided (don't auto-assign)
        // For non-driver roles, set to null to prevent model default from auto-assigning current date
        // For driver roles, joinDate is required, so if not provided, let model default apply
        if (joinDate) {
            employeeData.joinDate = new Date(joinDate);
        } else if (hireDate) {
            employeeData.joinDate = new Date(hireDate);
        } else if (role !== 'driver') {
            // For non-driver roles, explicitly set to null to prevent model default from auto-assigning current date
            employeeData.joinDate = null;
        }
        // For driver roles, if joinDate is not provided, let the model default apply (it's required)

        // Add optional fields only if provided
        if (phone || cell1 || cell2) {
            employeeData.phone = phone || cell1 || cell2;
        }
        if (country) {
            employeeData.country = country;
        }
        if (state) {
            employeeData.state = state;
        }
        if (city) {
            employeeData.city = city;
        }
        if (policies) {
            employeeData.policies = policies;
        }
        if (dob || dateOfBirth) {
            employeeData.dob = dob ? new Date(dob) : new Date(dateOfBirth);
        }
        if (internalId) {
            employeeData.internalId = internalId;
        }
        if (profileImageUrl) {
            employeeData.profileImageUrl = profileImageUrl;
        }
        if (address || coordinates.longitude || coordinates.latitude) {
            employeeData.location = {
                address: address || '',
                longitude: coordinates.longitude || '',
                latitude: coordinates.latitude || ''
            };
        }

        // Add employee-specific fields to details (for all roles)
        if (!employeeData.details) {
            employeeData.details = {};
        }
        
        // Add employee-specific fields (for all roles)
        if (title) employeeData.details.title = title;
        if (department) employeeData.details.department = department;
        if (jobType) employeeData.details.jobType = jobType;
        
        // Handle employmentType (frontend) -> jobTime (backend)
        // Map "CONTRACT BASIS" to "CONTRACT" to match enum
        const employmentTypeValue = employmentType || jobTime;
        if (employmentTypeValue && employmentTypeValue.trim() !== '') {
            let mappedValue = String(employmentTypeValue).trim();
            if (mappedValue === 'CONTRACT BASIS') {
                mappedValue = 'CONTRACT';
            }
            employeeData.details.jobTime = mappedValue;
            console.log('✅ Mapped employmentType to jobTime:', { employmentType, jobTime, mappedValue });
        } else {
            console.log('⚠️ No employmentType or jobTime provided');
        }
        if (payType) employeeData.details.payType = payType;
        if (payRate !== undefined && payRate !== '') employeeData.details.payRate = Number(payRate);
        if (notes) {
            // Convert array to string if needed (schema expects string)
            if (Array.isArray(notes)) {
                employeeData.details.notes = notes.join('\n');
            } else {
                employeeData.details.notes = String(notes);
            }
        }
        if (vacationPay !== undefined && vacationPay !== '') employeeData.details.vacationPay = vacationPay;
        // Only set hireDate if explicitly provided (don't auto-assign)
        if (hireDate !== undefined && hireDate !== null && hireDate !== '') {
            employeeData.details.hireDate = new Date(hireDate);
        }
        if (termDate) employeeData.details.termDate = new Date(termDate);
        if (dob || dateOfBirth) {
            employeeData.details.dateOfBirth = dob ? new Date(dob) : new Date(dateOfBirth);
        }
        // Add SIN number for all employees
        if (sinNo) employeeData.details.sinNo = sinNo;
        
        // Add driver-specific details if role is driver
        if (role === 'driver') {
            employeeData.details = {
                ...employeeData.details,
                incorporation,
                employeeCode: employeeCode || internalId,
                postalCode,
                fleet,
                citizenship,
                paymentMethod,
                account,
                wsib: wsib || false,
                wsibAccountNo,
                expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                remark,
                gstNo,
                profileImage,
                companyFlag: companyFlag || false,
                cell1,
                cell2,
                extension,
                fax,
                gender,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : (dob ? new Date(dob) : undefined),
                hireDate: hireDate ? new Date(hireDate) : undefined,
                termDate: termDate ? new Date(termDate) : undefined,
                csa: csa || false,
                fastCardNo,
                fastCardExpiry: fastCardExpiry ? new Date(fastCardExpiry) : undefined,
                medicalRequired: medicalRequired || false,
                defaultChargeName,
                defaultCurrency,
                chargesAppliedOn,
                defaultMode,
                defaultAmount: defaultAmount || 0,
                defaultRemarks,
                defaultPayrollType,
                paymentCurrency,
                mileRate: mileRate || 0,
                mileRateTeam: mileRateTeam || 0,
                emptyMileRate: emptyMileRate || 0,
                emptyMileRateTeam: emptyMileRateTeam || 0,
                hourlyRate: hourlyRate || 0,
                weightRate: weightRate || 0,
                percentageRate: percentageRate || 0,
                localTaxNo,
                federalTaxNo,
                sinNo,
                craAccountNo,
                fedTaxExempt: fedTaxExempt || false,
                provTaxExempt: provTaxExempt || false,
                cppQppExempt: cppQppExempt || false,
                eiExempt: eiExempt || false,
                qpipExempt: qpipExempt || false,
                payPeriod,
                vacationPay,
                ltl: ltl || false,
                onSettlements: onSettlements || false,
                settlementCurrencyByOrder: settlementCurrencyByOrder || false,
                isDefault: isDefault || false
            };

            // Remove undefined values from details
            Object.keys(employeeData.details).forEach(key => {
                if (employeeData.details[key] === undefined || employeeData.details[key] === '') {
                    delete employeeData.details[key];
                }
            });
        } else {
            // For non-driver employees, also remove undefined/empty string values from details
            // But keep valid fields (title, department, jobType, jobTime, payType, notes, vacationPay, hireDate, termDate)
            Object.keys(employeeData.details).forEach(key => {
                if (employeeData.details[key] === undefined) {
                    delete employeeData.details[key];
                }
                // Don't delete empty strings for employee-specific fields as they might be valid
            });
        }

        // Log the employeeData before saving to debug
        console.log('📝 Employee data before save - details:', JSON.stringify(employeeData.details, null, 2));

        const employee = new User(employeeData);
        console.log('💾 Employee model before save - details.jobTime:', employee.details?.jobTime);
        await employee.save();
        console.log('💾 Employee model after save - details.jobTime:', employee.details?.jobTime);

        // Send invite email if no password was provided by admin
        if (inviteRawToken) {
            const inviteUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/accept-invite/${inviteRawToken}`;
            sendEmployeeInviteEmail({ employeeEmail: email, employeeName: name, inviteUrl }).catch(err => {
                console.warn('⚠️ Invite email failed (non-blocking):', err.message);
            });
        }

        const employeeId = employee._id;
        const companyObjectId = userCompany || getUserCompanyId(requestingUser);
        
        // Create documents (Employee Documents)
        let responseDocuments = [];
        if (documents) {
            try {
                const documentsArray = typeof documents === 'string' ? JSON.parse(documents) : documents;
                const { EmployeeDocument } = await import("../../models/driver/employeeDocumentModel.js");
                
                // Get document files from req.files
                const documentFiles = req.files && req.files.documentFiles ? 
                    (Array.isArray(req.files.documentFiles) ? req.files.documentFiles : [req.files.documentFiles]) : [];
                
                // Track file index separately for documents that need files
                let fileIndex = 0;
                
                if (documentsArray && documentsArray.length > 0) {
                    console.log(`📄 Creating ${documentsArray.length} documents for employee...`);
                    console.log(`📁 Document files received: ${documentFiles.length} files`);
                    
                    for (let i = 0; i < documentsArray.length; i++) {
                        const doc = documentsArray[i];
                        try {
                            // Match file based on hasFile flag, not array index
                            // Only get file if this document has hasFile: true
                            let docFile = null;
                            if (doc.hasFile && fileIndex < documentFiles.length) {
                                docFile = documentFiles[fileIndex];
                                fileIndex++; // Move to next file for next document that needs one
                            }
                            
                            let fileMetadata = {};
                            if (docFile) {
                                const fileUrl = docFile.location || 
                                    (docFile.path ? `${req.protocol}://${req.get("host")}/${docFile.path.replace(/\\/g, '/')}` : null);
                                fileMetadata = {
                                    fileUrl: fileUrl,
                                    fileName: docFile.originalname,
                                    fileSize: docFile.size,
                                    mimeType: docFile.mimetype
                                };
                            }
                            
                            // Auto-determine status based on expiry date
                            let autoStatus = 'valid';
                            if (doc.expiryDate) {
                                const expiryDateObj = new Date(doc.expiryDate);
                                const today = new Date();
                                const daysUntilExpiry = Math.ceil((expiryDateObj - today) / (1000 * 60 * 60 * 24));
                                
                                if (daysUntilExpiry < 0) {
                                    autoStatus = 'expired';
                                } else if (daysUntilExpiry <= 30) {
                                    autoStatus = 'expiring-soon';
                                }
                            }
                            
                            const documentData = {
                                employee: employeeId,
                                documentType: doc.documentType || 'Other',
                                documentNumber: doc.documentNumber || '',
                                issueDate: doc.issueDate ? new Date(doc.issueDate) : undefined,
                                expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : undefined,
                                description: doc.description || '',
                                status: autoStatus,
                                ignoreExpiration: doc.ignoreExpiration || false,
                                uploadedBy: requestingUserId,
                                company: companyObjectId,
                                ...fileMetadata
                            };
                            
                            const newDoc = new EmployeeDocument(documentData);
                            await newDoc.save();
                            console.log(`✅ Document created: ${newDoc._id}`);
                        } catch (docError) {
                            console.error('Error creating document:', docError);
                        }
                    }
                }
            } catch (parseError) {
                console.error('Error parsing documents:', parseError);
            }
        }

        // Handle deductions and additions
        let deductionsArray = [];
        let additionsArray = [];
        if (deductions) {
            try {
                deductionsArray = typeof deductions === 'string' ? JSON.parse(deductions) : deductions;
            } catch (e) {
                console.error('Error parsing deductions:', e);
            }
        }
        if (additions) {
            try {
                additionsArray = typeof additions === 'string' ? JSON.parse(additions) : additions;
            } catch (e) {
                console.error('Error parsing additions:', e);
            }
        }

        if ((deductionsArray && deductionsArray.length > 0) || (additionsArray && additionsArray.length > 0)) {
            console.log(`💰 Creating ${(deductionsArray?.length || 0) + (additionsArray?.length || 0)} deductions/additions for employee...`);
            const { DeductionAddition } = await import("../../models/hr/settlementModel.js");

            const normalizeIntervalToRecurrence = (value) => {
                const v = (value || '').toString().trim().toLowerCase();
                if (!v) return 'One-time';
                if (v === 'one-time' || v === 'one time' || v === 'onetime') return 'One-time';
                if (v === 'bi-weekly' || v === 'biweekly' || v === 'bi weekly') return 'Bi-weekly';
                if (v === 'weekly') return 'Weekly';
                if (v === 'monthly') return 'Monthly';
                if (v === 'quarterly') return 'Quarterly';
                if (v === 'yearly' || v === 'annual') return 'Yearly';
                return (value || '').toString();
            };

            // Create deductions
            for (const deduction of deductionsArray || []) {
                try {
                    const deductionData = {
                        name: deduction.description || deduction.name || 'Deduction',
                        type: 'Deduction',
                        recurrence: normalizeIntervalToRecurrence(deduction.interval),
                        amount: Number(deduction.amount) || 0,
                        currency: deduction.currency || 'CAD',
                        assignedTo: employeeId,
                        startDate: deduction.startDate ? new Date(deduction.startDate) : new Date(),
                        description: deduction.description || '',
                        isActive: true,
                        company: companyObjectId,
                        createdBy: requestingUserId
                    };

                    const deductionRecord = new DeductionAddition(deductionData);
                    await deductionRecord.save();
                    console.log(`✅ Deduction created: ${deductionRecord._id}`);
                } catch (deductionError) {
                    console.error('Error creating deduction:', deductionError);
                }
            }

            // Create additions
            for (const addition of additionsArray || []) {
                try {
                    const additionData = {
                        name: addition.description || addition.name || 'Addition',
                        type: 'Addition',
                        recurrence: normalizeIntervalToRecurrence(addition.interval),
                        amount: Number(addition.amount) || 0,
                        currency: addition.currency || 'CAD',
                        assignedTo: employeeId,
                        startDate: addition.startDate ? new Date(addition.startDate) : new Date(),
                        description: addition.description || '',
                        isActive: true,
                        company: companyObjectId,
                        createdBy: requestingUserId
                    };

                    const additionRecord = new DeductionAddition(additionData);
                    await additionRecord.save();
                    console.log(`✅ Addition created: ${additionRecord._id}`);
                } catch (additionError) {
                    console.error('Error creating addition:', additionError);
                }
            }
        }
        
        // Fetch all documents for response
        try {
            const { EmployeeDocument } = await import("../../models/driver/employeeDocumentModel.js");
            const employeeDocuments = await EmployeeDocument.find({ employee: employeeId })
                .select('_id documentType documentNumber issueDate expiryDate description status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy verifiedBy createdAt updatedAt')
                .lean();
            
            if (employeeDocuments.length > 0) {
                responseDocuments = await Promise.all(employeeDocuments.map(async (doc) => {
                    const docObj = { ...doc };
                    if (docObj.fileUrl && (docObj.fileUrl.includes('s3.amazonaws.com') || docObj.fileUrl.includes('.s3.'))) {
                        try {
                            const cleanUrl = docObj.fileUrl.split('?')[0].split('#')[0];
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
                            
                            const getContentType = (mimeType, fileUrl) => {
                                if (mimeType) return mimeType;
                                const ext = fileUrl.split('.').pop()?.toLowerCase();
                                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                                return mimeMap[ext] || 'application/octet-stream';
                            };
                            
                            const contentType = getContentType(docObj.mimeType, docObj.fileUrl);
                            const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
                            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
                            docObj.fileUrl = signedUrl;
                        } catch (error) {
                            console.error('Error generating signed URL for document:', error);
                        }
                    }
                    return docObj;
                }));
            }
        } catch (fetchError) {
            console.error('Error fetching documents:', fetchError);
        }

        console.log('✅ Employee created successfully:', employee._id);

        // Fetch deductions and additions for response
        let responseDeductions = [];
        let responseAdditions = [];
        try {
            const { DeductionAddition } = await import("../../models/hr/settlementModel.js");
            responseDeductions = await DeductionAddition.find({ assignedTo: employeeId, type: 'Deduction' })
                .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
                .lean();
            responseAdditions = await DeductionAddition.find({ assignedTo: employeeId, type: 'Addition' })
                .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
                .lean();
        } catch (fetchError) {
            console.error('Error fetching deductions/additions:', fetchError);
        }

        // Fetch employee again to get all fields
        const savedEmployee = await User.findById(employeeId).lean();

        res.status(201).json({
            success: true,
            message: "Employee created successfully",
            data: {
                ...savedEmployee,
                documents: responseDocuments,
                deductions: responseDeductions,
                additions: responseAdditions
            }
        });

    } catch (error) {
        console.error('❌ Error creating employee:', error);
        const { handleError } = await import("../../utils/errorHandler.js");
        return handleError(error, res, 500);
    }
};

// ✅ GET ALL EMPLOYEES WITH FILTERS
export const getAllEmployees = async (req, res) => {
    try {
        const isSuperadmin = req.user?.role === 'superadmin';
        
        // Get company filter with strict validation
        const userCompanyId = getUserCompanyId(req.user);
        const hasValidCompany = userCompanyId !== null && 
                                userCompanyId !== undefined && 
                                userCompanyId !== '' &&
                                String(userCompanyId).trim() !== '' &&
                                String(userCompanyId) !== 'null' &&
                                String(userCompanyId) !== 'undefined';

        // CRITICAL: If not superadmin and no valid company, return empty data immediately
        if (!isSuperadmin && !hasValidCompany) {
            console.log('❌ getAllEmployees: Admin has no company - returning empty data');
            return res.status(200).json({
                success: true,
                message: "No company assigned to the current user. Please contact administrator to assign a company.",
                data: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalEmployees: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                },
                requiresCompanySetup: true
            });
        }

        console.log('🔄 Fetching employees with filters:', req.query);
        
        const {
            page = 1,
            limit = 10,
            search,
            role,
            status,
            company,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            hasRole // New query param: 'true' for users with roles, 'false' for users without roles, undefined for all
        } = req.query;

        // Get company filter - use userCompanyId, not query param company
        const companyFilter = hasValidCompany ? { company: userCompanyId } : null;
        
        // Get combined filter (company + trial data filter)
        const baseFilter = await getCombinedFilter(req.user, companyFilter);
        
        // CRITICAL: For non-superadmin, filter MUST include company
        // If baseFilter is null but we have companyId, create filter with company
        let filter = {};
        if (isSuperadmin) {
            filter = baseFilter ? { ...baseFilter } : {};
        } else {
            // Non-superadmin MUST have company filter
            if (!hasValidCompany || !userCompanyId) {
                console.error('❌ getAllEmployees: No valid company - returning empty data');
                return res.status(200).json({
                    success: true,
                    message: "No company assigned to the current user.",
                    data: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalEmployees: 0,
                        hasNextPage: false,
                        hasPrevPage: false
                    }
                });
            }
            
            // Ensure company filter is in filter
            if (baseFilter) {
                if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
                    const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
                    if (!hasCompany) {
                        filter = {
                            ...baseFilter,
                            $and: [...baseFilter.$and, { company: userCompanyId }]
                        };
                    } else {
                        filter = baseFilter;
                    }
                } else if (baseFilter.company) {
                    filter = baseFilter;
                } else {
                    filter = { ...baseFilter, company: userCompanyId };
                }
            } else {
                filter = { company: userCompanyId };
            }
        }

        // Handle role filtering based on hasRole parameter
        if (hasRole === 'true') {
            // Users with roles (Advanced Permissions tab)
            // Exclude admin, superadmin, driver, contact, customer
            // Also exclude non-signin roles (reporter, mechanic, operator, salesperson)
            // Include users that have a role field and it's not null/empty
            filter.role = { 
                $exists: true, 
                $ne: null, 
                $nin: ['admin', 'superadmin', 'driver', 'contact', 'customer', 'reporter', 'Maintenance Crew (Mechanics)', 'operator', 'salesperson'],
                $ne: ''
            };
        } else if (hasRole === 'false') {
            // Users without roles (Non Signin Employees tab)
            // Include: users with no role OR users with non-signin roles (reporter, mechanic, operator, salesperson)
            // Exclude: admin, superadmin, driver, contact, customer
            filter.$or = [
                { role: { $exists: false } },
                { role: null },
                { role: '' },
                { role: 'reporter' },
                { role: 'Maintenance Crew (Mechanics)' },
                { role: 'operator' },
                { role: 'salesperson' }
            ];
        } else if (role) {
            // If specific role is requested, allow contact and customer but block admin/superadmin/driver
            const alwaysExcludedRoles = ['admin', 'superadmin', 'driver'];
            if (alwaysExcludedRoles.includes(role)) {
                // Block admin, superadmin, driver from being queried
                filter.role = { $eq: 'nonexistent' };
            } else {
                // Allow the specific role (including contact and customer)
                filter.role = role;
            }
        } else {
            // When no role is specified, exclude admin, superadmin, driver, contact, and customer from employee listing
            // These roles have separate management tabs/endpoints
            filter.role = { $nin: ['admin', 'superadmin', 'driver', 'contact', 'customer'] };
        }
        
        if (search) {
            const searchConditions = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { internalId: { $regex: search, $options: 'i' } }
            ];
            
            // If we have baseFilter with $or (trial filter), combine with $and
            if (filter.$or) {
                filter.$and = [
                    { $or: filter.$or },
                    { $or: searchConditions }
                ];
                delete filter.$or;
            } else {
                filter.$or = searchConditions;
            }
        }

        if (status) {
            filter.status = status;
        }

        // Build sort object - default to createdAt desc if sortBy not provided
        const sort = {};
        if (sortBy) {
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = -1; // Default sort
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Execute query
        const employees = await User.find(filter)
            .populate('company', 'name')
            .populate('details.vehicle', 'plateNumber make model')
            .select('-password')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        // Fetch documents for all employees in batch
        const employeeIds = employees.map(emp => emp._id);
        const { EmployeeDocument } = await import("../../models/driver/employeeDocumentModel.js");
        const allDocuments = await EmployeeDocument.find({
            employee: { $in: employeeIds }
        }).lean();
        
        // Group documents by employee
        const documentsByEmployee = {};
        allDocuments.forEach(doc => {
            const empId = doc.employee.toString();
            if (!documentsByEmployee[empId]) {
                documentsByEmployee[empId] = [];
            }
            documentsByEmployee[empId].push(doc);
        });

        // Generate presigned URLs for profile images and documents if they're S3 URLs
        const employeesWithSignedUrls = await Promise.all(
            employees.map(async (employee) => {
                const employeeObj = employee.toObject();
                if (employeeObj.profileImageUrl && 
                    (employeeObj.profileImageUrl.includes('s3.amazonaws.com') || 
                     employeeObj.profileImageUrl.includes('.s3.'))) {
                    try {
                        const cleanUrl = employeeObj.profileImageUrl.split('?')[0].split('#')[0];
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

                        // Clean key from query parameters
                        if (key.includes('?')) key = key.split('?')[0];
                        if (key.includes('&')) key = key.split('&')[0];

                        const command = new GetObjectCommand({
                            Bucket: bucketName,
                            Key: key,
                            ResponseContentType: 'image/jpeg',
                        });

                        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
                        employeeObj.profileImageUrl = signedUrl;
                    } catch (error) {
                        console.error('Error generating signed URL for profile image:', error);
                        // Keep original URL if signing fails
                    }
                }
                
                // Ensure details object exists and map jobTime back to employmentType for frontend compatibility
                if (!employeeObj.details) {
                    employeeObj.details = {};
                }
                // Map CONTRACT back to CONTRACT BASIS for frontend
                if (employeeObj.details.jobTime === 'CONTRACT') {
                    employeeObj.details.employmentType = 'CONTRACT BASIS';
                } else if (employeeObj.details.jobTime) {
                    employeeObj.details.employmentType = employeeObj.details.jobTime;
                }
                
                // Add documents to employee object
                const empDocuments = documentsByEmployee[employee._id.toString()] || [];
                employeeObj.documents = await Promise.all(empDocuments.map(async (doc) => {
                    const docObj = { ...doc };
                    if (docObj.fileUrl && (docObj.fileUrl.includes('s3.amazonaws.com') || docObj.fileUrl.includes('.s3.'))) {
                        try {
                            const cleanUrl = docObj.fileUrl.split('?')[0].split('#')[0];
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
                            
                            const getContentType = (mimeType, fileUrl) => {
                                if (mimeType) return mimeType;
                                const ext = fileUrl.split('.').pop()?.toLowerCase();
                                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                                return mimeMap[ext] || 'application/octet-stream';
                            };
                            
                            const contentType = getContentType(docObj.mimeType, docObj.fileUrl);
                            const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
                            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
                            docObj.fileUrl = signedUrl;
                        } catch (error) {
                            console.error('Error generating signed URL for document:', error);
                        }
                    }
                    return docObj;
                }));
                
                return employeeObj;
            })
        );

        // Get total count for pagination
        const totalEmployees = await User.countDocuments(filter);
        const totalPages = Math.ceil(totalEmployees / parseInt(limit));

        console.log(`✅ Found ${employees.length} employees out of ${totalEmployees} total`);

        res.status(200).json({
            success: true,
            message: "Employees fetched successfully",
            data: employeesWithSignedUrls,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalEmployees,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        console.error('❌ Error fetching employees:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET EMPLOYEE BY ID
export const getEmployeeById = async (req, res) => {
    try {
        // Check if admin/user has company settings (except superadmin)
        if (req.user && req.user.role !== 'superadmin') {
            if (!req.user.company) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete company settings first before viewing users. Go to Company Settings to set up your company."
                });
            }
        }

        const { id } = req.params;
        console.log('🔄 Fetching employee by ID:', id);

        // Get company filter
        const { getUserCompanyId } = await import("../../utils/companyFilter.js");
        const userCompanyId = getUserCompanyId(req.user);

        const query = { _id: id };
        if (userCompanyId) {
            query.company = userCompanyId;
        }

        const employee = await User.findOne(query)
            .populate('company', 'name')
            .populate('details.vehicle', 'plateNumber make model')
            .select('-password');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        // Generate presigned URL for profile image if it's an S3 URL
        const employeeObj = employee.toObject();
        if (employeeObj.profileImageUrl && 
            (employeeObj.profileImageUrl.includes('s3.amazonaws.com') || 
             employeeObj.profileImageUrl.includes('.s3.'))) {
            try {
                const cleanUrl = employeeObj.profileImageUrl.split('?')[0].split('#')[0];
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

                // Clean key from query parameters
                if (key.includes('?')) key = key.split('?')[0];
                if (key.includes('&')) key = key.split('&')[0];

                const command = new GetObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                    ResponseContentType: 'image/jpeg',
                });

                const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
                employeeObj.profileImageUrl = signedUrl;
            } catch (error) {
                console.error('Error generating signed URL for profile image:', error);
                // Keep original URL if signing fails
            }
        }
        
        // Fetch documents
        let responseDocuments = [];
        try {
            const { EmployeeDocument } = await import("../../models/driver/employeeDocumentModel.js");
            const employeeDocuments = await EmployeeDocument.find({ employee: id })
                .select('_id documentType documentNumber issueDate expiryDate description status fileUrl fileName fileSize mimeType ignoreExpiration uploadedBy verifiedBy createdAt updatedAt')
                .lean();
            
            if (employeeDocuments.length > 0) {
                responseDocuments = await Promise.all(employeeDocuments.map(async (doc) => {
                    const docObj = { ...doc };
                    if (docObj.fileUrl && (docObj.fileUrl.includes('s3.amazonaws.com') || docObj.fileUrl.includes('.s3.'))) {
                        try {
                            const cleanUrl = docObj.fileUrl.split('?')[0].split('#')[0];
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
                            
                            const getContentType = (mimeType, fileUrl) => {
                                if (mimeType) return mimeType;
                                const ext = fileUrl.split('.').pop()?.toLowerCase();
                                const mimeMap = { 'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                                return mimeMap[ext] || 'application/octet-stream';
                            };
                            
                            const contentType = getContentType(docObj.mimeType, docObj.fileUrl);
                            const command = new GetObjectCommand({ Bucket: bucketName, Key: key, ResponseContentType: contentType });
                            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
                            docObj.fileUrl = signedUrl;
                        } catch (error) {
                            console.error('Error generating signed URL for document:', error);
                        }
                    }
                    return docObj;
                }));
            }
        } catch (fetchError) {
            console.error('Error fetching documents:', fetchError);
        }

        // Ensure details object exists and map jobTime back to employmentType for frontend compatibility
        if (!employeeObj.details) {
            employeeObj.details = {};
        }
        // Map CONTRACT back to CONTRACT BASIS for frontend
        if (employeeObj.details.jobTime === 'CONTRACT') {
            employeeObj.details.employmentType = 'CONTRACT BASIS';
        } else if (employeeObj.details.jobTime) {
            employeeObj.details.employmentType = employeeObj.details.jobTime;
        }

        // Fetch deductions and additions for response
        let responseDeductions = [];
        let responseAdditions = [];
        try {
            const { DeductionAddition } = await import("../../models/hr/settlementModel.js");
            responseDeductions = await DeductionAddition.find({ assignedTo: id, type: 'Deduction' })
                .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
                .lean();
            responseAdditions = await DeductionAddition.find({ assignedTo: id, type: 'Addition' })
                .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
                .lean();
        } catch (fetchError) {
            console.error('Error fetching deductions/additions:', fetchError);
        }

        console.log('✅ Employee fetched successfully:', employee._id);

        res.status(200).json({
            success: true,
            message: "Employee fetched successfully",
            data: {
                ...employeeObj,
                documents: responseDocuments,
                deductions: responseDeductions,
                additions: responseAdditions
            }
        });

    } catch (error) {
        console.error('❌ Error fetching employee:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE EMPLOYEE
export const updateEmployee = async (req, res) => {
    try {
        console.log('📁 File upload info:', {
            file: req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : 'No file uploaded',
            files: req.files ? {
                keys: Object.keys(req.files),
                file: req.files.file ? {
                    count: req.files.file.length,
                    first: {
                        fieldname: req.files.file[0].fieldname,
                        originalname: req.files.file[0].originalname,
                        mimetype: req.files.file[0].mimetype,
                        size: req.files.file[0].size
                    }
                } : 'No file field'
            } : 'No files'
        });
        console.log('📦 Request body keys:', Object.keys(req.body));
        console.log('📦 Full request body:', JSON.stringify(req.body, null, 2));
        
        // Check if admin/user has company settings (except superadmin)
        if (req.user && req.user.role !== 'superadmin') {
            if (!req.user.company) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete company settings first before managing users. Go to Company Settings to set up your company."
                });
            }
        }

        const { id } = req.params;
        console.log('🔄 Updating employee:', id, 'with data:', req.body);

        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: errors.array()
            });
        }

        const {
            name,
            email,
            phone,
            country,
            password,
            role,
            policies,
            state,
            city,
            status,
            company,
            internalId,
            address,
            joinDate,
            dob,
            // Employee-specific fields
            title,
            department,
            jobType,
            jobTime,
            employmentType, // Frontend sends this, map to jobTime
            notes,
            // Driver-specific fields
            incorporation,
            employeeCode,
            postalCode,
            fleet,
            citizenship,
            paymentMethod,
            account,
            wsib,
            wsibAccountNo,
            expiryDate,
            remark,
            gstNo,
            profileImage,
            companyFlag,
            cell1,
            cell2,
            extension,
            fax,
            gender,
            dateOfBirth,
            hireDate,
            termDate,
            csa,
            fastCardNo,
            fastCardExpiry,
            medicalRequired,
            defaultChargeName,
            defaultCurrency,
            chargesAppliedOn,
            defaultMode,
            defaultAmount,
            defaultRemarks,
            defaultPayrollType,
            paymentCurrency,
            mileRate,
            mileRateTeam,
            emptyMileRate,
            emptyMileRateTeam,
            hourlyRate,
            weightRate,
            percentageRate,
            localTaxNo,
            federalTaxNo,
            sinNo,
            craAccountNo,
            fedTaxExempt,
            provTaxExempt,
            cppQppExempt,
            eiExempt,
            qpipExempt,
            payPeriod,
            vacationPay,
            payRate,
            payType,
            ltl,
            onSettlements,
            settlementCurrencyByOrder,
            isDefault,
            // Related data
            documents,
            deductions,
            additions
        } = req.body;

        // Get company filter
        const { getUserCompanyId } = await import("../../utils/companyFilter.js");
        const userCompanyId = getUserCompanyId(req.user);

        // Check if employee exists (with company filter)
        const query = { _id: id };
        if (userCompanyId) {
            query.company = userCompanyId;
        }
        
        const existingEmployee = await User.findOne(query);
        if (!existingEmployee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        // Check if email is being changed and if it's already taken (within same company)
        if (email && email !== existingEmployee.email) {
            const emailQuery = { email, _id: { $ne: id } };
            if (userCompanyId) {
                emailQuery.company = userCompanyId;
            }
            const emailExists = await User.findOne(emailQuery);
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: "Email already exists for another employee"
                });
            }
        }

        // Get coordinates from address if provided
        let coordinates = { latitude: null, longitude: null };
        if (address && address !== existingEmployee.location?.address) {
            console.log('🗺️ Getting coordinates for updated address:', address);
            coordinates = await getCoordinatesFromAddress(address);
            console.log('📍 Coordinates received:', coordinates);
        } else if (existingEmployee.location) {
            coordinates = {
                latitude: existingEmployee.location.latitude,
                longitude: existingEmployee.location.longitude
            };
        }

        // Handle profile image upload
        let profileImageUrl = existingEmployee.profileImageUrl || null;
        const profileImageFile = req.files?.file?.[0] || req.file; // Support both fields() and single() upload
        if (profileImageFile) {
            if (process.env.NODE_ENV === "production") {
                profileImageUrl = profileImageFile.location; // S3 URL
            } else {
                profileImageUrl = `${req.protocol}://${req.get("host")}/${profileImageFile.path.replace(/\\/g, '/')}`; // Local URL
            }
            console.log('✅ Profile image uploaded (update):', profileImageUrl);
        } else if (profileImage) {
            // If profileImage is provided in body (for backward compatibility)
            profileImageUrl = profileImage;
            console.log('✅ Profile image from body (update):', profileImageUrl);
        } else {
            console.log('⚠️ No profile image provided (update), keeping existing:', profileImageUrl);
        }

        // Hash password if provided
        let hashedPassword = existingEmployee.password;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 12);
        }

        // Prepare update data - only include fields that are provided
        const updateData = {};

        // Only update fields that are explicitly provided in the request
        if (name !== undefined && name !== null && name !== '') {
            updateData.name = name;
        }
        if (email !== undefined && email !== null && email !== '') {
            updateData.email = email;
        }
        if (phone !== undefined && phone !== null && phone !== '') {
            updateData.phone = phone;
        } else if (cell1 !== undefined && cell1 !== null && cell1 !== '') {
            updateData.phone = cell1;
        } else if (cell2 !== undefined && cell2 !== null && cell2 !== '') {
            updateData.phone = cell2;
        }
        if (country !== undefined && country !== null && country !== '') {
            updateData.country = country;
        }
        if (state !== undefined && state !== null && state !== '') {
            updateData.state = state;
        }
        if (city !== undefined && city !== null && city !== '') {
            updateData.city = city;
        }
        if (role !== undefined && role !== null && role !== '') {
            updateData.role = role;
        }
        if (policies !== undefined && policies !== null) {
            updateData.policies = policies;
        }
        if (status !== undefined && status !== null && status !== '') {
            updateData.status = status;
        }
        if (company !== undefined && company !== null && company !== '') {
            updateData.company = company;
        }
        if (internalId !== undefined && internalId !== null && internalId !== '') {
            updateData.internalId = internalId;
        }
        if (password !== undefined && password !== null && password !== '') {
            updateData.password = hashedPassword;
        }
        if (profileImageUrl !== null && profileImageUrl !== undefined) {
            updateData.profileImageUrl = profileImageUrl;
        }
        
        // Handle location/address - only update if address is provided
        if (address !== undefined && address !== null && address !== '') {
            updateData.location = {
                address: address,
                longitude: coordinates.longitude,
                latitude: coordinates.latitude
            };
        } else if (coordinates.latitude !== null && coordinates.longitude !== null) {
            // If coordinates exist but no address change, preserve existing address
            updateData.location = {
                address: existingEmployee.location?.address || existingEmployee.address || '',
                longitude: coordinates.longitude,
                latitude: coordinates.latitude
            };
        }

        // Update joinDate if provided
        if (joinDate !== undefined && joinDate !== null && joinDate !== '') {
            updateData.joinDate = new Date(joinDate);
        }

        // Handle date of birth
        if (dob !== undefined && dob !== null && dob !== '') {
            updateData.dob = new Date(dob);
        } else if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
            updateData.dob = new Date(dateOfBirth);
        }

        // Initialize details object for employee-specific fields (for all roles)
        updateData.details = existingEmployee.details || {};
        
        // Add employee-specific fields to details (for all roles) - only if provided
        if (title !== undefined && title !== null && title !== '') {
            updateData.details.title = title;
        }
        if (department !== undefined && department !== null && department !== '') {
            updateData.details.department = department;
        }
        if (jobType !== undefined && jobType !== null && jobType !== '') {
            updateData.details.jobType = jobType;
        }
        
        // Handle employmentType (frontend) -> jobTime (backend)
        // Map "CONTRACT BASIS" to "CONTRACT" to match enum
        const employmentTypeValue = employmentType || jobTime;
        if (employmentTypeValue !== undefined && employmentTypeValue !== null && String(employmentTypeValue).trim() !== '') {
            let mappedValue = String(employmentTypeValue).trim();
            if (mappedValue === 'CONTRACT BASIS') {
                mappedValue = 'CONTRACT';
            }
            updateData.details.jobTime = mappedValue;
            console.log('✅ Updated employmentType to jobTime:', { employmentType, jobTime, mappedValue });
        } else {
            console.log('⚠️ No employmentType or jobTime provided for update');
        }
        if (payType !== undefined && payType !== null && payType !== '') {
            updateData.details.payType = payType;
        }
        if (payRate !== undefined && payRate !== null && payRate !== '') {
            updateData.details.payRate = Number(payRate);
        }
        if (vacationPay !== undefined && vacationPay !== null && vacationPay !== '') {
            updateData.details.vacationPay = vacationPay;
        }
        if (hireDate !== undefined && hireDate !== null && hireDate !== '') {
            updateData.details.hireDate = new Date(hireDate);
        }
        if (termDate !== undefined && termDate !== null && termDate !== '') {
            updateData.details.termDate = new Date(termDate);
        }
        if (notes !== undefined && notes !== null) {
            // Convert array to string if needed (schema expects string)
            if (Array.isArray(notes)) {
                updateData.details.notes = notes.join('\n');
            } else {
                updateData.details.notes = String(notes);
            }
        }
        if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
            updateData.details.dateOfBirth = new Date(dateOfBirth);
        } else if (dob !== undefined && dob !== null && dob !== '') {
            updateData.details.dateOfBirth = new Date(dob);
        }
        // Add SIN number for all employees
        if (sinNo !== undefined && sinNo !== null && sinNo !== '') {
            updateData.details.sinNo = sinNo;
        }

        // Add driver-specific details if role is driver
        if (role === 'driver') {
            // Helper function to parse numeric values
            const parseNumber = (value, defaultValue = 0) => {
                if (value === undefined || value === null || value === '') {
                    return defaultValue;
                }
                const parsed = Number(value);
                return isNaN(parsed) ? defaultValue : parsed;
            };

            updateData.details = {
                ...updateData.details, // Preserve employee-specific fields already set
                incorporation: incorporation || '',
                employeeCode: employeeCode || internalId || existingEmployee.details?.employeeCode || '',
                postalCode: postalCode || '',
                fleet: fleet || '',
                citizenship: citizenship || '',
                paymentMethod: paymentMethod || '',
                account: account || '',
                wsib: wsib !== undefined ? Boolean(wsib) : (existingEmployee.details?.wsib !== undefined ? existingEmployee.details.wsib : false),
                wsibAccountNo: wsibAccountNo || '',
                expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                remark: remark || '',
                gstNo: gstNo || '',
                profileImage: profileImage || '',
                companyFlag: companyFlag !== undefined ? Boolean(companyFlag) : (existingEmployee.details?.companyFlag !== undefined ? existingEmployee.details.companyFlag : false),
                cell1: cell1 || '',
                cell2: cell2 || '',
                extension: extension || '',
                fax: fax || '',
                gender: gender || '',
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : (dob ? new Date(dob) : undefined),
                hireDate: hireDate ? new Date(hireDate) : undefined,
                termDate: termDate ? new Date(termDate) : undefined,
                csa: csa !== undefined ? Boolean(csa) : (existingEmployee.details?.csa !== undefined ? existingEmployee.details.csa : false),
                fastCardNo: fastCardNo || '',
                fastCardExpiry: fastCardExpiry ? new Date(fastCardExpiry) : undefined,
                medicalRequired: medicalRequired !== undefined ? Boolean(medicalRequired) : (existingEmployee.details?.medicalRequired !== undefined ? existingEmployee.details.medicalRequired : false),
                defaultChargeName: defaultChargeName || '',
                defaultCurrency: defaultCurrency || '',
                chargesAppliedOn: chargesAppliedOn || '',
                defaultMode: defaultMode || '',
                defaultAmount: parseNumber(defaultAmount, 0),
                defaultRemarks: defaultRemarks || '',
                defaultPayrollType: defaultPayrollType || '',
                paymentCurrency: paymentCurrency || '',
                mileRate: parseNumber(mileRate, 0),
                mileRateTeam: parseNumber(mileRateTeam, 0),
                emptyMileRate: parseNumber(emptyMileRate, 0),
                emptyMileRateTeam: parseNumber(emptyMileRateTeam, 0),
                hourlyRate: parseNumber(hourlyRate, 0),
                weightRate: parseNumber(weightRate, 0),
                percentageRate: parseNumber(percentageRate, 0),
                localTaxNo: localTaxNo || '',
                federalTaxNo: federalTaxNo || '',
                sinNo: sinNo || '',
                craAccountNo: craAccountNo || '',
                fedTaxExempt: fedTaxExempt !== undefined ? Boolean(fedTaxExempt) : false,
                provTaxExempt: provTaxExempt !== undefined ? Boolean(provTaxExempt) : false,
                cppQppExempt: cppQppExempt !== undefined ? Boolean(cppQppExempt) : false,
                eiExempt: eiExempt !== undefined ? Boolean(eiExempt) : false,
                qpipExempt: qpipExempt !== undefined ? Boolean(qpipExempt) : false,
                payPeriod: payPeriod || '',
                vacationPay: vacationPay || '',
                ltl: ltl !== undefined ? Boolean(ltl) : false,
                onSettlements: onSettlements !== undefined ? Boolean(onSettlements) : false,
                settlementCurrencyByOrder: settlementCurrencyByOrder !== undefined ? Boolean(settlementCurrencyByOrder) : false,
                isDefault: isDefault !== undefined ? Boolean(isDefault) : false
            };
            
            console.log('📝 Driver details to update:', JSON.stringify(updateData.details, null, 2));

            // Merge with existing details if updating - preserve existing values only if new value is truly missing
            if (existingEmployee.details) {
                Object.keys(existingEmployee.details).forEach(key => {
                    // Only preserve existing value if new value is undefined or empty string
                    // But don't override numeric values (including 0) or boolean values
                    const newValue = updateData.details[key];
                    if (newValue === undefined || newValue === '') {
                        // Check if existing value exists and should be preserved
                        const existingValue = existingEmployee.details[key];
                        if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
                            updateData.details[key] = existingValue;
                        }
                    }
                });
            }

            // Remove only undefined values and empty strings from details, but preserve 0, false, null, etc.
            Object.keys(updateData.details).forEach(key => {
                const value = updateData.details[key];
                // Only remove if undefined or empty string
                // Preserve: 0, false, null (for dates), and all other valid values
                if (value === undefined || value === '') {
                    delete updateData.details[key];
                }
            });
            
            console.log('📋 Final details after cleanup:', JSON.stringify(updateData.details, null, 2));
        }

        // Remove undefined values from main updateData
        Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined) {
                delete updateData[key];
            }
        });

        // Use $set for proper nested object updates in MongoDB
        // Log details before building mongoUpdate
        console.log('📋 updateData.details before mongoUpdate:', JSON.stringify(updateData.details, null, 2));
        console.log('📋 updateData.details.jobTime:', updateData.details?.jobTime);
        
        const mongoUpdate = { $set: updateData };
        
        console.log('🔧 MongoDB update operation:', JSON.stringify(mongoUpdate, null, 2));
        
        // Process documents (Employee Documents) - same as createEmployee
        if (documents) {
            try {
                const documentsArray = typeof documents === 'string' ? JSON.parse(documents) : documents;
                const { EmployeeDocument } = await import("../../models/driver/employeeDocumentModel.js");
                
                // Get document files from req.files
                const documentFiles = req.files && req.files.documentFiles ? 
                    (Array.isArray(req.files.documentFiles) ? req.files.documentFiles : [req.files.documentFiles]) : [];
                
                // Track file index separately for documents that need files
                let fileIndex = 0;
                
                if (documentsArray && documentsArray.length > 0) {
                    console.log(`📄 Processing ${documentsArray.length} documents for employee update...`);
                    console.log(`📁 Document files received: ${documentFiles.length} files`);
                    
                    for (let i = 0; i < documentsArray.length; i++) {
                        const doc = documentsArray[i];
                        console.log(`📄 Processing document ${i + 1}/${documentsArray.length}:`, {
                            id: doc.id,
                            _id: doc._id,
                            documentType: doc.documentType,
                            hasFile: doc.hasFile,
                            isExisting: doc.isExisting
                        });
                        try {
                            // Match file based on hasFile flag, not array index
                            // Only get file if this document has hasFile: true
                            let docFile = null;
                            if (doc.hasFile && fileIndex < documentFiles.length) {
                                docFile = documentFiles[fileIndex];
                                fileIndex++; // Move to next file for next document that needs one
                            }
                            console.log(`📁 File for document ${i + 1}:`, docFile ? {
                                name: docFile.originalname,
                                size: docFile.size
                            } : 'No file');
                            
                            let fileMetadata = {};
                            if (docFile) {
                                const fileUrl = docFile.location || 
                                    (docFile.path ? `${req.protocol}://${req.get("host")}/${docFile.path.replace(/\\/g, '/')}` : null);
                                fileMetadata = {
                                    fileUrl: fileUrl,
                                    fileName: docFile.originalname,
                                    fileSize: docFile.size,
                                    mimeType: docFile.mimetype
                                };
                            }
                            
                            // Auto-determine status based on expiry date
                            let autoStatus = 'valid';
                            if (doc.expiryDate) {
                                const expiryDateObj = new Date(doc.expiryDate);
                                const today = new Date();
                                const daysUntilExpiry = Math.ceil((expiryDateObj - today) / (1000 * 60 * 60 * 24));
                                
                                if (daysUntilExpiry < 0) {
                                    autoStatus = 'expired';
                                } else if (daysUntilExpiry <= 30) {
                                    autoStatus = 'expiring-soon';
                                }
                            }
                            
                            // Check if this is an existing document (has valid _id) or new document
                            const isExistingDoc = doc._id && doc._id.trim() !== '' && doc.isExisting !== false;
                            
                            if (isExistingDoc) {
                                // Fetch existing document to preserve file metadata if no new file is uploaded
                                const existingDoc = await EmployeeDocument.findById(doc._id);
                                let finalFileMetadata = {};
                                
                                if (docFile) {
                                    // New file is being uploaded - use new file metadata
                                    finalFileMetadata = fileMetadata;
                                    console.log(`📎 New file provided for document ${doc._id}`);
                                } else if (existingDoc && existingDoc.fileUrl) {
                                    // No new file - preserve existing file metadata
                                    finalFileMetadata = {
                                        fileUrl: existingDoc.fileUrl,
                                        fileName: existingDoc.fileName || '',
                                        fileSize: existingDoc.fileSize || 0,
                                        mimeType: existingDoc.mimeType || ''
                                    };
                                    console.log(`📎 Preserving existing file for document ${doc._id}:`, existingDoc.fileName);
                                } else {
                                    console.log(`⚠️ No file metadata for document ${doc._id} - document may not have a file`);
                                }
                                
                                // Update existing document
                                const documentData = {
                                    documentType: doc.documentType || 'Other',
                                    documentNumber: doc.documentNumber || '',
                                    issueDate: doc.issueDate ? new Date(doc.issueDate) : undefined,
                                    expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : undefined,
                                    description: doc.description || '',
                                    status: autoStatus,
                                    ignoreExpiration: doc.ignoreExpiration || false
                                };
                                
                                // Only add file metadata if it exists
                                if (Object.keys(finalFileMetadata).length > 0) {
                                    Object.assign(documentData, finalFileMetadata);
                                }
                                
                                // Remove undefined values
                                Object.keys(documentData).forEach(key => {
                                    if (documentData[key] === undefined) {
                                        delete documentData[key];
                                    }
                                });
                                
                                await EmployeeDocument.findByIdAndUpdate(doc._id, documentData, { new: true });
                                console.log(`✅ Updated document ${doc._id}`, docFile ? 'with new file' : 'preserving existing file');
                            } else {
                                // Create new document (with or without file)
                                const documentData = {
                                    employee: id,
                                    documentType: doc.documentType || 'Other',
                                    documentNumber: doc.documentNumber || '',
                                    issueDate: doc.issueDate ? new Date(doc.issueDate) : undefined,
                                    expiryDate: doc.expiryDate ? new Date(doc.expiryDate) : undefined,
                                    description: doc.description || '',
                                    status: autoStatus,
                                    ignoreExpiration: doc.ignoreExpiration || false
                                };
                                
                                // Only add file metadata if file is actually provided
                                if (docFile && Object.keys(fileMetadata).length > 0) {
                                    Object.assign(documentData, fileMetadata);
                                    console.log(`📎 Creating document with file:`, fileMetadata.fileName);
                                } else if (doc.hasFile && !docFile) {
                                    console.warn(`⚠️ Document marked as hasFile but no file provided - creating without file metadata`);
                                }
                                
                                // Remove undefined values
                                Object.keys(documentData).forEach(key => {
                                    if (documentData[key] === undefined) {
                                        delete documentData[key];
                                    }
                                });
                                
                                const newDoc = new EmployeeDocument(documentData);
                                await newDoc.save();
                                console.log(`✅ Created new document ${newDoc._id}`, docFile ? 'with file' : 'without file');
                            }
                        } catch (docError) {
                            console.error(`❌ Error processing document ${i}:`, docError);
                        }
                    }
                    console.log('✅ All documents processed successfully');
                }
            } catch (parseError) {
                console.error('❌ Error parsing documents:', parseError);
            }
        }

        // Handle deductions and additions
        let deductionsArray = [];
        let additionsArray = [];
        if (deductions) {
            try {
                deductionsArray = typeof deductions === 'string' ? JSON.parse(deductions) : deductions;
            } catch (e) {
                console.error('Error parsing deductions:', e);
            }
        }
        if (additions) {
            try {
                additionsArray = typeof additions === 'string' ? JSON.parse(additions) : additions;
            } catch (e) {
                console.error('Error parsing additions:', e);
            }
        }

        if ((deductionsArray && deductionsArray.length > 0) || (additionsArray && additionsArray.length > 0)) {
            const { DeductionAddition } = await import("../../models/hr/settlementModel.js");
            const { getUserCompanyId } = await import("../../utils/companyFilter.js");
            const companyObjectId = existingEmployee.company || getUserCompanyId(req.user);
            console.log(`💰 Processing ${(deductionsArray?.length || 0) + (additionsArray?.length || 0)} deductions/additions for employee ${id}`);

            const normalizeIntervalToRecurrence = (value) => {
                const v = (value || '').toString().trim().toLowerCase();
                if (!v) return 'One-time';
                if (v === 'one-time' || v === 'one time' || v === 'onetime') return 'One-time';
                if (v === 'bi-weekly' || v === 'biweekly' || v === 'bi weekly') return 'Bi-weekly';
                if (v === 'weekly') return 'Weekly';
                if (v === 'monthly') return 'Monthly';
                if (v === 'quarterly') return 'Quarterly';
                if (v === 'yearly' || v === 'annual') return 'Yearly';
                return (value || '').toString();
            };

            // Process deductions
            for (const deduction of deductionsArray || []) {
                try {
                    const dedId = deduction.id || deduction._id;

                    if (dedId && dedId.toString().startsWith('existing-')) {
                        const actualId = dedId.toString().replace('existing-', '');

                        if (mongoose.Types.ObjectId.isValid(actualId)) {
                            const existingDed = await DeductionAddition.findById(actualId);
                            if (existingDed && existingDed.assignedTo.toString() === id.toString() && existingDed.type === 'Deduction') {
                                const updateData = {};
                                if (deduction.description) updateData.name = deduction.description;
                                if (deduction.amount !== undefined) updateData.amount = Number(deduction.amount) || 0;
                                if (deduction.interval) updateData.recurrence = normalizeIntervalToRecurrence(deduction.interval);
                                if (deduction.startDate) updateData.startDate = new Date(deduction.startDate);
                                if (deduction.currency) updateData.currency = deduction.currency;

                                Object.assign(existingDed, updateData);
                                await existingDed.save();
                                console.log(`✅ Deduction updated: ${existingDed._id}`);
                            }
                        }
                    } else {
                        const deductionData = {
                            name: deduction.description || deduction.name || 'Deduction',
                            type: 'Deduction',
                            recurrence: normalizeIntervalToRecurrence(deduction.interval),
                            amount: Number(deduction.amount) || 0,
                            currency: deduction.currency || 'CAD',
                            assignedTo: id,
                            startDate: deduction.startDate ? new Date(deduction.startDate) : new Date(),
                            description: deduction.description || '',
                            isActive: true,
                            company: companyObjectId,
                            createdBy: req.user._id
                        };

                        const newDed = new DeductionAddition(deductionData);
                        await newDed.save();
                        console.log(`✅ New deduction created: ${newDed._id}`);
                    }
                } catch (dedError) {
                    console.error('Error processing deduction:', dedError);
                }
            }

            // Process additions
            for (const addition of additionsArray || []) {
                try {
                    const addId = addition.id || addition._id;

                    if (addId && addId.toString().startsWith('existing-')) {
                        const actualId = addId.toString().replace('existing-', '');

                        if (mongoose.Types.ObjectId.isValid(actualId)) {
                            const existingAdd = await DeductionAddition.findById(actualId);
                            if (existingAdd && existingAdd.assignedTo.toString() === id.toString() && existingAdd.type === 'Addition') {
                                const updateData = {};
                                if (addition.description) updateData.name = addition.description;
                                if (addition.amount !== undefined) updateData.amount = Number(addition.amount) || 0;
                                if (addition.interval) updateData.recurrence = normalizeIntervalToRecurrence(addition.interval);
                                if (addition.startDate) updateData.startDate = new Date(addition.startDate);
                                if (addition.currency) updateData.currency = addition.currency;

                                Object.assign(existingAdd, updateData);
                                await existingAdd.save();
                                console.log(`✅ Addition updated: ${existingAdd._id}`);
                            }
                        }
                    } else {
                        const additionData = {
                            name: addition.description || addition.name || 'Addition',
                            type: 'Addition',
                            recurrence: normalizeIntervalToRecurrence(addition.interval),
                            amount: Number(addition.amount) || 0,
                            currency: addition.currency || 'CAD',
                            assignedTo: id,
                            startDate: addition.startDate ? new Date(addition.startDate) : new Date(),
                            description: addition.description || '',
                            isActive: true,
                            company: companyObjectId,
                            createdBy: req.user._id
                        };

                        const newAdd = new DeductionAddition(additionData);
                        await newAdd.save();
                        console.log(`✅ New addition created: ${newAdd._id}`);
                    }
                } catch (addError) {
                    console.error('Error processing addition:', addError);
                }
            }
        }
        
        const updatedEmployee = await User.findOneAndUpdate(
            query, // Use the query with company filter
            mongoUpdate,
            { new: true, runValidators: true }
        )
        .populate('company', 'name')
        .populate('details.vehicle', 'plateNumber make model')
        .select('-password');

        console.log('✅ Employee updated successfully:', updatedEmployee._id);
        console.log('📊 Updated details:', JSON.stringify(updatedEmployee.details, null, 2));

        // Fetch all documents for response (same as createEmployee)
        let responseDocuments = [];
        try {
            const { EmployeeDocument } = await import("../../models/driver/employeeDocumentModel.js");
            const employeeDocuments = await EmployeeDocument.find({ employee: id })
                .sort({ createdAt: -1 });
            
            if (employeeDocuments.length > 0) {
                const { GetObjectCommand } = await import("@aws-sdk/client-s3");
                const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
                const { s3 } = await import("../../config/awsConfig.js");
                
                responseDocuments = await Promise.all(employeeDocuments.map(async (doc) => {
                    const docObj = doc.toObject();
                    
                    // Generate presigned URL for document file if it's an S3 URL
                    if (docObj.fileUrl && (docObj.fileUrl.includes('s3.amazonaws.com') || docObj.fileUrl.includes('.s3.'))) {
                        try {
                            const urlParts = docObj.fileUrl.split('?')[0].split('/');
                            const key = urlParts.slice(3).join('/');
                            
                            const command = new GetObjectCommand({
                                Bucket: process.env.AWS_S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME,
                                Key: key
                            });
                            
                            docObj.fileUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
                        } catch (urlError) {
                            console.error('Error generating signed URL for document:', urlError);
                        }
                    }
                    
                    return docObj;
                }));
            }
        } catch (fetchError) {
            console.error('Error fetching documents:', fetchError);
        }

        // Fetch deductions and additions for response
        let responseDeductions = [];
        let responseAdditions = [];
        try {
            const { DeductionAddition } = await import("../../models/hr/settlementModel.js");
            responseDeductions = await DeductionAddition.find({ assignedTo: id, type: 'Deduction' })
                .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
                .lean();
            responseAdditions = await DeductionAddition.find({ assignedTo: id, type: 'Addition' })
                .select('_id name type recurrence amount currency startDate endDate description isActive company createdBy createdAt updatedAt')
                .lean();
        } catch (fetchError) {
            console.error('Error fetching deductions/additions:', fetchError);
        }

        res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: {
                ...updatedEmployee.toObject(),
                documents: responseDocuments,
                deductions: responseDeductions,
                additions: responseAdditions
            }
        });

    } catch (error) {
        console.error('❌ Error updating employee:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE EMPLOYEE STATUS
export const updateEmployeeStatus = async (req, res) => {
    try {
        // Check if admin/user has company settings (except superadmin)
        if (req.user && req.user.role !== 'superadmin') {
            if (!req.user.company) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete company settings first before managing users. Go to Company Settings to set up your company."
                });
            }
        }

        const { id } = req.params;
        const { status } = req.body;
        console.log('🔄 Updating employee status:', id, 'to:', status);

        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Must be 'active' or 'inactive'"
            });
        }

        // Get company filter
        const { getUserCompanyId } = await import("../../utils/companyFilter.js");
        const userCompanyId = getUserCompanyId(req.user);

        const query = { _id: id };
        if (userCompanyId) {
            query.company = userCompanyId;
        }

        const employee = await User.findOneAndUpdate(
            query, // Use the query with company filter
            { status },
            { new: true, runValidators: true }
        )
        .populate('company', 'name')
        .select('-password');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        console.log('✅ Employee status updated successfully:', employee._id);

        res.status(200).json({
            success: true,
            message: "Employee status updated successfully",
            data: employee
        });

    } catch (error) {
        console.error('❌ Error updating employee status:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ DELETE EMPLOYEE
export const deleteEmployee = async (req, res) => {
    try {
        // Check if admin/user has company settings (except superadmin)
        if (req.user && req.user.role !== 'superadmin') {
            if (!req.user.company) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete company settings first before managing users. Go to Company Settings to set up your company."
                });
            }
        }

        const { id } = req.params;
        console.log('🔄 Deleting employee:', id);

        // Get company filter
        const { getUserCompanyId } = await import("../../utils/companyFilter.js");
        const userCompanyId = getUserCompanyId(req.user);

        const query = { _id: id };
        if (userCompanyId) {
            query.company = userCompanyId;
        }

        const employee = await User.findOneAndDelete(query);

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        console.log('✅ Employee deleted successfully:', employee._id);

        res.status(200).json({
            success: true,
            message: "Employee deleted successfully",
            data: {
                _id: employee._id,
                name: employee.name,
                email: employee.email
            }
        });

    } catch (error) {
        console.error('❌ Error deleting employee:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ BULK DELETE EMPLOYEES
export const bulkDeleteEmployees = async (req, res) => {
    try {
        // Check if admin/user has company settings (except superadmin)
        if (req.user && req.user.role !== 'superadmin') {
            if (!req.user.company) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete company settings first before managing users. Go to Company Settings to set up your company."
                });
            }
        }

        const { employeeIds } = req.body;
        console.log('🔄 Bulk deleting employees:', employeeIds);

        if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of employee IDs"
            });
        }

        // Get company filter
        const { getUserCompanyId } = await import("../../utils/companyFilter.js");
        const userCompanyId = getUserCompanyId(req.user);

        const query = { _id: { $in: employeeIds } };
        if (userCompanyId) {
            query.company = userCompanyId;
        }

        const result = await User.deleteMany(query);

        console.log(`✅ Bulk deleted ${result.deletedCount} employees`);

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} employees deleted successfully`,
            data: {
                deletedCount: result.deletedCount
            }
        });

    } catch (error) {
        console.error('❌ Error bulk deleting employees:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET EMPLOYEE STATISTICS
export const getEmployeeStats = async (req, res) => {
    try {
        console.log('🔄 Fetching employee statistics');

        // First, let's see what users exist
        const allUsers = await User.find({}).select('name email role status');
        console.log('👥 All users in database:', allUsers);

        const stats = await User.aggregate([
            {
                $match: {
                    role: { $nin: ['admin', 'superadmin', 'driver'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalEmployees: { $sum: 1 },
                    activeEmployees: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    inactiveEmployees: {
                        $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
                    }
                }
            }
        ]);

        console.log('📊 Employee stats aggregation result:', stats);

        const roleStats = await User.aggregate([
            {
                $match: {
                    role: { $nin: ['admin', 'superadmin', 'driver'] }
                }
            },
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        console.log('📊 Role stats aggregation result:', roleStats);

        const monthlyStats = await User.aggregate([
            {
                $match: {
                    role: { $nin: ['admin', 'superadmin', 'driver'] }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$joinDate' },
                        month: { $month: '$joinDate' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
        ]);

        const result = {
            totalEmployees: stats.length > 0 ? stats[0].totalEmployees : 0,
            activeEmployees: stats.length > 0 ? stats[0].activeEmployees : 0,
            inactiveEmployees: stats.length > 0 ? stats[0].inactiveEmployees : 0,
            roleStats: roleStats,
            monthlyStats: monthlyStats
        };

        console.log('📊 Final result:', result);

        console.log('✅ Employee statistics fetched successfully');

        res.status(200).json({
            success: true,
            message: "Employee statistics fetched successfully",
            data: result
        });

    } catch (error) {
        console.error('❌ Error fetching employee statistics:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ RESET EMPLOYEE PASSWORD
export const resetEmployeePassword = async (req, res) => {
    try {
        // Check if admin/user has company settings (except superadmin)
        if (req.user && req.user.role !== 'superadmin') {
            if (!req.user.company) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete company settings first before managing users. Go to Company Settings to set up your company."
                });
            }
        }

        const { id } = req.params;
        const { password } = req.body;
        
        console.log('🔄 Resetting password for employee:', id);

        // Check if password is provided
        if (!password) {
            return res.status(400).json({
                success: false,
                message: "Password is required"
            });
        }

        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        // Get company filter
        const { getUserCompanyId } = await import("../../utils/companyFilter.js");
        const userCompanyId = getUserCompanyId(req.user);

        const query = { _id: id };
        if (userCompanyId) {
            query.company = userCompanyId;
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 12);

        const employee = await User.findOneAndUpdate(
            query, // Use the query with company filter
            { password: hashedPassword },
            { new: true }
        ).select('-password');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        console.log('✅ Employee password reset successfully:', employee._id);

        res.status(200).json({
            success: true,
            message: "Employee password reset successfully",
            data: {
                _id: employee._id,
                name: employee.name,
                email: employee.email
            }
        });

    } catch (error) {
        console.error('❌ Error resetting employee password:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ─── Bulk Import Employees from CSV / Excel ──────────────────────────────────
export const importEmployees = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const companyId = getUserCompanyId(req.user) || req.user?.company;
    if (!companyId && req.user?.role !== 'superadmin') {
      return res.status(400).json({ success: false, message: 'Company settings not found.' });
    }

    const VALID_ROLES = ['admin', 'dispatcher', 'hr', 'accountant', 'Fleet Maintenance Manager', 'employee'];

    const { rows } = parseImportFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });

    const fieldMap = req.body.fieldMap ? JSON.parse(req.body.fieldMap) : null;

    let imported = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = mapRow(rows[i], fieldMap);
      const rowNum = i + 2;

      const name = row.name || '';
      const email = (row.email || '').toLowerCase();
      const role = row.role || 'employee';
      const phone = row.phone || '';
      const department = row.department || '';

      if (!name) { errors.push({ row: rowNum, data: row, reason: 'Name is required' }); continue; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, data: row, reason: 'Valid email is required' }); continue;
      }
      if (!VALID_ROLES.includes(role)) {
        errors.push({ row: rowNum, data: row, reason: `Role "${role}" is invalid. Valid roles: ${VALID_ROLES.join(', ')}` }); continue;
      }

      const existing = await User.findOne({ email, company: companyId }).lean();
      if (existing) { skipped++; continue; }

      const inviteRawToken = crypto.randomBytes(32).toString('hex');
      const inviteHashedToken = crypto.createHash('sha256').update(inviteRawToken).digest('hex');
      const tempPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

      const timestamp = Date.now().toString().slice(-6);
      const internalId = `EMP-${timestamp}-${i}`;

      try {
        const employee = new User({
          name,
          email,
          phone,
          role,
          department,
          status: 'active',
          company: companyId,
          internalId,
          password: tempPassword,
          passwordResetToken: inviteHashedToken,
          passwordResetExpires: Date.now() + 72 * 60 * 60 * 1000
        });
        await employee.save({ validateBeforeSave: false });

        const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite/${inviteRawToken}`;
        sendEmployeeInviteEmail({ employeeEmail: email, employeeName: name, inviteUrl }).catch(() => {});

        imported++;
      } catch (saveErr) {
        errors.push({ row: rowNum, data: row, reason: saveErr.message || 'Failed to save' });
      }
    }

    res.json({ success: true, imported, skipped, errors, total: rows.length });
  } catch (error) {
    console.error('importEmployees error:', error);
    res.status(500).json({ success: false, message: error.message || 'Import failed' });
  }
};
