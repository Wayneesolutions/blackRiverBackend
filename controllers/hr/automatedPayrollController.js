import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { Attendance } from "../../models/hr/attendanceModel.js";
import { User } from "../../models/driver/userModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { analyzePayrollWithAttendance, generateMonthlySalaryReport as generateAIReport, analyzeBulkPayrollWithAI } from "../../services/openaiService.js";

/**
 * Automatically generate payroll for an employee based on attendance and AI analysis
 */
export const generateAutomatedPayroll = async (req, res) => {
  try {
    const { userId, month, year, baseSalary } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    if (!userId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "Employee ID, month, and year are required"
      });
    }

    // Get employee
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    // Check for restricted roles
    const restrictedRoles = ['superadmin', 'admin', 'driver', 'reporter', 'customer', 'contact', 'salesperson', 'operator'];
    if (user.role && restrictedRoles.includes(user.role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Cannot create payroll for ${user.role} role.`
      });
    }

    // Get attendance records for the month
    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);

    const attendanceFilter = {
      company: companyId,
      employee: userId,
      date: { $gte: startDate, $lte: endDate }
    };

    const attendanceRecords = await Attendance.find(attendanceFilter)
      .sort({ date: 1 })
      .lean();

    // Get previous payrolls for context
    const previousPayrolls = await Payroll.find({
      userId,
      company: companyId
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    // Use provided baseSalary or get from user details
    const employeeBaseSalary = baseSalary || user.details?.baseSalary || 0;
    if (!employeeBaseSalary || employeeBaseSalary === 0) {
      return res.status(400).json({
        success: false,
        message: "Base salary is required. Please provide baseSalary or set it in employee details."
      });
    }

    // Prepare data for OpenAI analysis
    const employeeData = {
      employeeName: user.name,
      baseSalary: employeeBaseSalary,
      attendanceRecords,
      month: Number(month),
      year: Number(year),
      role: user.role,
      previousPayrolls: previousPayrolls.map(p => ({
        baseSalary: p.baseSalary,
        bonus: p.bonus,
        deductions: p.deductions,
        totalSalary: p.totalSalary,
        payDate: p.payDate
      }))
    };

    // Get AI recommendations
    const aiAnalysis = await analyzePayrollWithAttendance(employeeData);

    if (!aiAnalysis.success) {
      console.error('OpenAI analysis failed:', aiAnalysis.error);
      // Continue with fallback calculations
    }

    const recommendations = aiAnalysis.data || {};
    const dailyRate = employeeBaseSalary / 30;
    // Treat late as present - combine them
    const presentDays = attendanceRecords.filter(r => r.status === 'present' || r.status === 'late').length;
    const workedDays = presentDays; // Total days worked (present includes late)
    const absentDays = attendanceRecords.filter(r => r.status === 'absent').length;
    const leaveDays = attendanceRecords.filter(r => r.status === 'leave').length;
    const totalHours = attendanceRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);

    // Calculate deductions (fallback if AI didn't provide)
    let calculatedDeductions = recommendations.recommendedDeductions || 0;
    if (calculatedDeductions === 0) {
      const absentDeduction = absentDays * dailyRate;
      calculatedDeductions = absentDeduction; // No late deduction - late is treated as present
    }

    // Calculate bonus (from AI or default) - based on worked days performance
    let calculatedBonus = recommendations.recommendedBonus || 0;
    if (calculatedBonus === 0 && workedDays > 0) {
      const totalDays = workedDays + absentDays;
      // Give bonus if worked 95% or more of expected days
      if (totalDays > 0 && (workedDays / totalDays) >= 0.95) {
        calculatedBonus = employeeBaseSalary * 0.05; // 5% bonus
      }
    }

    // Calculate total salary
    const calculatedTotalSalary = employeeBaseSalary + calculatedBonus - calculatedDeductions;

    // Get driver trips if applicable
    let tripIds = [];
    let totalMiles = 0;
    let ratePerMile = 0;

    if (user.role?.toLowerCase() === 'driver') {
      try {
        // Import Trip model
        const Trip = (await import("../../models/tripModel.js")).default;
        
        // Query trips directly
        const trips = await Trip.find({
          driverDetails: userId,
          status: 'completed',
          actualEndDate: {
            $gte: startDate,
            $lte: endDate
          },
          company: companyId
        }).lean();

        if (trips && trips.length > 0) {
          tripIds = trips.map(trip => trip._id);
          totalMiles = trips.reduce((sum, trip) => {
            // Calculate miles from distance (assuming distance is in km)
            const miles = trip.distance ? trip.distance * 0.621371 : 0;
            return sum + miles;
          }, 0);
          ratePerMile = user.details?.mileRate || 0.50;
        }
      } catch (tripError) {
        console.error('Error fetching driver trips:', tripError);
      }
    }

    // Calculate hours properly
    const hourlyRate = user.details?.hourlyRate || 0;
    let regularHoursCalc = 0;
    let overtimeHoursCalc = 0;
    
    if (hourlyRate > 0) {
      // For hourly employees, calculate regular vs overtime
      regularHoursCalc = Math.min(totalHours, workedDays * 8);
      overtimeHoursCalc = Math.max(0, totalHours - regularHoursCalc);
    } else {
      // For salaried employees, all hours are regular
      regularHoursCalc = totalHours;
      overtimeHoursCalc = 0;
    }

    // Prepare payroll data
    const payrollData = {
      userId,
      baseSalary: employeeBaseSalary,
      bonus: calculatedBonus,
      deductions: calculatedDeductions,
      totalSalary: calculatedTotalSalary,
      payDate: new Date(),
      startDate,
      endDate,
      trips: tripIds,
      totalMiles,
      ratePerMile,
      // Hours fields
      totalHours: Math.round(totalHours * 100) / 100,
      regularHours: Math.round(regularHoursCalc * 100) / 100,
      overtimeHours: Math.round(overtimeHoursCalc * 100) / 100,
      hourlyRate: hourlyRate,
      // Attendance summary
      presentDays: presentDays,
      absentDays: absentDays,
      leaveDays: leaveDays,
      company: companyId
    };

    // Return suggested payroll (don't create yet, let user review)
    res.json({
      success: true,
      message: "Automated payroll generated successfully",
      data: {
        payroll: payrollData,
        attendance: {
          totalDays: attendanceRecords.length,
          presentDays, // Includes late days
          workedDays, // Same as presentDays (late included)
          absentDays,
          leaveDays,
          totalHours: Math.round(totalHours * 100) / 100,
          regularHours: Math.round(regularHoursCalc * 100) / 100,
          overtimeHours: Math.round(overtimeHoursCalc * 100) / 100,
          hourlyRate: hourlyRate
        },
        aiRecommendations: recommendations,
        employee: {
          _id: user._id,
          name: user.name,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error("Error generating automated payroll:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Generate monthly salary report with attendance for all employees
 */
export const generateMonthlySalaryReport = async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);

    // Get all employees (excluding restricted roles)
    const restrictedRoles = ['superadmin', 'admin', 'driver', 'reporter', 'customer', 'contact', 'salesperson', 'operator'];
    const employees = await User.find({
      company: companyId,
      role: { $nin: restrictedRoles }
    }).lean();

    // Get attendance for all employees
    const attendanceRecords = await Attendance.find({
      company: companyId,
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('employee', 'name role')
      .lean();

    // Get payrolls for the month
    const payrolls = await Payroll.find({
      company: companyId,
      startDate: { $gte: startDate, $lte: endDate }
    })
      .populate('userId', 'name role')
      .lean();

    // Process each employee
    const employeeReports = await Promise.all(
      employees.map(async (employee) => {
        const empAttendance = attendanceRecords.filter(
          a => a.employee?._id?.toString() === employee._id.toString()
        );

        // Treat late as present - combine them
        const presentDays = empAttendance.filter(r => r.status === 'present' || r.status === 'late').length;
        const workedDays = presentDays; // Same as presentDays (late included)
        const absentDays = empAttendance.filter(r => r.status === 'absent').length;
        const leaveDays = empAttendance.filter(r => r.status === 'leave').length;
        const totalHours = empAttendance.reduce((sum, r) => sum + (r.totalHours || 0), 0);

        // Get base salary from employee details or existing payroll
        const existingPayroll = payrolls.find(
          p => p.userId?._id?.toString() === employee._id.toString()
        );
        const baseSalary = existingPayroll?.baseSalary || employee.details?.baseSalary || 0;

        // Calculate salary adjustments based on attendance
        const dailyRate = baseSalary / 30;
        const absentDeduction = absentDays * dailyRate;
        const deductions = absentDeduction; // No late deduction - late is treated as present

        // Bonus calculation (can be enhanced with AI)
        const attendanceScore = empAttendance.length > 0
          ? ((workedDays + leaveDays) / empAttendance.length) * 100
          : 0;
        const bonus = attendanceScore >= 95 ? baseSalary * 0.05 : 0;

        const calculatedSalary = baseSalary + bonus - deductions;

        return {
          employeeId: employee._id,
          name: employee.name,
          role: employee.role,
          baseSalary,
          bonus: Math.round(bonus * 100) / 100,
          deductions: Math.round(deductions * 100) / 100,
          calculatedSalary: Math.round(calculatedSalary * 100) / 100,
          attendance: {
            present: presentDays, // Includes late days
            worked: workedDays, // Same as presentDays (late included)
            absent: absentDays,
            leave: leaveDays,
            totalHours: Math.round(totalHours * 100) / 100,
            attendanceScore: Math.round(attendanceScore * 100) / 100
          },
          hasPayroll: !!existingPayroll,
          payrollId: existingPayroll?._id
        };
      })
    );

    // Generate AI insights
    const companyName = req.user.company?.name || 'Company';
    const aiReport = await generateAIReport({
      employees: employeeReports,
      month: Number(month),
      year: Number(year),
      companyName
    });

    res.json({
      success: true,
      message: "Monthly salary report generated successfully",
      data: {
        month: Number(month),
        year: Number(year),
        employees: employeeReports,
        summary: {
          totalEmployees: employeeReports.length,
          totalPayroll: employeeReports.reduce((sum, emp) => sum + emp.calculatedSalary, 0),
          averageAttendance: employeeReports.length > 0
            ? employeeReports.reduce((sum, emp) => sum + emp.attendance.attendanceScore, 0) / employeeReports.length
            : 0,
          totalAbsentDays: employeeReports.reduce((sum, emp) => sum + emp.attendance.absent, 0),
          totalLeaveDays: employeeReports.reduce((sum, emp) => sum + emp.attendance.leave, 0),
          totalPresentDays: employeeReports.reduce((sum, emp) => sum + emp.attendance.present, 0)
        },
        aiInsights: aiReport.success ? aiReport.data : null
      }
    });
  } catch (error) {
    console.error("Error generating monthly salary report:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Bulk AI-powered payroll generation for ALL employees in the company
 * Uses AI to analyze attendance and generate payroll recommendations for all employees at once
 */
export const bulkAIGenerateAllPayrolls = async (req, res) => {
  try {
    const { startDate, endDate, payDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    // Parse dates - handle both ISO strings and date objects
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Please provide valid start and end dates."
      });
    }
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Get all employees for the company (excluding restricted roles)
    const restrictedRoles = ['superadmin', 'admin', 'driver', 'reporter', 'customer', 'contact', 'salesperson', 'operator'];
    const companyFilter = isSuperadmin ? {} : { company: companyId };
    
    const employees = await User.find({
      ...companyFilter,
      role: { $nin: restrictedRoles }
    }).lean();

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No eligible employees found for payroll generation"
      });
    }

    // Get attendance for all employees in the date range
    const attendanceFilter = {
      ...companyFilter,
      date: { $gte: start, $lte: end }
    };

    const allAttendanceRecords = await Attendance.find(attendanceFilter)
      .populate('employee', 'name role details')
      .lean();

    // Get previous payrolls for context
    const previousPayrolls = await Payroll.find({
      ...companyFilter,
      createdAt: { $gte: new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
    })
      .populate('userId', 'name role')
      .sort({ createdAt: -1 })
      .lean();

    // Process each employee and prepare data for AI
    const employeePayrollData = [];
    const employeeAttendanceMap = {};

    // Group attendance by employee
    allAttendanceRecords.forEach(record => {
      const empId = record.employee?._id?.toString() || record.employee?.toString();
      if (!employeeAttendanceMap[empId]) {
        employeeAttendanceMap[empId] = [];
      }
      employeeAttendanceMap[empId].push(record);
    });

    // Prepare data for each employee
    for (const employee of employees) {
      const empId = employee._id.toString();
      const attendanceRecords = employeeAttendanceMap[empId] || [];
      
      // Treat late as present - combine them
      const presentDays = attendanceRecords.filter(r => r.status === 'present' || r.status === 'late').length;
      const workedDays = presentDays; // Same as presentDays (late included)
      const absentDays = attendanceRecords.filter(r => r.status === 'absent').length;
      const leaveDays = attendanceRecords.filter(r => r.status === 'leave').length;
      const totalHours = attendanceRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);

      // Get previous payrolls for this employee
      const empPreviousPayrolls = previousPayrolls
        .filter(p => p.userId?._id?.toString() === empId)
        .slice(0, 3)
        .map(p => ({
          baseSalary: p.baseSalary,
          bonus: p.bonus,
          deductions: p.deductions,
          totalSalary: p.totalSalary,
          payDate: p.payDate
        }));

      // Try to get baseSalary from:
      // 1. Previous payrolls (most recent)
      // 2. Employee details baseSalary (if exists)
      // 3. hourlyRate * 160 (monthly hours)
      // 4. Default to 0 (user can fill in during review)
      let baseSalary = 0;
      if (empPreviousPayrolls.length > 0 && empPreviousPayrolls[0].baseSalary) {
        baseSalary = empPreviousPayrolls[0].baseSalary;
      } else if (employee.details?.baseSalary) {
        baseSalary = employee.details.baseSalary;
      } else if (employee.details?.hourlyRate && employee.details.hourlyRate > 0) {
        baseSalary = employee.details.hourlyRate * 160; // Monthly hours
      }

      employeePayrollData.push({
        employeeId: empId,
        employeeName: employee.name,
        role: employee.role,
        baseSalary,
        hourlyRate: employee.details?.hourlyRate || 0,
        attendanceRecords,
        presentDays, // Includes late days
        workedDays, // Same as presentDays (late included)
        absentDays,
        leaveDays,
        totalHours,
        previousPayrolls: empPreviousPayrolls,
        hasSalaryInfo: baseSalary > 0
      });
    }

    if (employeePayrollData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No eligible employees found for payroll generation"
      });
    }

    // Use AI to analyze all employees at once (more efficient)
    const aiAnalysis = await analyzeBulkPayrollWithAI(employeePayrollData, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      companyName: req.user.company?.name || 'Company'
    });

    // Process AI recommendations and calculate payrolls
    const suggestedPayrolls = employeePayrollData.map((empData, index) => {
      // Find matching AI recommendation by employee index or name
      const aiRec = aiAnalysis.recommendations?.find((r) => 
        r.employeeIndex === index || 
        (r.employeeName && r.employeeName === empData.employeeName)
      ) || {};
      
      // Calculate based on attendance
      let calculatedBaseSalary = empData.baseSalary;
      
      // For hourly employees
      if (empData.hourlyRate && empData.hourlyRate > 0) {
        const regularHours = Math.min(empData.totalHours, empData.workedDays * 8);
        const overtimeHours = Math.max(0, empData.totalHours - regularHours);
        calculatedBaseSalary = (regularHours * empData.hourlyRate) + (overtimeHours * empData.hourlyRate * 1.5);
      } else if (empData.baseSalary > 0) {
        // For salary employees, calculate based on worked days (present includes late)
        const totalWorkingDays = empData.workedDays + empData.absentDays + empData.leaveDays;
        const workingDaysInPeriod = totalWorkingDays || 22;
        const dailyRateCalc = empData.baseSalary / workingDaysInPeriod;
        calculatedBaseSalary = empData.workedDays * dailyRateCalc;
      } else {
        // No salary info - use 0, user will need to fill it in
        calculatedBaseSalary = 0;
      }

      // Get AI recommendations or use fallback
      // Only calculate bonus/deductions if we have a base salary
      let bonus = 0;
      let deductions = 0;
      
      if (calculatedBaseSalary > 0) {
        const totalDays = empData.workedDays + empData.absentDays;
        // Bonus if worked 95% or more of expected days
        bonus = aiRec.recommendedBonus || (empData.workedDays > 0 && totalDays > 0 && (empData.workedDays / totalDays) >= 0.95 ? calculatedBaseSalary * 0.05 : 0);
        const dailyRate = calculatedBaseSalary / 30;
        // Deduct for absent days only (late is treated as present)
        const absentDeduction = empData.absentDays * dailyRate;
        deductions = aiRec.recommendedDeductions || absentDeduction;
      } else {
        // Use AI recommendations if available, otherwise 0
        bonus = aiRec.recommendedBonus || 0;
        deductions = aiRec.recommendedDeductions || 0;
      }

      // Calculate taxes based on gross salary (base + bonus)
      const grossSalary = calculatedBaseSalary + bonus;
      const country = 'USA'; // Default, can be made configurable per employee
      
      // Calculate taxes (simplified calculations - can be enhanced with actual tax brackets)
      let federalIncomeTaxUS = 0;
      let stateIncomeTaxUS = 0;
      let socialSecurityTax = 0;
      let medicareTax = 0;
      let stateDisabilityInsurance = 0;
      let localTax = 0;
      let federalIncomeTaxCA = 0;
      let provincialIncomeTaxCA = 0;
      let cpp = 0;
      let ei = 0;
      let provincialHealthTaxCA = 0;

      if (country === 'Canada') {
        // Canada tax calculations (simplified)
        // Federal tax: ~15% on first $50k, 20.5% on next $50k, etc.
        if (grossSalary > 0) {
          federalIncomeTaxCA = Math.round(grossSalary * 0.15 * 100) / 100; // Simplified 15%
          provincialIncomeTaxCA = Math.round(grossSalary * 0.10 * 100) / 100; // Simplified 10%
          cpp = Math.round(Math.min(grossSalary * 0.0595, 3754.45) * 100) / 100; // CPP max for 2024
          ei = Math.round(Math.min(grossSalary * 0.0166, 1002.45) * 100) / 100; // EI max for 2024
          provincialHealthTaxCA = grossSalary > 20000 ? Math.round(grossSalary * 0.01 * 100) / 100 : 0;
        }
      } else {
        // USA tax calculations (simplified)
        // Federal tax: ~10% on first $11k, 12% on next $33k, etc.
        if (grossSalary > 0) {
          federalIncomeTaxUS = Math.round(grossSalary * 0.12 * 100) / 100; // Simplified 12%
          stateIncomeTaxUS = Math.round(grossSalary * 0.05 * 100) / 100; // Simplified 5%
          // Social Security: 6.2% up to wage base limit ($168,600 for 2024)
          socialSecurityTax = Math.round(Math.min(grossSalary * 0.062, 10453.20) * 100) / 100;
          // Medicare: 1.45% on all earnings
          medicareTax = Math.round(grossSalary * 0.0145 * 100) / 100;
          stateDisabilityInsurance = Math.round(grossSalary * 0.009 * 100) / 100; // Simplified 0.9%
          localTax = Math.round(grossSalary * 0.01 * 100) / 100; // Simplified 1%
        }
      }

      // Calculate total taxes
      let totalTaxes = 0;
      if (country === 'Canada') {
        totalTaxes = federalIncomeTaxCA + provincialIncomeTaxCA + cpp + ei + provincialHealthTaxCA;
      } else {
        totalTaxes = federalIncomeTaxUS + stateIncomeTaxUS + socialSecurityTax + medicareTax + stateDisabilityInsurance + localTax;
      }

      // Calculate final total salary (gross - deductions - taxes)
      const finalTotalSalary = Math.round((grossSalary - deductions - totalTaxes) * 100) / 100;

      // Calculate hours properly for this employee
      const empHourlyRate = empData.hourlyRate || 0;
      let empRegularHours = 0;
      let empOvertimeHours = 0;
      
      if (empHourlyRate > 0) {
        // For hourly employees, calculate regular vs overtime
        empRegularHours = Math.min(empData.totalHours, empData.workedDays * 8);
        empOvertimeHours = Math.max(0, empData.totalHours - empRegularHours);
      } else {
        // For salaried employees, all hours are regular
        empRegularHours = empData.totalHours;
        empOvertimeHours = 0;
      }

      return {
        userId: empData.employeeId,
        employee: {
          _id: empData.employeeId,
          name: empData.employeeName,
          role: empData.role
        },
        baseSalary: Math.round(calculatedBaseSalary * 100) / 100,
        bonus: Math.round(bonus * 100) / 100,
        deductions: Math.round(deductions * 100) / 100,
        totalSalary: finalTotalSalary,
        payDate: payDate ? new Date(payDate) : new Date(),
        startDate: start,
        endDate: end,
        // Hours fields
        totalHours: Math.round(empData.totalHours * 100) / 100,
        regularHours: Math.round(empRegularHours * 100) / 100,
        overtimeHours: Math.round(empOvertimeHours * 100) / 100,
        hourlyRate: empHourlyRate,
        // Attendance summary
        presentDays: empData.presentDays,
        absentDays: empData.absentDays,
        leaveDays: empData.leaveDays,
        // Tax fields
        country: country,
        // Canada taxes
        federalIncomeTaxCA: Math.round(federalIncomeTaxCA * 100) / 100,
        provincialIncomeTaxCA: Math.round(provincialIncomeTaxCA * 100) / 100,
        cpp: Math.round(cpp * 100) / 100,
        ei: Math.round(ei * 100) / 100,
        provincialHealthTaxCA: Math.round(provincialHealthTaxCA * 100) / 100,
        // USA taxes
        federalIncomeTaxUS: Math.round(federalIncomeTaxUS * 100) / 100,
        stateIncomeTaxUS: Math.round(stateIncomeTaxUS * 100) / 100,
        socialSecurityTax: Math.round(socialSecurityTax * 100) / 100,
        medicareTax: Math.round(medicareTax * 100) / 100,
        stateDisabilityInsurance: Math.round(stateDisabilityInsurance * 100) / 100,
        localTax: Math.round(localTax * 100) / 100,
        attendance: {
          presentDays: empData.presentDays,
          lateDays: empData.lateDays,
          workedDays: empData.workedDays, // Same as presentDays (late included)
          absentDays: empData.absentDays,
          leaveDays: empData.leaveDays,
          totalHours: Math.round(empData.totalHours * 100) / 100,
          regularHours: empData.hourlyRate ? Math.min(empData.totalHours, empData.workedDays * 8) : 0,
          overtimeHours: empData.hourlyRate ? Math.max(0, empData.totalHours - (empData.workedDays * 8)) : 0
        },
        aiRecommendations: {
          attendanceScore: aiRec.attendanceScore || Math.round(((empData.presentDays + empData.leaveDays) / (empData.presentDays + empData.absentDays + empData.leaveDays)) * 100),
          recommendations: aiRec.recommendations || [],
          notes: aiRec.notes || ''
        }
      };
    });

    res.json({
      success: true,
      message: `Generated payroll suggestions for ${suggestedPayrolls.length} employees`,
      data: {
        payrolls: suggestedPayrolls,
        summary: {
          totalEmployees: suggestedPayrolls.length,
          totalPayroll: suggestedPayrolls.reduce((sum, p) => sum + p.totalSalary, 0),
          totalBonus: suggestedPayrolls.reduce((sum, p) => sum + p.bonus, 0),
          totalDeductions: suggestedPayrolls.reduce((sum, p) => sum + p.deductions, 0)
        },
        aiInsights: aiAnalysis.insights || []
      }
    });
  } catch (error) {
    console.error("Error in bulk AI payroll generation:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Bulk generate payrolls for multiple employees
 */
export const bulkGeneratePayrolls = async (req, res) => {
  try {
    const { employeeIds, month, year } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Employee IDs array is required"
      });
    }

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required"
      });
    }

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first."
      });
    }

    const results = [];
    const errors = [];

    for (const userId of employeeIds) {
      try {
        // Create a mock request for generateAutomatedPayroll
        const mockReq = {
          ...req,
          body: {
            userId,
            month,
            year
          }
        };
        const mockRes = {
          json: (data) => {
            if (data.success) {
              results.push(data.data);
            } else {
              errors.push({ userId, error: data.message });
            }
          },
          status: (code) => ({
            json: (data) => {
              errors.push({ userId, error: data.message });
            }
          })
        };

        await generateAutomatedPayroll(mockReq, mockRes);
      } catch (error) {
        errors.push({ userId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${employeeIds.length} employees`,
      data: {
        successful: results.length,
        failed: errors.length,
        results,
        errors
      }
    });
  } catch (error) {
    console.error("Error in bulk payroll generation:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

