import mongoose from "mongoose";
import { TestResult } from "../../models/driver/testResultModel.js";
import { QuestionBank } from "../../models/driver/questionBankModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Submit Test Result
export const submitTestResult = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const {
      driverId,
      testType,
      questionBankId,
      answers
    } = req.body;

    if (!driverId || !testType || !answers || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: driverId, testType, and answers are required."
      });
    }

    // Validate driverId format
    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID format"
      });
    }

    // Get question bank to validate answers
    let questionBank = null;
    if (questionBankId) {
      if (!mongoose.Types.ObjectId.isValid(questionBankId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid question bank ID format"
        });
      }
      questionBank = await QuestionBank.findById(questionBankId);
      if (!questionBank) {
        return res.status(404).json({
          success: false,
          message: "Question bank not found"
        });
      }
    }

    // Calculate score
    let correctAnswers = 0;
    let totalQuestions = 0;
    const processedAnswers = [];

    if (questionBank) {
      totalQuestions = questionBank.questions.length;
      console.log('📊 Scoring test with', totalQuestions, 'questions');
      
      questionBank.questions.forEach((q, index) => {
        const questionId = q._id?.toString() || index.toString();
        const userAnswer = answers.find(a => a.questionId === questionId || a.questionId === index.toString());
        const selectedAnswer = userAnswer ? parseInt(userAnswer.selectedAnswer) : -1;
        const correctAnswer = parseInt(q.correctAnswer);
        const isCorrect = selectedAnswer === correctAnswer;
        
        console.log(`📊 Question ${index + 1}:`, {
          questionId,
          question: q.question.substring(0, 50) + '...',
          selectedAnswer,
          correctAnswer,
          isCorrect
        });
        
        if (isCorrect) correctAnswers++;
        
        processedAnswers.push({
          questionId: questionId,
          selectedAnswer: selectedAnswer,
          isCorrect: isCorrect
        });
      });
      
      console.log('📊 Scoring complete:', {
        correctAnswers,
        totalQuestions,
        score: Math.round((correctAnswers / totalQuestions) * 100)
      });
    } else {
      // If no question bank, assume all answers are provided with isCorrect flag
      totalQuestions = answers.length;
      answers.forEach(answer => {
        if (answer.isCorrect) correctAnswers++;
        processedAnswers.push({
          questionId: answer.questionId || '',
          selectedAnswer: parseInt(answer.selectedAnswer) || -1,
          isCorrect: answer.isCorrect || false
        });
      });
    }

    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const passingPercentage = questionBank ? questionBank.passingPercentage : 80;
    const passed = score >= passingPercentage;

    // Get previous attempts for this driver and test type
    const previousResults = await TestResult.find({
      driverId,
      testType: testType.toUpperCase(),
      company: isSuperadmin ? req.body.company || null : companyId
    }).sort({ attempts: -1 }).limit(1);

    const attempts = previousResults.length > 0 ? previousResults[0].attempts + 1 : 1;

    const payload = {
      driverId,
      testType: testType.toUpperCase(),
      questionBankId: questionBankId || null,
      score,
      passed,
      attempts,
      answers: processedAnswers,
      company: isSuperadmin ? req.body.company || null : companyId
    };

    const testResult = new TestResult(payload);
    await testResult.save();

    await testResult.populate('driverId', 'name email');

    res.status(201).json({
      success: true,
      message: `Test ${passed ? 'passed' : 'failed'}. Score: ${score}%`,
      data: testResult
    });
  } catch (err) {
    console.error('Submit test result error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to submit test result"
    });
  }
};

// ✅ Get Test Results
export const getTestResults = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    if (!isSuperadmin && !hasValidCompany) {
      return res.json({
        success: true,
        data: [],
        message: "No company assigned to the current user. Please contact administrator to assign a company."
      });
    }

    const { driverId, testType } = req.query;
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

    if (driverId && driverId !== 'all') {
      if (mongoose.Types.ObjectId.isValid(driverId)) {
        query.driverId = new mongoose.Types.ObjectId(driverId);
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid driver ID format"
        });
      }
    }

    if (testType && testType !== 'all') {
      query.testType = testType.toUpperCase();
    }

    const testResults = await TestResult.find(query)
      .populate('driverId', 'name email')
      .populate('questionBankId', 'testName passingPercentage')
      .populate('hrApprovedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: testResults
    });
  } catch (err) {
    console.error('Get test results error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch test results"
    });
  }
};

// ✅ Get Test Result By ID
export const getTestResultById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const testResult = await TestResult.findOne(query)
      .populate('driverId', 'name email')
      .populate('questionBankId', 'testName passingPercentage questions')
      .lean();

    if (!testResult) {
      return res.status(404).json({
        success: false,
        message: "Test result not found"
      });
    }

    res.json({
      success: true,
      data: testResult
    });
  } catch (err) {
    console.error('Get test result by ID error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch test result"
    });
  }
};

