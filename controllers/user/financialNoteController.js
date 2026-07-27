// controllers/financialNoteController.js
import { FinancialNote } from "../../models/hr/financialNoteModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

// ✅ Create Financial Note
export const createFinancialNote = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first before creating financial notes."
      });
    }

    const { noteTitle, noteContent, linkedTransactionType, linkedTransactionId, linkedTransaction } = req.body;

    if (!noteTitle || !noteContent) {
      return res.status(400).json({
        success: false,
        message: "Note title and content are required."
      });
    }

    const payload = {
      noteTitle: noteTitle.trim(),
      noteContent: noteContent.trim(),
      linkedTransactionType: linkedTransactionType || null,
      linkedTransactionId: linkedTransactionId?.trim() || null,
      linkedTransaction: linkedTransaction?.trim() || null,
      createdBy: req.user._id,
      company: isSuperadmin ? req.body.company || null : companyId
    };

    const financialNote = new FinancialNote(payload);
    await financialNote.save();
    
    await financialNote.populate('createdBy', 'name email');
    
    res.json({ 
      success: true, 
      message: "Financial note created successfully", 
      data: financialNote 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Financial Notes
export const getFinancialNotes = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search } = req.query;

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Search filter
    if (search) {
      query.$or = [
        { noteTitle: { $regex: search, $options: 'i' } },
        { noteContent: { $regex: search, $options: 'i' } },
        { linkedTransaction: { $regex: search, $options: 'i' } }
      ];
    }

    const financialNotes = await FinancialNote.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      message: 'Financial notes fetched successfully', 
      data: financialNotes 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Get Financial Note Stats
export const getFinancialNoteStats = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        data: {
          totalNotes: 0,
          recentCount: 0
        }
      });
    }

    const companyFilter = companyId ? { company: companyId } : null;
    const query = await getCombinedFilter(req.user, companyFilter) || {};

    // Calculate total notes
    const totalNotes = await FinancialNote.countDocuments(query);

    // Calculate recent count (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentQuery = { ...query, createdAt: { $gte: oneWeekAgo } };
    const recentCount = await FinancialNote.countDocuments(recentQuery);

    res.json({
      success: true,
      data: {
        totalNotes,
        recentCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Financial Note
export const updateFinancialNote = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = { ...req.body };

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    // Trim string fields
    if (updateData.noteTitle) updateData.noteTitle = updateData.noteTitle.trim();
    if (updateData.noteContent) updateData.noteContent = updateData.noteContent.trim();
    if (updateData.linkedTransaction) updateData.linkedTransaction = updateData.linkedTransaction.trim();
    if (updateData.linkedTransactionId) updateData.linkedTransactionId = updateData.linkedTransactionId.trim();

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const updatedNote = await FinancialNote.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true,
    }).populate('createdBy', 'name email');

    if (!updatedNote) {
      return res.status(404).json({ success: false, message: "Financial note not found" });
    }

    res.json({
      success: true,
      message: "Financial note updated successfully",
      data: updatedNote,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Financial Note
export const deleteFinancialNote = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const deletedNote = await FinancialNote.findOneAndDelete(query);
    if (!deletedNote) {
      return res.status(404).json({ success: false, message: "Financial note not found" });
    }

    res.json({
      success: true,
      message: "Financial note deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

