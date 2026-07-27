
import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema(
  {
    tripNumber: {
      type: String,
      unique: true,
      required: false, // Will be auto-generated in pre-save hook
      trim: true,
      uppercase: true
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    coDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    truck: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle', // Changed to Vehicle to match Order model since trips and orders are combined
      required: true
    },
    trailer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trailer', // Changed to Trailer to match Order model since trips and orders are combined
      default: null
    },
    orders: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      default: []
    }],
    status: {
      type: String,
      enum: ['planned', 'manifest_pending', 'in-progress', 'completed', 'cancelled'],
      default: 'planned'
    },
    // Driver acceptance of assigned trip
    driverAcceptanceStatus: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    driverRejectionReason: { type: String, default: null },
    driverRespondedAt: { type: Date, default: null },
    // Document approval fields for dispatcher
    documentsApproved: {
      type: Boolean,
      default: false
    },
    documentsApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    documentsApprovedAt: {
      type: Date,
      default: null
    },
    approvedWithoutDocuments: {
      type: Boolean,
      default: false // If true, trip was approved even without required documents
    },
    plannedStartDate: {
      type: Date,
      default: null
    },
    plannedEndDate: {
      type: Date,
      default: null
    },
    actualStartDate: {
      type: Date,
      default: null
    },
    actualEndDate: {
      type: Date,
      default: null
    },
    startLocation: {
      place: { type: String },
      latitude: { type: String },
      longitude: { type: String },
      placeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        default: null
      }
    },
    endLocation: {
      place: { type: String },
      latitude: { type: String },
      longitude: { type: String },
      placeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        default: null
      }
    },
    route: {
      totalDistance: { type: Number, default: 0 },
      estimatedDuration: { type: Number, default: 0 }, // in minutes
      waypoints: [{
        place: { type: String },
        latitude: { type: String },
        longitude: { type: String },
        order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        type: { type: String, enum: ['pickup', 'delivery', 'stop'], default: 'stop' }
      }]
    },
    // Traveled path coordinates - stores GPS coordinates as the trip progresses
    traveledPath: [{
      latitude: { type: String, required: true },
      longitude: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      speed: { type: Number, default: 0 }, // km/h
      odometer: { type: Number, default: 0 } // km
    }],
    notes: {
      type: String,
      default: ''
    },
    documents: [{
      fileUrl: { type: String, required: true },
      fileName: { type: String, required: true },
      fileSize: { type: Number, default: 0 },
      mimeType: { type: String, default: '' },
      // New: document type (e.g., bol, pod, stamped_manifest, manifest, load_con, proof_of_delivery, other)
      type: { type: String, enum: ['bol','pod','stamped_manifest','manifest','load_con','proof_of_delivery','other'], default: 'other' },
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      },
      description: { type: String, default: '' }
    }],
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanySettings',
      required: true,
      index: true
    },
    // Pictures showing load securement (separate section)
    loadSecurementPictures: [
      {
        fileUrl: { type: String, required: true },
        fileName: { type: String, required: true },
        fileSize: { type: Number, default: 0 },
        mimeType: { type: String, default: '' },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        uploadedAt: { type: Date, default: Date.now }
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    // Manifest integration fields
    manifest: {
      apiResponseId: { type: String, default: '' }, // Provider's internal ID
      retryCount: { type: Number, default: 0 },    // Track failed attempts
      lastAttempt: { type: Date, default: null },
      type: {
        referenceNumber: { type: String, default: '' }, // PAPS (US) / PARS (Canada)
        status: {
          type: String,
          enum: ['Pending', 'Submitted', 'Accepted', 'Rejected'],
          default: 'Pending'
        },
        submittedAt: { type: Date, default: null },
        acceptedAt: { type: Date, default: null },
        rejectedAt: { type: Date, default: null },
        errorMessage: { type: String, default: '' }
      },
      default: {}
    },
    // Border Compliance fields (for UI display and tracking)
    borderCompliance: {
      required: { type: Boolean, default: false },
      type: { type: String, enum: ['ACE', 'ACI'], default: null },
      provider: { type: String, enum: ['Descartes', 'BorderConnect'], default: null },
      status: { 
        type: String, 
        enum: ['Not Filed', 'Pending', 'Accepted', 'Rejected'], 
        default: 'Not Filed' 
      },
      lastUpdated: { type: String, default: '' },
      papsNumber: { type: String, default: '' },
      parsNumber: { type: String, default: '' },
      acceptanceTime: { type: String, default: '' },
      rejectionReason: { type: String, default: '' },
      brokerConfirmation: { type: Boolean, default: false }
    }

  },
  {
    timestamps: true,
    validateBeforeSave: true
  }
);

// Auto-generate trip number before saving with retry logic for race conditions
tripSchema.pre('save', async function (next) {
  // Always generate tripNumber for new documents if not already set
  if (this.isNew && !this.tripNumber) {
    const year = new Date().getFullYear();
    const TripModel = mongoose.models.Trip || mongoose.model('Trip');
    let attempts = 0;
    const maxAttempts = 10;
    let tripNumberGenerated = false;

    while (attempts < maxAttempts && !tripNumberGenerated) {
      try {
        // Count existing trips for this year
        const count = await TripModel.countDocuments({
          tripNumber: new RegExp(`^TRIP${year}`)
        }).catch(() => 0);

        // Generate sequence number
        const sequence = String(count + 1 + attempts).padStart(4, '0');
        const candidateTripNumber = `TRIP${year}${sequence}`;

        // Check if this tripNumber already exists (handle race conditions)
        const existing = await TripModel.findOne({ tripNumber: candidateTripNumber }).catch(() => null);

        if (!existing) {
          this.tripNumber = candidateTripNumber;
          tripNumberGenerated = true;
        } else {
          // Trip number exists, try next sequence or add random component
          attempts++;
          if (attempts >= maxAttempts - 1) {
            // Last attempt: use timestamp + random to ensure uniqueness
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            this.tripNumber = `TRIP${year}${timestamp}${random}`;
            tripNumberGenerated = true;
          }
        }
      } catch (error) {
        console.error('Error generating trip number (attempt ' + (attempts + 1) + '):', error);
        attempts++;
        if (attempts >= maxAttempts) {
          // Final fallback: use timestamp + random
          const timestamp = Date.now().toString().slice(-6);
          const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          this.tripNumber = `TRIP${year}${timestamp}${random}`;
          tripNumberGenerated = true;
        }
      }
    }

    // Final fallback if still not generated
    if (!this.tripNumber) {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.tripNumber = `TRIP${year}${timestamp}${random}`;
    }
  }

  // Ensure tripNumber is always set
  if (!this.tripNumber) {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.tripNumber = `TRIP${year}${timestamp}${random}`;
  }

  next();
});

// Indexes for better query performance
tripSchema.index({ company: 1, status: 1 });
tripSchema.index({ driver: 1, status: 1 });
tripSchema.index({ truck: 1, status: 1 });
tripSchema.index({ tripNumber: 1 });
tripSchema.index({ plannedStartDate: 1 });

const Trip = mongoose.model('Trip', tripSchema);

export default Trip;
