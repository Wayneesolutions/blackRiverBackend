import mongoose from 'mongoose'

const vehicleDocumentSchema = new mongoose.Schema(
  {
    assetType: {
      type: String,
      enum: ['vehicle', 'trailer'],
      default: 'vehicle'
    },
    vehicleId: { type: mongoose.Types.ObjectId, ref: 'Vehicle' },
    trailerId: { type: mongoose.Types.ObjectId, ref: 'Trailer' },
    fleetUnitId: { type: mongoose.Types.ObjectId, ref: 'FleetUnit' },
    title: { type: String, default: '' },
    documentNumber: { type: String },
    documentType: {
      type: String,
      enum: [
        'insurance',
        'permit',
        'fitness',
        'pollution',
        'driver_license',
        'logbook',
        'maintenance',
        'trailer_registration',
        'safety_inspection',
        'brake_certificate',
        'coupling_certificate',
        'other',
        // Frontend categories for vehicles/trailers
        'General',
        'Ownership',
        'Cab Card',
        'Plate',
        'Safety',
        'Insurance'
      ]
    },
    documentLocation: { type: String },
    status: { type: String, enum: ['pending', 'expired', 'completed', 'expiring-soon'] },
    expiryDate: { type: Date },
    issuedAt: { type: String },
    ignoreExpiration: { type: Boolean, default: false },
    files: [
      {
        fileName: { type: String },
        fileUrl: { type: String },
        fileSize: { type: Number },
        fileType: { type: String },
        uploadedAt: { type: Date, default: Date.now }
      }
    ],
    company: {
      type: mongoose.Types.ObjectId,
      ref: 'CompanySettings',
      index: true
    }

  },
  { timestamps: true }
)

const VehicleDocuments = mongoose.model(
  'VehicleDocuments',
  vehicleDocumentSchema
)
export default VehicleDocuments
