import mongoose from "mongoose";
import { QuestionBank } from "../../models/driver/questionBankModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Create Question Bank
export const createQuestionBank = async (req, res) => {
  try {
    console.log('📥 Create Question Bank - Request body:', JSON.stringify(req.body, null, 2));
    console.log('📥 Create Question Bank - User:', req.user?.email, 'Role:', req.user?.role);
    
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    console.log('📥 Company ID:', companyId, 'Is Superadmin:', isSuperadmin);

    if (!isSuperadmin && !companyId) {
      console.log('❌ No company ID found for user');
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const {
      testName,
      testType,
      passingPercentage,
      mandatory,
      questions,
      assignedRoles
    } = req.body;

    if (!testName || !testType || passingPercentage === undefined || !questions || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: testName, testType, passingPercentage, and questions are required."
      });
    }

    // Validate questions structure
    for (const question of questions) {
      if (!question.question || !question.options || question.options.length < 2 || question.correctAnswer === undefined) {
        return res.status(400).json({
          success: false,
          message: "Each question must have question text, at least 2 options, and a correctAnswer index."
        });
      }
      if (question.correctAnswer < 0 || question.correctAnswer >= question.options.length) {
        return res.status(400).json({
          success: false,
          message: "correctAnswer index must be valid for the options array."
        });
      }
    }

    // Parse assignedRoles if it's a JSON string or array
    let parsedRoles = [];
    if (assignedRoles) {
      try {
        if (typeof assignedRoles === 'string') {
          parsedRoles = JSON.parse(assignedRoles);
        } else if (Array.isArray(assignedRoles)) {
          parsedRoles = assignedRoles;
        } else {
          parsedRoles = [assignedRoles];
        }
      } catch (e) {
        // If parsing fails, treat as single role
        parsedRoles = [assignedRoles];
      }
    }

    const payload = {
      testName: testName.trim(),
      testType: testType.trim().toUpperCase(),
      passingPercentage: parseFloat(passingPercentage),
      mandatory: mandatory !== undefined ? mandatory : true,
      assignedRoles: parsedRoles,
      questions: questions.map(q => ({
        question: q.question.trim(),
        options: q.options.map(opt => opt.trim()),
        correctAnswer: parseInt(q.correctAnswer)
      })),
      company: isSuperadmin ? req.body.company || null : companyId,
      createdBy: req.user._id
    };

    console.log('📥 Creating question bank with payload:', JSON.stringify(payload, null, 2));
    
    const questionBank = new QuestionBank(payload);
    await questionBank.save();

    await questionBank.populate('createdBy', 'name email');

    console.log('✅ Question bank created successfully:', questionBank._id);

    res.status(201).json({
      success: true,
      message: "Question bank created successfully",
      data: questionBank
    });
  } catch (err) {
    console.error('❌ Create question bank error:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create question bank"
    });
  }
};

// ✅ Get All Question Banks
export const getQuestionBanks = async (req, res) => {
  try {
    console.log('📥 Get Question Banks - User:', req.user?.email, 'Role:', req.user?.role);
    
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    console.log('📥 Company ID:', companyId, 'Is Superadmin:', isSuperadmin, 'Has Valid Company:', hasValidCompany);

    if (!isSuperadmin && !hasValidCompany) {
      console.log('⚠️ No valid company for user');
      return res.json({
        success: true,
        data: [],
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    const { testType, role } = req.query;
    const query = {};

    if (isSuperadmin) {
      // Superadmin can see all
    } else if (hasValidCompany && companyId) {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.company = new mongoose.Types.ObjectId(companyId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid company ID format"
        });
      }
    } else {
      return res.json({
        success: true,
        data: []
      });
    }

    if (testType && testType !== 'all') {
      query.testType = testType.toUpperCase();
    }

    if (role && role !== 'all') {
      query.assignedRoles = { $in: [role] };
    }

    console.log('📥 Fetching question banks with query:', JSON.stringify(query, null, 2));

    const questionBanks = await QuestionBank.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    console.log('✅ Found', questionBanks.length, 'question banks');
    
    if (questionBanks.length > 0) {
      console.log('📊 First question bank details:');
      console.log('   - ID:', questionBanks[0]._id);
      console.log('   - Test Name:', questionBanks[0].testName);
      console.log('   - Test Type:', questionBanks[0].testType);
      console.log('   - Questions Count:', questionBanks[0].questions?.length || 0);
      console.log('   - Passing %:', questionBanks[0].passingPercentage);
      
      if (questionBanks[0].questions && questionBanks[0].questions.length > 0) {
        console.log('   - First Question:', questionBanks[0].questions[0].question?.substring(0, 50) + '...');
        console.log('   - Options Count:', questionBanks[0].questions[0].options?.length || 0);
      } else {
        console.log('   ⚠️ WARNING: No questions in this question bank!');
      }
    }

    res.json({
      success: true,
      data: questionBanks
    });
  } catch (err) {
    console.error('❌ Get question banks error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch question banks"
    });
  }
};