// ✅ Get Driver's Latest Test Results (for mobile app)
export const getDriverTestStatus = async (req, res) => {
  try {
    console.log('📥 Get Driver Test Status - Driver ID:', req.params.driverId);
    
    const { driverId } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID format"
      });
    }

    // Get driver data to check flags
    const { User } = await import("../../models/driver/userModel.js");
    let driver;
    
    if (!isSuperadmin && companyId) {
      driver = await User.findOne({ _id: driverId, company: companyId, role: 'driver' }).lean();
      if (!driver) {
        console.log('❌ Driver not found or access denied');
        return res.status(403).json({
          success: false,
          message: "Access denied"
        });
      }
    } else {
      driver = await User.findOne({ _id: driverId, role: 'driver' }).lean();
      if (!driver) {
        console.log('❌ Driver not found');
        return res.status(404).json({
          success: false,
          message: "Driver not found"
        });
      }
    }

    // Determine required tests based on driver flags
    const testTypes = ['VEHICLE', 'HOS']; // Base tests always required
    
    // Add TDG if driver handles hazardous loads
    if (driver.handlesHazardousLoads === true) {
      testTypes.push('TDG');
      console.log('✅ TDG test required - Driver handles hazardous loads');
    }
    
    // Add WINTER if winter test is required
    if (driver.winterTestRequired === true) {
      testTypes.push('WINTER');
      console.log('✅ WINTER test required - Winter test flag enabled');
    }

    console.log('📥 Required test types for driver:', testTypes);

    const testStatus = [];

    for (const testType of testTypes) {
      const latestResult = await TestResult.findOne({
        driverId,
        testType
      })
      .populate('questionBankId', 'testName passingPercentage mandatory')
      .populate('hrApprovedBy', 'name email')
      .sort({ attempts: -1, createdAt: -1 })
      .lean();

      if (latestResult) {
        testStatus.push({
          id: latestResult._id.toString(),
          testType: latestResult.testType,
          score: latestResult.score,
          passed: latestResult.passed,
          attempts: latestResult.attempts,
          status: latestResult.passed ? 'passed' : 'failed',
          mandatory: latestResult.questionBankId?.mandatory !== false,
          completedAt: latestResult.createdAt,
          hrApproved: latestResult.hrApproved || false,
          hrRejected: latestResult.hrRejected || false,
          hrApprovedBy: latestResult.hrApprovedBy?.name || undefined,
          hrApprovedAt: latestResult.hrApprovedAt || undefined,
          hrRejectionReason: latestResult.hrRejectionReason || undefined
        });
      } else {
        // Get mandatory status from question bank if available
        const questionBank = await QuestionBank.findOne({
          testType,
          company: isSuperadmin ? null : companyId
        }).sort({ createdAt: -1 }).lean();

        testStatus.push({
          id: null,
          testType,
          score: 0,
          passed: false,
          attempts: 0,
          status: 'not_taken',
          mandatory: questionBank?.mandatory !== false,
          completedAt: null
        });
      }
    }

    console.log('✅ Returning test status with', testStatus.length, 'tests');

    res.json({
      success: true,
      data: {
        tests: testStatus,
        driverFlags: {
          handlesHazardousLoads: driver.handlesHazardousLoads === true,
          winterTestRequired: driver.winterTestRequired === true
        },
        requiredTests: testTypes
      }
    });
  } catch (err) {
    console.error('❌ Get driver test status error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch driver test status"
    });
  }
};

// ✅ Approve Test Result (HR only)
export const approveTestResult = async (req, res) => {
  try {
    console.log('========================================');
    console.log('✅ Approve Test Result Request');
    console.log('📋 Test Result ID:', req.params.id);
    console.log('👤 Approver:', req.user?.email, '| Role:', req.user?.role);
    
    const { id } = req.params;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const testResult = await TestResult.findOne(query);
    
    if (!testResult) {
      return res.status(404).json({
        success: false,
        message: "Test result not found"
      });
    }

    testResult.hrApproved = true;
    testResult.hrRejected = false;
    testResult.hrApprovedBy = req.user._id;
    testResult.hrApprovedAt = new Date();
    testResult.hrRejectionReason = undefined;

    await testResult.save();

    await testResult.populate('hrApprovedBy', 'name email');

    console.log('✅ Test result approved successfully');
    console.log('========================================');

    res.json({
      success: true,
      message: "Test result approved successfully",
      data: testResult
    });
  } catch (err) {
    console.error('❌ Approve test result error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to approve test result"
    });
  }
};

// ✅ Reject Test Result (HR only)
export const rejectTestResult = async (req, res) => {
  try {
    console.log('========================================');
    console.log('❌ Reject Test Result Request');
    console.log('📋 Test Result ID:', req.params.id);
    console.log('👤 Rejector:', req.user?.email, '| Role:', req.user?.role);
    
    const { id } = req.params;
    const { reason } = req.body;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const testResult = await TestResult.findOne(query);
    
    if (!testResult) {
      return res.status(404).json({
        success: false,
        message: "Test result not found"
      });
    }

    testResult.hrApproved = false;
    testResult.hrRejected = true;
    testResult.hrApprovedBy = req.user._id;
    testResult.hrApprovedAt = new Date();
    testResult.hrRejectionReason = reason || '';

    await testResult.save();

    await testResult.populate('hrApprovedBy', 'name email');

    console.log('✅ Test result rejected successfully');
    console.log('📝 Rejection reason:', reason);
    console.log('========================================');

    res.json({
      success: true,
      message: "Test result rejected successfully",
      data: testResult
    });
  } catch (err) {
    console.error('❌ Reject test result error:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to reject test result"
    });
  }
};

