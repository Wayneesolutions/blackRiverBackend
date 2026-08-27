import mongoose from 'mongoose';

const hrNoteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, trim: true },
  author: { type: String },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanySettings', index: true }
}, { timestamps: true });

export const HRNote = mongoose.model('HRNote', hrNoteSchema);
