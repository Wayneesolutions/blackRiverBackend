import { HRNote } from '../../models/hr/hrNoteModel.js';
import { getUserCompanyId } from '../../utils/companyFilter.js';
import mongoose from 'mongoose';

export const addHRNote = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    const { userId } = req.params;
    const { text } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }

    const note = await HRNote.create({
      user: new mongoose.Types.ObjectId(userId),
      text: text.trim(),
      author: req.user?.name || req.user?.email || 'Unknown',
      authorId: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined,
      company: companyId ? new mongoose.Types.ObjectId(companyId) : undefined
    });

    res.status(201).json({ success: true, message: 'Note added', data: note });
  } catch (err) {
    console.error('addHRNote error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getHRNotes = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req.user);
    const { userId } = req.params;

    const query = { user: userId };
    if (companyId && req.user?.role !== 'superadmin') {
      query.company = companyId;
    }

    const notes = await HRNote.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: notes });
  } catch (err) {
    console.error('getHRNotes error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteHRNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    await HRNote.findByIdAndDelete(noteId);
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    console.error('deleteHRNote error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
