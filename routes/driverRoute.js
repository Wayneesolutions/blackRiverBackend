import express from 'express'
import { changeDriverPassword, driverProfile, loginDriver, registerDriver, getCompanyDispatchers } from '../controllers/driverController.js'
import { FileUpload } from '../middleware/upload.js'
import { driverAuth } from '../middleware/authDriver.js'
import { activeLoads, deliveredLoads, pendingLoads, startedLoads, startOrder, updateLoadStatus } from '../controllers/loadController.js'
import { getVehicles, getVehiclesData, selectedVehicle } from '../controllers/vehicleController.js'
import { getNotificationsByDriver } from '../controllers/activitylogController.js'
import { listVendors, selectedVendor } from '../controllers/vendorController.js'
import { getAllTrailers, selectedTrailor } from '../controllers/trailerController.js'
import { createFeedback } from '../controllers/feedbackController.js'
import { getDriverDocuments, getDriverDocumentById, uploadDriverDocument, updateDriverDocument, deleteDriverDocument } from '../controllers/driver/driverDocumentController.js'
import { getDriverTrips, startTrip, completeTrip, getTripDocumentSignedUrl, getDriverMileage, acceptTrip, rejectTrip, getAssignmentRequests } from '../controllers/tripController.js'
import { getOrderAttachmentSignedUrl, uploadOrderDocument, completeOrder, acceptOrder, rejectOrder } from '../controllers/orderController.js'
import { getDirections } from '../controllers/directionsController.js'
import {
  getDriverELDDocuments,
  getDriverELDDocumentById,
  getDriverELDDocumentSignedUrl,
  downloadDriverELDDocument
} from '../controllers/driver/eldDocumentController.js'
export const driverRoute = express.Router()

driverRoute.post('/create', FileUpload.single('file'), registerDriver)
driverRoute.post('/login', loginDriver)


// notification
driverRoute.get("/notifications", driverAuth, getNotificationsByDriver);

// company dispatchers (for call dispatch feature)
driverRoute.get("/dispatchers", driverAuth, getCompanyDispatchers);



// load
driverRoute.get("/loads/active", driverAuth, activeLoads)
driverRoute.get("/loads/pending", driverAuth, pendingLoads)
driverRoute.get("/loads/completed", driverAuth, deliveredLoads)
driverRoute.put("/loads/status", driverAuth, updateLoadStatus);

driverRoute.get("/loads/started", driverAuth, startedLoads)

// Start individual order
driverRoute.post("/orders/:orderId/start", driverAuth, startOrder);

// trips
driverRoute.get("/trips/assignment-requests", driverAuth, getAssignmentRequests)
driverRoute.get("/trips", driverAuth, getDriverTrips)
driverRoute.post("/trips/:id/start", driverAuth, startTrip)
driverRoute.post("/trips/:id/accept", driverAuth, acceptTrip)
driverRoute.post("/trips/:id/reject", driverAuth, rejectTrip)
driverRoute.post("/trips/:id/complete", driverAuth, completeTrip)
driverRoute.get("/trips/:id/documents/:documentId/signed-url", driverAuth, getTripDocumentSignedUrl)

// orders
driverRoute.post("/orders/:id/accept", driverAuth, acceptOrder)
driverRoute.post("/orders/:id/reject", driverAuth, rejectOrder)
driverRoute.get("/orders/:id/attachments/:attachmentId/signed-url", driverAuth, getOrderAttachmentSignedUrl)
driverRoute.post("/orders/:id/documents", driverAuth, FileUpload.single('document'), uploadOrderDocument)
driverRoute.post("/orders/:id/complete", driverAuth, completeOrder)

//vehicles
driverRoute.get("/vehicle", driverAuth, getVehiclesData)
driverRoute.get('/selected-vehicle', driverAuth, selectedVehicle)

driverRoute.get('/vendor', driverAuth, listVendors)
driverRoute.get('/selected-vendor', driverAuth, selectedVendor)

driverRoute.get('/trailer', driverAuth, getAllTrailers)
driverRoute.get('/selected-trailer', driverAuth, selectedTrailor)

driverRoute.get('/profile', driverAuth, driverProfile)

driverRoute.put("/change-password", driverAuth, changeDriverPassword);

driverRoute.post("/feedback", driverAuth, createFeedback);

// Documents
driverRoute.get("/documents", driverAuth, getDriverDocuments);
driverRoute.get("/documents/:id", driverAuth, getDriverDocumentById);
driverRoute.post("/documents", driverAuth, FileUpload.single('documentFile'), uploadDriverDocument);
driverRoute.put("/documents/:id", driverAuth, FileUpload.single('documentFile'), updateDriverDocument);
driverRoute.delete("/documents/:id", driverAuth, deleteDriverDocument);

// Directions API proxy (for route planning)
driverRoute.get("/directions", driverAuth, getDirections);

// ELD Documents (for drivers to view and download)
driverRoute.get("/eld-documents", driverAuth, getDriverELDDocuments);
driverRoute.get("/eld-documents/:id", driverAuth, getDriverELDDocumentById);
driverRoute.get("/eld-documents/:id/signed-url", driverAuth, getDriverELDDocumentSignedUrl);
driverRoute.get("/eld-documents/:id/download", driverAuth, downloadDriverELDDocument);

// Mileage Sheet
driverRoute.get("/mileage", driverAuth, getDriverMileage);

// Push Notifications
driverRoute.post("/push-token", driverAuth, async (req, res) => {
    try {
        const { expoPushToken } = req.body;
        if (!expoPushToken) {
            return res.status(400).json({ success: false, message: "expoPushToken is required" });
        }
        const { User } = await import('../models/driver/userModel.js');
        const updated = await User.findByIdAndUpdate(req.user._id, { expoPushToken }, { new: true }).select('_id expoPushToken');
        console.log(`🔔 [Push] Token saved for driver ${req.user._id}:`, updated?.expoPushToken);
        res.json({ success: true, message: "Push token registered" });
    } catch (err) {
        console.error('[Push] Token save error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});




