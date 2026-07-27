import { DriverOnboarding } from '../../models/driver/driverOnboardingModel.js';
import { TestResult } from '../../models/driver/testResultModel.js';
import { User } from '../../models/driver/userModel.js';

// Helper function to get company ID
const getUserCompanyId = (user) => {
  if (user?.role === 'superadmin') return null;
  return user?.company?._id || user?.company || null;
};

// ✅ Mark Training as Complete
export const markTrainingComplete = async (req, res) => {
  try {
    console.log('========================================');
    console.log('📚 Mark Training Complete Request');
    console.log('👤 User:', req.user?.email, '| Role:', req.user?.role);
    
    const driverId = req.user._id; // Current logged-in driver
    const companyId = getUserCompanyId(req.user);

    console.log('🚗 Driver ID:', driverId);
    console.log('🏢 Company ID:', companyId);

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company information is required"
      });
    }

    // Find or create onboarding record
    let onboarding = await DriverOnboarding.findOne({ driverId });
    
    if (!onboarding) {
      console.log('📝 Creating new onboarding record');
      onboarding = new DriverOnboarding({
        driverId,
        company: companyId,
        onboardingStatus: 'IN_PROGRESS'
      });
    }

    // Mark training as complete
    onboarding.trainingCompleted = true;
    onboarding.trainingCompletedAt = new Date();
    onboarding.onboardingStatus = 'IN_PROGRESS';

    await onboarding.save();

    console.log('✅ Training marked as complete');
    console.log('========================================');

    res.json({
      success: true,
      message: "Training completed successfully",
      data: onboarding
    });
  } catch (err) {
    console.error('❌ Mark training complete error:', err);
    console.log('========================================');
    res.status(500).json({
      success: false,
      message: err.message || "Failed to mark training as complete"
    });
  }
};

