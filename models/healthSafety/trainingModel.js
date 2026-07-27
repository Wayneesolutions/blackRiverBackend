import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  employeeName: { type: String },
  attendanceStatus: { 
    type: String, 
    enum: ['scheduled', 'attended', 'absent', 'excused'],
    default: 'scheduled'
  },
  completionDate: { type: Date },
  score: { type: Number },
  notes: { type: String }
}, { _id: true, timestamps: true });

const trainingSchema = new mongoose.Schema({
  trainingNumber: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  type: { type: String, required: true },
  date: { type: Date, required: true },
  expiryDate: { type: Date },
  status: { 
    type: String, 
    enum: ['scheduled', 'in-progress', 'completed', 'expired'],
    default: 'scheduled'
  },
  instructor: { type: String, required: true },
  location: { type: String },
  description: { type: String },
  duration: { type: Number }, // in hours
  participants: [participantSchema],
  materials: [{ 
    fileName: String,
    fileUrl: String,
    fileType: String
  }],
  company: { type: mongoose.Schema.Types.ObjectId, ref: "CompanySettings", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
  timestamps: true
});

// Generate training number before save
trainingSchema.pre('save', async function(next) {
  if (this.isNew && !this.trainingNumber) {
    const year = new Date().getFullYear();
    const TrainingModel = this.constructor;
    const count = await TrainingModel.countDocuments({
      trainingNumber: new RegExp(`^TRN-${year}-`)
    });
    this.trainingNumber = `TRN-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Virtual for participants count
trainingSchema.virtual('participantsCount').get(function() {
  return Array.isArray(this.participants) ? this.participants.length : 0;
});

// Check if model already exists to prevent overwrite errors
export const Training = mongoose.models.Training || mongoose.model('Training', trainingSchema);

