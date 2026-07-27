import { EmployeeDocument } from "../../models/driver/employeeDocumentModel.js";
import { User } from "../../models/driver/userModel.js";
import { validationResult } from "express-validator";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import mongoose from "mongoose";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../../config/awsConfig.js";

// ✅ CREATE EMPLOYEE DOCUMENT
export const createEmployeeDocument = async (req, res) => {
    try {
        console.log('🔄 Creating employee document with data:', req.body);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: errors.array()
            });
        }

        const {
            employee,
            documentType,
            documentNumber,
            issueDate,
            expiryDate,
            description,
            status = 'valid',
            ignoreExpiration = false
        } = req.body;

        // ✅ Extract file metadata from uploaded file
        let fileMetadata = {};
        if (req.file) {
            // For S3 (production)
            const fileUrl = req.file.location || null;
            // For local storage (development)
            const localFileUrl = req.file.path ? `${process.env.BASE_URL || 'http://localhost:3000'}/${req.file.path.replace(/\\/g, '/')}` : null;
            
            fileMetadata = {
                fileUrl: fileUrl || localFileUrl,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype
            };
            console.log('📁 File uploaded successfully:', fileMetadata);
        }

        // Check if employee exists and belongs to the same company
        const employeeExists = await User.findById(employee);
        if (!employeeExists) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        // Check if employee belongs to the same company
        const userCompanyId = getUserCompanyId(req.user);
        const employeeCompanyId = getUserCompanyId(employeeExists);
        
        if (userCompanyId && employeeCompanyId && employeeCompanyId !== userCompanyId) {
            return res.status(403).json({
                success: false,
                message: "You can only create documents for employees in your company"
            });
        }

        // Check if document type already exists for this employee (filter by company if applicable)
        const duplicateCheckFilter = {
            employee,
            documentType,
            status: { $ne: 'expired' }
        };
        if (userCompanyId) {
            duplicateCheckFilter.company = userCompanyId;
        }
        const existingDocument = await EmployeeDocument.findOne(duplicateCheckFilter);

        if (existingDocument) {
            return res.status(400).json({
                success: false,
                message: `Document of type '${documentType}' already exists for this employee`
            });
        }

        // ✅ Auto-determine status based on expiry date
        let autoStatus = status || 'valid'; // Default to provided status or 'valid'
        // Only auto-determine status if ignoreExpiration is not true
        if (expiryDate && !ignoreExpiration) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
            
            const expiry = new Date(expiryDate);
            expiry.setHours(0, 0, 0, 0);
            
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(today.getDate() + 30);
            thirtyDaysFromNow.setHours(0, 0, 0, 0);
            
            // Auto-determine status based on expiry date
            if (expiry < today) {
                // Expiry date is in the past → expired
                autoStatus = 'expired';
                console.log('📅 Expiry date is in the past - setting status to "expired"');
            } else if (expiry <= thirtyDaysFromNow) {
                // Expiry date is within 30 days → expiring soon
                autoStatus = 'expiring-soon';
                console.log('📅 Expiry date is within 30 days - setting status to "expiring-soon"');
            } else {
                // Expiry date is more than 30 days away → valid
                autoStatus = 'valid';
                console.log('📅 Expiry date is more than 30 days away - setting status to "valid"');
            }
        }

        const documentData = {
            employee,
            documentType,
            documentNumber,
            issueDate: issueDate ? new Date(issueDate) : null,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            description,
            status: autoStatus, // Use auto-determined status
            ignoreExpiration: ignoreExpiration === 'true' || ignoreExpiration === true || false,
            uploadedBy: req.user._id,
            company: userCompanyId || employeeCompanyId,
            // ✅ Include file metadata from upload
            ...fileMetadata
        };

        const document = new EmployeeDocument(documentData);
        await document.save();

        // Populate the document with employee details
        await document.populate('employee', 'name email role');

        console.log('✅ Employee document created successfully:', document._id);

        res.status(201).json({
            success: true,
            message: "Employee document created successfully",
            data: document
        });

    } catch (error) {
        console.error('❌ Error creating employee document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET ALL EMPLOYEE DOCUMENTS WITH FILTERS
export const getAllEmployeeDocuments = async (req, res) => {
    try {
        const {
            employee,
            documentType,
            status,
            role,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log('🔄 Fetching employees with their documents:', req.query);

        const isSuperadmin = req.user?.role === 'superadmin';
        const userCompanyId = getUserCompanyId(req.user);

        if (!isSuperadmin && !userCompanyId) {
            return res.status(200).json({
                success: true,
                message: "No company assigned to the current admin.",
                data: [],
                pagination: {
                    current: parseInt(page),
                    pages: 0,
                    total: 0,
                    limit: parseInt(limit)
                }
            });
        }

        const companyFilter = !isSuperadmin && userCompanyId ? { company: userCompanyId } : {};

        // Build document filter object
        const documentFilters = { ...companyFilter };
        if (documentType) documentFilters.documentType = documentType;
        if (status) documentFilters.status = status;

        // Build employee filter object
        const employeeFilters = { ...companyFilter };
        // Filter by role if provided, otherwise exclude admin and superadmin only (allow driver)
        if (role) {
            employeeFilters.role = role;
        } else {
            // Default: exclude only admin and superadmin (allow driver and other roles)
            employeeFilters.role = { $nin: ['admin', 'superadmin'] };
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Get all employees first
        const employees = await User.find(employeeFilters)
            .select('name email phone country state city role status joinDate internalId location company')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));
        
        console.log('Found employees:', employees.length);

        // If specific employee is requested, filter by that employee (ignore role filter for specific employee lookup)
        if (employee) {
            const specificEmployeeFilter = {
                _id: employee,
                ...companyFilter
            };
            const specificEmployees = await User.find(specificEmployeeFilter)
                .select('name email phone country state city role status joinDate internalId location company');
            
            if (specificEmployees.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    pagination: {
                        current: parseInt(page),
                        pages: 0,
                        total: 0,
                        limit: parseInt(limit)
                    }
                });
            }
            employees.length = 0;
            employees.push(...specificEmployees);
        }

        // Get documents for each employee
        const employeesWithDocuments = await Promise.all(
            employees.map(async (emp) => {
                // Get documents for this employee
                const documents = await EmployeeDocument.find({
                    employee: emp._id,
                    ...documentFilters
                })
                .populate('uploadedBy', 'name email')
                .populate('verifiedBy', 'name email')
                .sort({ createdAt: -1 });

                console.log(`Employee ${emp.name} (${emp._id}, role: ${emp.role}) has ${documents.length} documents`);
                if (documents.length > 0) {
                    console.log(`  Document types: ${documents.map(d => d.documentType).join(', ')}`);
                }

                return {
                    employee: {
                        _id: emp._id,
                        name: emp.name,
                        email: emp.email,
                        phone: emp.phone,
                        country: emp.country,
                        state: emp.state,
                        city: emp.city,
                        role: emp.role,
                        status: emp.status,
                        joinDate: emp.joinDate,
                        internalId: emp.internalId,
                        location: emp.location,
                        company: emp.company
                    },
                    documents: documents
                };
            })
        );

        // Get total count of employees (for pagination)
        // If specific employee is selected, count should be 1
        const totalEmployees = employee ? employees.length : await User.countDocuments(employeeFilters);

        console.log(`✅ Found ${employeesWithDocuments.length} employees with their documents`);

        res.status(200).json({
            success: true,
            data: employeesWithDocuments,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(totalEmployees / parseInt(limit)),
                total: totalEmployees,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching employees with documents:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET EMPLOYEE DOCUMENT BY ID
export const getEmployeeDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔄 Fetching employee document:', id);

        const document = await EmployeeDocument.findById(id)
            .populate('employee', 'name email role internalId')
            .populate('uploadedBy', 'name email')
            .populate('verifiedBy', 'name email');

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Employee document not found"
            });
        }

        console.log('✅ Employee document fetched successfully:', document._id);

        res.status(200).json({
            success: true,
            data: document
        });

    } catch (error) {
        console.error('❌ Error fetching employee document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE EMPLOYEE DOCUMENT
export const updateEmployeeDocument = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔄 Updating employee document:', id, 'with data:', req.body);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: errors.array()
            });
        }

        const {
            documentType,
            documentNumber,
            issueDate,
            expiryDate,
            description,
            status
        } = req.body;

        // ✅ Extract file metadata from uploaded file (if new file is uploaded)
        let fileMetadata = {};
        if (req.file) {
            // For S3 (production)
            const fileUrl = req.file.location || null;
            // For local storage (development)
            const localFileUrl = req.file.path ? `${process.env.BASE_URL || 'http://localhost:3000'}/${req.file.path.replace(/\\/g, '/')}` : null;
            
            fileMetadata = {
                fileUrl: fileUrl || localFileUrl,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype
            };
            console.log('📁 File updated successfully:', fileMetadata);
        }

        const existingDocument = await EmployeeDocument.findById(id);
        if (!existingDocument) {
            return res.status(404).json({
                success: false,
                message: "Employee document not found"
            });
        }

        // Check if document type already exists for this employee (excluding current document, filter by company if applicable)
        if (documentType && documentType !== existingDocument.documentType) {
            const userCompanyId = getUserCompanyId(req.user);
            const duplicateCheckFilter = {
                employee: existingDocument.employee,
                documentType,
                status: { $ne: 'expired' },
                _id: { $ne: id }
            };
            if (userCompanyId) {
                duplicateCheckFilter.company = userCompanyId;
            }
            const duplicateDocument = await EmployeeDocument.findOne(duplicateCheckFilter);

            if (duplicateDocument) {
                return res.status(400).json({
                    success: false,
                    message: `Document of type '${documentType}' already exists for this employee`
                });
            }
        }

        // Prepare update data
        const updateData = {};
        if (documentType) updateData.documentType = documentType;
        if (documentNumber !== undefined) updateData.documentNumber = documentNumber;
        if (issueDate) updateData.issueDate = new Date(issueDate);
        if (expiryDate) updateData.expiryDate = new Date(expiryDate);
        if (description !== undefined) updateData.description = description;
        if (req.body.ignoreExpiration !== undefined) {
            updateData.ignoreExpiration = req.body.ignoreExpiration === 'true' || req.body.ignoreExpiration === true;
        }
        
        // ✅ Auto-update status based on expiry date if expiry date is being updated
        // Only auto-update if ignoreExpiration is not true
        const ignoreExpiration = req.body.ignoreExpiration === 'true' || req.body.ignoreExpiration === true;
        if (expiryDate && !ignoreExpiration) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
            
            const expiry = new Date(expiryDate);
            expiry.setHours(0, 0, 0, 0);
            
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(today.getDate() + 30);
            thirtyDaysFromNow.setHours(0, 0, 0, 0);
            
            // Auto-determine status based on expiry date
            if (expiry < today) {
                // Expiry date is in the past → expired
                updateData.status = 'expired';
                console.log('📅 Expiry date is in the past - setting status to "expired"');
            } else if (expiry <= thirtyDaysFromNow) {
                // Expiry date is within 30 days → expiring soon
                updateData.status = 'expiring-soon';
                console.log('📅 Expiry date is within 30 days - setting status to "expiring-soon"');
            } else {
                // Expiry date is more than 30 days away → valid
                updateData.status = 'valid';
                console.log('📅 Expiry date is more than 30 days away - setting status to "valid"');
            }
        } else if (status) {
            // If expiry date is not being updated but status is provided, use provided status
            updateData.status = status;
        }
        
        // ✅ Include file metadata if new file is uploaded
        // If no new file is uploaded, preserve existing file metadata
        if (Object.keys(fileMetadata).length > 0) {
            // New file is being uploaded - update file metadata
            updateData.fileUrl = fileMetadata.fileUrl;
            updateData.fileName = fileMetadata.fileName;
            updateData.fileSize = fileMetadata.fileSize;
            updateData.mimeType = fileMetadata.mimeType;
            console.log('📎 New file uploaded - updating file metadata');
        } else if (existingDocument && existingDocument.fileUrl) {
            // No new file - preserve existing file metadata
            updateData.fileUrl = existingDocument.fileUrl;
            updateData.fileName = existingDocument.fileName || '';
            updateData.fileSize = existingDocument.fileSize || 0;
            updateData.mimeType = existingDocument.mimeType || '';
            console.log('📎 No new file - preserving existing file metadata:', existingDocument.fileName);
        } else {
            console.log('⚠️ No file metadata to preserve or update');
        }

        const document = await EmployeeDocument.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
        .populate('employee', 'name email role internalId')
        .populate('uploadedBy', 'name email')
        .populate('verifiedBy', 'name email');

        console.log('✅ Employee document updated successfully:', document._id);

        res.status(200).json({
            success: true,
            message: "Employee document updated successfully",
            data: document
        });

    } catch (error) {
        console.error('❌ Error updating employee document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE DOCUMENT STATUS
export const updateDocumentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejectionReason } = req.body;
        
        console.log('🔄 Updating document status:', id, 'to:', status);

        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Status is required"
            });
        }

        const validStatuses = ['valid', 'expiring-soon', 'expired', 'pending', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Must be one of: " + validStatuses.join(', ')
            });
        }

        const updateData = { status };
        
        // If status is rejected, require rejection reason
        if (status === 'rejected' && !rejectionReason) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required when status is rejected"
            });
        }

        if (status === 'rejected') {
            updateData.rejectionReason = rejectionReason;
        } else {
            updateData.rejectionReason = null;
        }

        // If status is valid, mark as verified
        if (status === 'valid') {
            updateData.verifiedBy = req.user._id;
            updateData.verifiedAt = new Date();
        }

        const document = await EmployeeDocument.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
        .populate('employee', 'name email role internalId')
        .populate('uploadedBy', 'name email')
        .populate('verifiedBy', 'name email');

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Employee document not found"
            });
        }

        console.log('✅ Document status updated successfully:', document._id);

        res.status(200).json({
            success: true,
            message: "Document status updated successfully",
            data: document
        });

    } catch (error) {
        console.error('❌ Error updating document status:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ DELETE EMPLOYEE DOCUMENT
export const deleteEmployeeDocument = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔄 Deleting employee document:', id);

        const document = await EmployeeDocument.findByIdAndDelete(id);

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Employee document not found"
            });
        }

        console.log('✅ Employee document deleted successfully:', document._id);

        res.status(200).json({
            success: true,
            message: "Employee document deleted successfully"
        });

    } catch (error) {
        console.error('❌ Error deleting employee document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET EMPLOYEE DOCUMENTS BY EMPLOYEE ID
export const getDocumentsByEmployee = async (req, res) => {
    try {
        const { employeeId } = req.params;
        console.log('🔄 Fetching documents for employee:', employeeId);

        const documents = await EmployeeDocument.find({ employee: employeeId })
            .populate('employee', 'name email role internalId')
            .populate('uploadedBy', 'name email')
            .populate('verifiedBy', 'name email')
            .sort({ createdAt: -1 });

        // Generate presigned URLs for S3 files
        const documentsWithSignedUrls = await Promise.all(
            documents.map(async (doc) => {
                const docObj = doc.toObject();
                
                // Generate presigned URL if it's an S3 URL
                if (docObj.fileUrl && 
                    (docObj.fileUrl.includes('s3.amazonaws.com') || 
                     docObj.fileUrl.includes('.s3.'))) {
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

                        // Clean key from query parameters
                        if (key.includes('?')) key = key.split('?')[0];
                        if (key.includes('&')) key = key.split('&')[0];

                        // Determine content type
                        const getContentType = (mimeType, url) => {
                            if (mimeType) return mimeType;
                            const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
                            const typeMap = {
                                'pdf': 'application/pdf',
                                'jpg': 'image/jpeg',
                                'jpeg': 'image/jpeg',
                                'png': 'image/png',
                                'doc': 'application/msword',
                                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            };
                            return typeMap[ext] || 'application/octet-stream';
                        };

                        const contentType = getContentType(docObj.mimeType, docObj.fileUrl);
                        
                        const command = new GetObjectCommand({
                            Bucket: bucketName,
                            Key: key,
                            ResponseContentType: contentType,
                        });

                        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
                        docObj.fileUrl = signedUrl;
                    } catch (error) {
                        console.error('Error generating signed URL for document:', error);
                        // Keep original URL if signing fails
                    }
                }
                
                return docObj;
            })
        );

        console.log(`✅ Found ${documents.length} documents for employee ${employeeId}`);

        res.status(200).json({
            success: true,
            data: documentsWithSignedUrls
        });

    } catch (error) {
        console.error('❌ Error fetching employee documents:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE DOCUMENT STATUSES BASED ON EXPIRY
export const updateDocumentStatuses = async () => {
    try {
        console.log('🔄 Updating document statuses based on expiry dates...');
        
        const today = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        // Update documents that are expiring soon (within 30 days)
        // Exclude documents with ignoreExpiration: true
        const expiringSoonResult = await EmployeeDocument.updateMany(
            {
                expiryDate: {
                    $gte: today,
                    $lte: thirtyDaysFromNow
                },
                status: { $nin: ['expired', 'expiring-soon'] },
                ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
            },
            { 
                status: 'expiring-soon',
                updatedAt: new Date()
            }
        );

        // Update documents that have expired
        // Exclude documents with ignoreExpiration: true
        const expiredResult = await EmployeeDocument.updateMany(
            {
                expiryDate: { $lt: today },
                status: { $ne: 'expired' },
                ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
            },
            { 
                status: 'expired',
                updatedAt: new Date()
            }
        );

        console.log(`✅ Updated ${expiringSoonResult.modifiedCount} documents to 'expiring-soon'`);
        console.log(`✅ Updated ${expiredResult.modifiedCount} documents to 'expired'`);

        return {
            expiringSoon: expiringSoonResult.modifiedCount,
            expired: expiredResult.modifiedCount
        };

    } catch (error) {
        console.error('❌ Error updating document statuses:', error);
        throw error;
    }
};

// ✅ GET DOCUMENTS EXPIRING SOON
export const getExpiringDocuments = async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const { getUserCompanyId } = await import("../../utils/companyFilter.js");
        
        const companyId = getUserCompanyId(req.user);
        const isSuperadmin = req.user?.role === 'superadmin';

        console.log(`🔄 Fetching documents expiring within ${days} days for company: ${companyId || 'all'}`);

        // If user has no company, return empty result (documents are company-based)
        if (!isSuperadmin && !companyId) {
            return res.status(200).json({
                success: true,
                message: "No company assigned. Please complete company settings to view documents.",
                data: []
            });
        }

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + parseInt(days));

        // Build query with company filter
        // Exclude documents with ignoreExpiration: true
        const query = {
            expiryDate: {
                $gte: new Date(),
                $lte: futureDate
            },
            status: { $in: ['valid', 'expiring-soon'] },
            ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
        };

        // Filter by company if not superadmin
        if (!isSuperadmin && companyId) {
            // Find all employees with this company
            const companyEmployees = await User.find({ 
                company: companyId 
            }).select('_id');
            const employeeIds = companyEmployees.map(e => e._id);
            
            if (employeeIds.length > 0) {
                query.employee = { $in: employeeIds };
            } else {
                // No employees in company, return empty
                return res.status(200).json({
                    success: true,
                    data: []
                });
            }
        }

        const documents = await EmployeeDocument.find(query)
        .populate('employee', 'name email role internalId company')
        .populate('uploadedBy', 'name email')
        .sort({ expiryDate: 1 });

        console.log(`✅ Found ${documents.length} documents expiring within ${days} days`);

        res.status(200).json({
            success: true,
            data: documents
        });

    } catch (error) {
        console.error('❌ Error fetching expiring documents:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ BULK DELETE EMPLOYEE DOCUMENTS
export const bulkDeleteEmployeeDocuments = async (req, res) => {
    try {
        const { documentIds } = req.body;
        console.log('🔄 Bulk deleting employee documents:', documentIds);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: errors.array()
            });
        }

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Document IDs array is required"
            });
        }

        const result = await EmployeeDocument.deleteMany({
            _id: { $in: documentIds }
        });

        console.log(`✅ Bulk deleted ${result.deletedCount} employee documents`);

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} employee documents deleted successfully`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('❌ Error bulk deleting employee documents:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET EMPLOYEE DOCUMENT STATS
export const getEmployeeDocumentStats = async (req, res) => {
    try {
        console.log('🔄 Fetching employee document statistics');

        const isSuperadmin = req.user?.role === 'superadmin';
        const userCompanyId = getUserCompanyId(req.user);

        if (!isSuperadmin && !userCompanyId) {
            return res.status(200).json({
                success: true,
                message: "No company assigned to the current admin.",
                data: null
            });
        }

        // Convert company ID to ObjectId for proper matching in aggregation
        // Handle both string and ObjectId formats in the database
        let companyFilter = {};
        if (!isSuperadmin && userCompanyId) {
            const companyObjectId = mongoose.Types.ObjectId.isValid(userCompanyId) 
                ? new mongoose.Types.ObjectId(userCompanyId) 
                : userCompanyId;
            // Match both ObjectId and string formats
            companyFilter = {
                $or: [
                    { company: companyObjectId },
                    { company: userCompanyId }
                ]
            };
        }

        console.log('🔍 Company filter:', JSON.stringify(companyFilter, null, 2));
        console.log('🔍 User company ID:', userCompanyId);

        const stats = await EmployeeDocument.aggregate([
            { $match: companyFilter },
            {
                $lookup: {
                    from: 'users',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'employeeData'
                }
            },
            { $unwind: '$employeeData' },
            {
                $match: {
                    'employeeData.role': { $nin: ['admin', 'superadmin'] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalDocuments: { $sum: 1 },
                    validDocuments: {
                        $sum: { $cond: [{ $eq: ["$status", "valid"] }, 1, 0] }
                    },
                    expiringDocuments: {
                        $sum: { $cond: [{ $eq: ["$status", "expiring-soon"] }, 1, 0] }
                    },
                    expiredDocuments: {
                        $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] }
                    },
                    pendingDocuments: {
                        $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
                    },
                    rejectedDocuments: {
                        $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] }
                    }
                }
            }
        ]);

        // Get document types distribution
        const documentTypes = await EmployeeDocument.aggregate([
            { $match: companyFilter },
            {
                $lookup: {
                    from: 'users',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'employeeData'
                }
            },
            { $unwind: '$employeeData' },
            {
                $match: {
                    'employeeData.role': { $nin: ['admin', 'superadmin'] }
                }
            },
            {
                $group: {
                    _id: "$documentType",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Get expiring documents count
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const expiringCountResult = await EmployeeDocument.aggregate([
            { $match: companyFilter },
            {
                $lookup: {
                    from: 'users',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'employeeData'
                }
            },
            { $unwind: '$employeeData' },
            {
                $match: {
                    'employeeData.role': { $nin: ['admin', 'superadmin'] },
                    expiryDate: {
                        $gte: new Date(),
                        $lte: thirtyDaysFromNow
                    },
                    status: { $ne: 'expired' },
                    ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
                }
            },
            { $count: 'expiringIn30Days' }
        ]);

        const expiringCount = expiringCountResult.length > 0 ? expiringCountResult[0].expiringIn30Days : 0;

        // Handle empty stats result
        const defaultStats = {
            totalDocuments: 0,
            validDocuments: 0,
            expiringDocuments: 0,
            expiredDocuments: 0,
            pendingDocuments: 0,
            rejectedDocuments: 0
        };

        const result = {
            ...defaultStats,
            ...(stats[0] || {}),
            documentTypes: documentTypes.map(dt => ({ documentType: dt._id, count: dt.count })),
            expiringIn30Days: expiringCount
        };

        console.log('✅ Employee document statistics fetched successfully');
        console.log('📊 Stats result:', result);

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Error fetching employee document statistics:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET SIGNED URL FOR EMPLOYEE DOCUMENT
export const getSignedEmployeeDocumentUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { disposition = 'inline' } = req.query; // 'inline' for viewing, 'attachment' for downloading
    
    console.log('🔑 Getting signed URL for employee document:', id, 'with disposition:', disposition);
    
    const doc = await EmployeeDocument.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    
    const fileUrl = doc.fileUrl;
    let fileType = doc.mimeType;
    let fileName = doc.fileName;
    
    // If fileType is not available, try to infer from URL
    if (!fileType && fileUrl) {
      const ext = fileUrl.split('.').pop()?.split('?')[0]?.toLowerCase();
      const typeMap = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
      };
      fileType = typeMap[ext] || 'application/octet-stream';
      // Extract filename from URL if possible
      const pathParts = fileUrl.split('/');
      fileName = pathParts[pathParts.length - 1].split('?')[0] || 'document';
    }
    
    // Create a file object for logging
    const file = { fileName: fileName || 'document', fileType };

    if (!fileUrl) {
      return res.status(400).json({ success: false, message: "File URL not found" });
    }

    // Check if URL is an S3 URL
    const isS3Url = fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.');
    
    if (isS3Url) {
      try {
        // Extract bucket and key from S3 URL
        const cleanUrl = fileUrl.split('?')[0].split('#')[0];
        const urlObj = new URL(cleanUrl);
        let bucketName = process.env.AWS_S3_BUCKET_NAME;
        let key = decodeURIComponent(urlObj.pathname.substring(1));

        // Handle different S3 URL formats
        if (urlObj.hostname.includes('.s3.')) {
          bucketName = urlObj.hostname.split('.s3.')[0];
          key = decodeURIComponent(urlObj.pathname.substring(1));
        } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          bucketName = pathParts[0];
          key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
        }
        
        // Clean up key
        if (key.includes('?')) {
          key = key.split('?')[0];
        }
        if (key.includes('&')) {
          key = key.split('&')[0];
        }
        
        // Remove signature data that might be appended to filename
        const fileExtensionPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|webp|txt|csv|zip|rar)/i;
        const extensionMatch = key.match(fileExtensionPattern);
        if (extensionMatch) {
          const extensionEndIndex = extensionMatch.index + extensionMatch[0].length;
          const baseKey = key.substring(0, extensionEndIndex);
          const afterExtension = key.substring(extensionEndIndex);
          
          if (afterExtension && /^[A-Za-z0-9+/=]{20,}/.test(afterExtension)) {
            key = baseKey;
          }
        } else {
          key = key.replace(/[A-Za-z0-9+/=]{50,}$/, '').replace(/[+/=]+$/, '');
        }
        
        // Additional cleanup: if key contains bucket name at start, remove it
        if (key.startsWith(bucketName + '/')) {
          key = key.substring(bucketName.length + 1);
        }
        
        // Validate bucket and key before proceeding
        if (!bucketName) {
          throw new Error('Bucket name could not be determined from URL and AWS_S3_BUCKET_NAME environment variable is not set');
        }
        if (!key || key.trim() === '') {
          throw new Error('File key could not be extracted from URL');
        }
        
        console.log('🔑 Extracting S3 info for employee document:', { 
          originalUrl: fileUrl,
          cleanUrl: cleanUrl,
          bucketName, 
          key, 
          hostname: urlObj.hostname 
        });

        // Determine content type - ensure PDF gets correct MIME type
        const getContentType = (type) => {
          if (!type) {
            // Try to infer from filename if type is not provided
            const urlMatch = fileUrl.match(/\.([^.?#]+)(\?|#|$)/);
            if (urlMatch) {
              const ext = urlMatch[1].toLowerCase();
              if (ext === 'pdf') return 'application/pdf';
            }
          }
          
          const typeMap = {
            'pdf': 'application/pdf',
            'application/pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'txt': 'text/plain',
            'csv': 'text/csv',
          };
          
          // Check both direct match and lowercase match
          const lowerType = type?.toLowerCase();
          return typeMap[lowerType] || typeMap[type] || 'application/octet-stream';
        };

        const contentType = getContentType(fileType);
        // For inline, use just 'inline' without filename (matches company documents)
        // For attachment, include filename
        const contentDisposition = disposition === 'attachment' 
          ? `attachment; filename="${encodeURIComponent(file.fileName || 'document')}"` 
          : 'inline';
        
        console.log('🔑 Generating signed URL with disposition:', contentDisposition, 'for file:', file.fileName);
        console.log('🔑 Content Type:', contentType);
        console.log('🔑 S3 Bucket:', bucketName);
        console.log('🔑 S3 Key:', key);
        
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          ResponseContentDisposition: contentDisposition,
          ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        
        console.log('✅ Generated signed URL:', signedUrl.substring(0, 100) + '...');
        console.log('✅ URL contains inline:', signedUrl.includes('response-content-disposition=inline'));
        
        return res.json({
          success: true,
          url: signedUrl,
          expiresIn: 3600
        });
      } catch (s3Error) {
        console.error('❌ Error generating signed URL for employee document:', s3Error);
        console.error('❌ S3 Error Details:', {
          message: s3Error.message,
          code: s3Error.Code || s3Error.code,
          bucketName: bucketName,
          key: key,
          originalUrl: fileUrl
        });
        
        // Return proper error response instead of silently failing
        return res.status(500).json({
          success: false,
          message: `Failed to generate signed URL: ${s3Error.message || 'S3 access error'}`,
          error: process.env.NODE_ENV === 'development' ? s3Error.stack : undefined
        });
      }
    } else {
      // Not an S3 URL, return as-is
      return res.json({
        success: true,
        url: fileUrl,
        expiresIn: 0
      });
    }
  } catch (err) {
    console.error('Error getting signed employee document URL:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
