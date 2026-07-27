import { EmployeeDocument } from "../../models/driver/employeeDocumentModel.js";
import { validationResult } from "express-validator";

// ✅ GET DRIVER'S OWN DOCUMENTS
export const getDriverDocuments = async (req, res) => {
    try {
        const driverId = req.driver._id;
        console.log('🔄 Fetching documents for driver:', driverId);

        const documents = await EmployeeDocument.find({ employee: driverId })
            .populate('employee', 'name email role internalId')
            .populate('uploadedBy', 'name email')
            .populate('verifiedBy', 'name email')
            .sort({ createdAt: -1 });

        console.log(`✅ Found ${documents.length} documents for driver ${driverId}`);

        res.status(200).json({
            success: true,
            message: "Documents retrieved successfully",
            data: documents,
            count: documents.length
        });

    } catch (error) {
        console.error('❌ Error fetching driver documents:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET DRIVER DOCUMENT BY ID
export const getDriverDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.driver._id;

        console.log('🔄 Fetching driver document:', id);

        const document = await EmployeeDocument.findOne({
            _id: id,
            employee: driverId
        })
            .populate('employee', 'name email role internalId')
            .populate('uploadedBy', 'name email')
            .populate('verifiedBy', 'name email');

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Document not found or you don't have access to it"
            });
        }

        console.log(`✅ Document found: ${document._id}`);

        res.status(200).json({
            success: true,
            message: "Document retrieved successfully",
            data: document
        });

    } catch (error) {
        console.error('❌ Error fetching driver document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPLOAD DRIVER DOCUMENT
export const uploadDriverDocument = async (req, res) => {
    try {
        const driverId = req.driver._id;

        console.log('🔄 Uploading document for driver:', driverId);

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

        // Determine document status
        // If no expiry date or expiry date is in the future, set to 'valid'
        // Otherwise, check if expired or expiring soon
        let documentStatus = status;
        if (!documentStatus) {
            if (!expiryDate) {
                documentStatus = 'valid';
            } else {
                const expiry = new Date(expiryDate);
                const today = new Date();
                const thirtyDaysFromNow = new Date();
                thirtyDaysFromNow.setDate(today.getDate() + 30);

                if (expiry < today) {
                    documentStatus = 'expired';
                } else if (expiry <= thirtyDaysFromNow) {
                    documentStatus = 'expiring-soon';
                } else {
                    documentStatus = 'valid';
                }
            }
        }

        // Handle file upload
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
        } else {
            return res.status(400).json({
                success: false,
                message: "Document file is required"
            });
        }

        // Check if document type already exists for this driver (non-expired)
        const existingDocument = await EmployeeDocument.findOne({
            employee: driverId,
            documentType,
            status: { $ne: 'expired' }
        });

        if (existingDocument) {
            return res.status(400).json({
                success: false,
                message: `Document of type '${documentType}' already exists. Please update the existing document instead.`
            });
        }

        const documentData = {
            employee: driverId,
            documentType,
            documentNumber,
            issueDate: issueDate ? new Date(issueDate) : null,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            description,
            status: documentStatus, // Use calculated status based on expiry date
            uploadedBy: driverId,
            company: req.driver.company,
            ...fileMetadata
        };

        console.log('📄 Document status determined:', documentStatus, {
            hasExpiryDate: !!expiryDate,
            expiryDate: expiryDate,
            statusProvided: !!status
        });

        const document = new EmployeeDocument(documentData);
        await document.save();

        // Populate the document
        await document.populate('employee', 'name email role');
        await document.populate('uploadedBy', 'name email');

        console.log('✅ Driver document uploaded successfully:', document._id);

        res.status(201).json({
            success: true,
            message: "Document uploaded successfully",
            data: document
        });

    } catch (error) {
        console.error('❌ Error uploading driver document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE DRIVER DOCUMENT
export const updateDriverDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.driver._id;

        console.log('🔄 Updating driver document:', id);

        // Verify document belongs to driver
        const existingDocument = await EmployeeDocument.findOne({
            _id: id,
            employee: driverId
        });

        if (!existingDocument) {
            return res.status(404).json({
                success: false,
                message: "Document not found or you don't have permission to update it"
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

        // Handle file upload (if new file is provided)
        let fileMetadata = {};
        if (req.file) {
            const fileUrl = req.file.location || null;
            const localFileUrl = req.file.path ? `${process.env.BASE_URL || 'http://localhost:3000'}/${req.file.path.replace(/\\/g, '/')}` : null;

            fileMetadata = {
                fileUrl: fileUrl || localFileUrl,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype
            };
            console.log('📁 File updated successfully:', fileMetadata);
        }

        // Prepare update data
        const updateData = {};
        if (documentType) updateData.documentType = documentType;
        if (documentNumber !== undefined) updateData.documentNumber = documentNumber;
        if (issueDate) updateData.issueDate = new Date(issueDate);
        if (expiryDate) updateData.expiryDate = new Date(expiryDate);
        if (description !== undefined) updateData.description = description;

        // Recalculate status if expiry date is updated or status is not explicitly provided
        if (status) {
            updateData.status = status;
        } else if (expiryDate !== undefined) {
            // Recalculate status based on new expiry date
            const newExpiryDate = expiryDate ? new Date(expiryDate) : null;
            const today = new Date();
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(today.getDate() + 30);

            if (!newExpiryDate) {
                updateData.status = 'valid';
            } else if (newExpiryDate < today) {
                updateData.status = 'expired';
            } else if (newExpiryDate <= thirtyDaysFromNow) {
                updateData.status = 'expiring-soon';
            } else {
                updateData.status = 'valid';
            }

            console.log('📄 Document status recalculated on update:', updateData.status, {
                expiryDate: newExpiryDate,
                today,
                thirtyDaysFromNow
            });
        }

        // Include file metadata if new file is uploaded
        if (Object.keys(fileMetadata).length > 0) {
            updateData.fileUrl = fileMetadata.fileUrl;
            updateData.fileName = fileMetadata.fileName;
            updateData.fileSize = fileMetadata.fileSize;
            updateData.mimeType = fileMetadata.mimeType;
        }

        const document = await EmployeeDocument.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        )
            .populate('employee', 'name email role internalId')
            .populate('uploadedBy', 'name email')
            .populate('verifiedBy', 'name email');

        console.log('✅ Driver document updated successfully:', document._id);

        res.status(200).json({
            success: true,
            message: "Document updated successfully",
            data: document
        });

    } catch (error) {
        console.error('❌ Error updating driver document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ DELETE DRIVER DOCUMENT
export const deleteDriverDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.driver._id;

        console.log('🔄 Deleting driver document:', id);

        // Verify document belongs to driver
        const document = await EmployeeDocument.findOne({
            _id: id,
            employee: driverId
        });

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Document not found or you don't have permission to delete it"
            });
        }

        await EmployeeDocument.findByIdAndDelete(id);

        console.log('✅ Driver document deleted successfully:', id);

        res.status(200).json({
            success: true,
            message: "Document deleted successfully"
        });

    } catch (error) {
        console.error('❌ Error deleting driver document:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