// ✅ Get Question Bank By ID
export const getQuestionBankById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const questionBank = await QuestionBank.findOne(query)
      .populate('createdBy', 'name email')
      .lean();

    if (!questionBank) {
      return res.status(404).json({
        success: false,
        message: "Question bank not found"
      });
    }

    res.json({
      success: true,
      data: questionBank
    });
  } catch (err) {
    console.error('Get question bank by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch question bank"
    });
  }
};

// ✅ Update Question Bank
export const updateQuestionBank = async (req, res) => {
  try {
    console.log('📥 Update Question Bank - ID:', req.params.id);
    console.log('📥 Update Question Bank - Body:', JSON.stringify(req.body, null, 2));
    
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const questionBank = await QuestionBank.findOne(query);
    if (!questionBank) {
      console.log('❌ Question bank not found');
      return res.status(404).json({
        success: false,
        message: "Question bank not found"
      });
    }

    const updateData = {};
    
    if (req.body.testName) updateData.testName = req.body.testName.trim();
    if (req.body.testType) updateData.testType = req.body.testType.trim().toUpperCase();
    if (req.body.passingPercentage !== undefined) updateData.passingPercentage = parseFloat(req.body.passingPercentage);
    if (req.body.mandatory !== undefined) updateData.mandatory = req.body.mandatory;
    if (req.body.assignedRoles !== undefined) {
      let parsedRoles = [];
      try {
        if (typeof req.body.assignedRoles === 'string') {
          parsedRoles = JSON.parse(req.body.assignedRoles);
        } else if (Array.isArray(req.body.assignedRoles)) {
          parsedRoles = req.body.assignedRoles;
        } else if (req.body.assignedRoles) {
          parsedRoles = [req.body.assignedRoles];
        }
      } catch (e) {
        parsedRoles = req.body.assignedRoles ? [req.body.assignedRoles] : [];
      }
      updateData.assignedRoles = parsedRoles;
    }
    
    if (req.body.questions) {
      // Validate questions structure
      for (const question of req.body.questions) {
        if (!question.question || !question.options || question.options.length < 2 || question.correctAnswer === undefined) {
          return res.status(400).json({
            success: false,
            message: "Each question must have question text, at least 2 options, and a correctAnswer index."
          });
        }
        if (question.correctAnswer < 0 || question.correctAnswer >= question.options.length) {
          return res.status(400).json({
            success: false,
            message: "correctAnswer index must be valid for the options array."
          });
        }
      }
      updateData.questions = req.body.questions.map(q => ({
        question: q.question.trim(),
        options: q.options.map(opt => opt.trim()),
        correctAnswer: parseInt(q.correctAnswer)
      }));
    }

    console.log('📥 Updating with data:', JSON.stringify(updateData, null, 2));
    
    Object.assign(questionBank, updateData);
    await questionBank.save();

    await questionBank.populate('createdBy', 'name email');

    console.log('✅ Question bank updated successfully');

    res.json({
      success: true,
      message: "Question bank updated successfully",
      data: questionBank
    });
  } catch (err) {
    console.error('❌ Update question bank error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update question bank"
    });
  }
};

// ✅ Delete Question Bank
export const deleteQuestionBank = async (req, res) => {
  try {
    console.log('📥 Delete Question Bank - ID:', req.params.id);
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const questionBank = await QuestionBank.findOneAndDelete(query);
    if (!questionBank) {
      console.log('❌ Question bank not found');
      return res.status(404).json({
        success: false,
        message: "Question bank not found"
      });
    }

    console.log('✅ Question bank deleted successfully');

    res.json({
      success: true,
      message: "Question bank deleted successfully"
    });
  } catch (err) {
    console.error('❌ Delete question bank error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to delete question bank"
    });
  }
};