// ✅ Get Driver Onboarding Status
export const getDriverOnboardingStatus = async (req, res) => {
  try {
    console.log('========================================');
    console.log('📊 Get Onboarding Status Request');
    
    const driverId = req.params.driverId || req.user._id;
    const companyId = getUserCompanyId(req.user);

    console.log('🚗 Driver ID:', driverId);
    console.log('👤 Requester:', req.user?.email);

    // Get driver information with flags
    const driver = await User.findById(driverId).select('handlesHazardousLoads winterTestRequired');
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }

    console.log('🚗 Driver flags:', {
      handlesHazardousLoads: driver.handlesHazardousLoads,
      winterTestRequired: driver.winterTestRequired
    });

    // Determine required tests based on flags
    const requiredTests = ['VEHICLE', 'HOS']; // Always required
    if (driver.handlesHazardousLoads) {
      requiredTests.push('TDG');
    }
    if (driver.winterTestRequired) {
      requiredTests.push('WINTER');
    }

    console.log('📋 Required tests:', requiredTests);

    // Get onboarding record
    let onboarding = await DriverOnboarding.findOne({ driverId });
    
    if (!onboarding) {
      console.log('📝 No onboarding record found, creating default');
      onboarding = {
        trainingCompleted: false,
        testsCompleted: false,
        certificatesUploaded: false,
        hrApprovalStatus: 'PENDING',
        onboardingStatus: 'NOT_STARTED',
        requiredTests: []
      };
    }

    // Get test results for this driver with HR approval info
    const testResults = await TestResult.find({ 
      driverId,
      company: companyId 
    })
    .populate('hrApprovedBy', 'name email')
    .sort({ createdAt: -1 });

    console.log('📊 Found', testResults.length, 'test results');

    // Group by test type and get latest result for each
    const latestResultsByType = {};
    testResults.forEach(result => {
      const testType = result.testType;
      if (!latestResultsByType[testType] || 
          new Date(result.createdAt) > new Date(latestResultsByType[testType].createdAt)) {
        latestResultsByType[testType] = result;
      }
    });

    // Check which required tests are completed and their HR approval status
    const testsStatus = requiredTests.map(testType => {
      const result = latestResultsByType[testType];
      return {
        testType,
        status: result?.passed ? 'passed' : 'not_taken',
        score: result?.score || 0,
        attempts: result?.attempts || 0,
        mandatory: true,
        passed: result?.passed || false,
        hrApproved: result?.hrApproved || false,
        hrRejected: result?.hrRejected || false,
        hrApprovedBy: result?.hrApprovedBy?.name || undefined,
        hrApprovedAt: result?.hrApprovedAt || undefined
      };
    });

    // Check if all required tests are passed
    const allTestsPassed = testsStatus.every(t => t.passed);
    
    // Check if all required tests are approved by HR
    const allTestsApprovedByHR = allTestsPassed && testsStatus.every(t => t.hrApproved);
    
    // Check if any test is rejected by HR
    const anyTestRejectedByHR = testsStatus.some(t => t.hrRejected);

    console.log('✅ All tests passed:', allTestsPassed);
    console.log('✅ All tests approved by HR:', allTestsApprovedByHR);
    console.log('❌ Any test rejected by HR:', anyTestRejectedByHR);

    // Check if there are any pending tests (not taken or failed)
    const pendingTests = testsStatus.filter(t => !t.passed);
    const pendingTestsCount = pendingTests.length;
    
    console.log('📊 Pending tests count:', pendingTestsCount);
    console.log('📊 Pending tests:', pendingTests.map(t => t.testType));

    // Update onboarding record if all tests passed
    // Only mark as completed if ALL required tests (based on current flags) are passed
    if (allTestsPassed && onboarding.trainingCompleted && !onboarding.testsCompleted) {
      onboarding.testsCompleted = true;
      onboarding.testsCompletedAt = new Date();
      onboarding.onboardingStatus = 'AWAITING_HR_APPROVAL';
      await onboarding.save();
      console.log('✅ Updated onboarding status to AWAITING_HR_APPROVAL');
    }
    
    // If there are pending tests, reset testsCompleted to false
    if (pendingTestsCount > 0 && onboarding.testsCompleted) {
      onboarding.testsCompleted = false;
      onboarding.onboardingStatus = 'TESTS_PENDING';
      await onboarding.save();
      console.log('⚠️ Reset testsCompleted to false - there are pending tests');
    }

    console.log('========================================');

    // Determine overall HR approval status based on test approvals
    // Only show HR approval status if ALL required tests are passed
    let overallHRStatus = onboarding.hrApprovalStatus;
    if (allTestsApprovedByHR && allTestsPassed) {
      overallHRStatus = 'APPROVED';
    } else if (anyTestRejectedByHR) {
      overallHRStatus = 'REJECTED';
    } else if (allTestsPassed && onboarding.trainingCompleted && pendingTestsCount === 0) {
      overallHRStatus = 'IN_REVIEW'; // All tests passed but waiting for HR approval
    } else if (pendingTestsCount > 0) {
      overallHRStatus = 'PENDING'; // Still have pending tests
    }

    res.json({
      success: true,
      data: {
        trainingCompleted: onboarding.trainingCompleted,
        testsCompleted: allTestsPassed && pendingTestsCount === 0, // Only true if ALL required tests passed
        certificatesUploaded: onboarding.certificatesUploaded,
        hrApprovalStatus: overallHRStatus,
        onboardingStatus: onboarding.onboardingStatus,
        allTestsApprovedByHR: allTestsApprovedByHR,
        pendingTestsCount: pendingTestsCount,
        pendingTests: pendingTests.map(t => t.testType),
        driverFlags: {
          handlesHazardousLoads: driver.handlesHazardousLoads || false,
          winterTestRequired: driver.winterTestRequired || false
        },
        requiredTests: requiredTests,
        tests: testsStatus
      }
    });
  } catch (err) {
    console.error('❌ Get onboarding status error:', err);
    console.log('========================================');
    res.status(500).json({
      success: false,
      message: err.message || "Failed to get onboarding status"
    });
  }
};

// ✅ Update HR Approval Status (HR only)
export const updateHRApprovalStatus = async (req, res) => {
  try {
    console.log('========================================');
    console.log('✅ Update HR Approval Status');
    
    const { driverId } = req.params;
    const { status, rejectionReason } = req.body;
    const hrUserId = req.user._id;

    console.log('🚗 Driver ID:', driverId);
    console.log('📊 New status:', status);

    const onboarding = await DriverOnboarding.findOne({ driverId });
    
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: "Onboarding record not found"
      });
    }

    onboarding.hrApprovalStatus = status;
    
    if (status === 'APPROVED') {
      onboarding.hrApprovedBy = hrUserId;
      onboarding.hrApprovedAt = new Date();
      onboarding.onboardingStatus = 'APPROVED';
    } else if (status === 'REJECTED') {
      onboarding.hrRejectionReason = rejectionReason;
      onboarding.onboardingStatus = 'REJECTED';
    }

    await onboarding.save();

    console.log('✅ HR approval status updated');
    console.log('========================================');

    res.json({
      success: true,
      message: "HR approval status updated successfully",
      data: onboarding
    });
  } catch (err) {
    console.error('❌ Update HR approval error:', err);
    console.log('========================================');
    res.status(500).json({
      success: false,
      message: err.message || "Failed to update HR approval status"
    });
  }
};

