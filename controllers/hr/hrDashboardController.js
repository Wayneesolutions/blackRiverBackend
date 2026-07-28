import { User } from "../../models/driver/userModel.js";
import { EmployeeDocument } from "../../models/driver/employeeDocumentModel.js";
import Load from "../../models/loadModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";
import { CompanyDocument } from "../../models/companyDocumentModel.js";
import { Attendance } from "../../models/hr/attendanceModel.js";
import Issue from "../../models/issueModel.js";
import VehicleDocuments from "../../models/driver/vehicleDocumentsModel.js";

// ✅ Get HR Dashboard Stats
export const getHRDashboard = async (req, res) => {
  try {
    const isSuperadmin = req.user?.role === 'superadmin';
    const userRole = req.user?.role;
    
    // Get company filter with strict validation
    const companyId = getUserCompanyId(req.user);
    const hasValidCompany = companyId !== null && 
                            companyId !== undefined && 
                            companyId !== '' &&
                            String(companyId).trim() !== '' &&
                            String(companyId) !== 'null' &&
                            String(companyId) !== 'undefined';

    // CRITICAL: If not superadmin and no valid company, return empty data immediately
    if (!isSuperadmin && !hasValidCompany) {
      console.log('❌ getHRDashboard: Admin/HR has no company - returning empty data');
      return res.json({
        success: true,
        data: {
          recentDriverActivity: { active: 0, inactive: 0 },
          pendingDocumentRenewals: 0,
          totalDrivers: 0,
          totalEmployees: 0,
          totalOfficeEmployees: 0,
          activeDrivers: 0,
          soloDrivers: 0,
          teamDrivers: 0,
          totalLoads: 0,
          newJoinersThisMonth: 0,
          newEmployeesThisMonth: 0,
          documents: { pending: 0 },
          companyDocuments: { total: 0, expiringSoon: 0 },
          attendance: { presentToday: 0 },
          employeePortfolio: { completed: 0 },
          issues: { open: 0 },
          usBasedDrivers: 0,
          canadaBasedDrivers: 0,
          upcomingBirthdays: [],
          upcomingWorkAnniversaries: [],
          documentExpiryTracking: []
        },
        message: "No company assigned to the current user. Please contact administrator to assign a company.",
        requiresCompanySetup: true
      });
    }

    const companyFilter = hasValidCompany ? { company: companyId } : null;
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    // Build user filter - CRITICAL: For non-superadmin, MUST include company
    let userFilter = {};
    if (isSuperadmin) {
      userFilter = baseFilter || {};
    } else {
      // Non-superadmin MUST have company filter
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            userFilter = {
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }]
            };
          } else {
            userFilter = baseFilter;
          }
        } else if (baseFilter.company) {
          userFilter = baseFilter;
        } else {
          userFilter = { ...baseFilter, company: companyId };
        }
      } else {
        userFilter = { company: companyId };
      }
    }

    // Get current month start and end dates
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Total Drivers (all drivers regardless of status)
    const totalDrivers = await User.countDocuments({
      ...userFilter,
      role: 'driver'
    });

    // Total Employees (all users except admin/superadmin/driver/reporter)
    const totalEmployees = await User.countDocuments({
      ...userFilter,
      role: { $nin: ['admin', 'superadmin','driver','reporter'] }
    });

    // Total Office Employees (non-driver employees)
    const totalOfficeEmployees = await User.countDocuments({
      ...userFilter,
      role: { $nin: ['admin', 'superadmin','driver','reporter'] }
    });

    // Active Drivers (drivers with status 'active')
    const activeDrivers = await User.countDocuments({
      ...userFilter,
      role: 'driver',
      status: 'active'
    });

    // Recent Driver Activity (active/inactive)
    const activeDriversCount = await User.countDocuments({
      ...userFilter,
      role: 'driver',
      status: 'active'
    });
    const inactiveDriversCount = await User.countDocuments({
      ...userFilter,
      role: 'driver',
      status: 'inactive'
    });

    // Solo Drivers (drivers without a co-driver or team assignment)
    // This is determined by checking if driver has details.driverTypeSolo or if they're not in a team
    // For now, we'll count all drivers as solo unless they have a specific team indicator
    // You may need to adjust this based on your business logic
    const soloDriversFilter = {
      ...userFilter,
      role: 'driver',
      status: 'active',
      $or: [
        { 'details.driverTypeSolo': true },
        { 'details.driverTypeSolo': { $exists: false } }
      ]
    };
    const soloDrivers = await User.countDocuments(soloDriversFilter);

    // Team Drivers (drivers with team assignment or co-driver)
    const teamDriversFilter = {
      ...userFilter,
      role: 'driver',
      status: 'active',
      'details.driverTypeSolo': false
    };
    const teamDrivers = await User.countDocuments(teamDriversFilter);

    // New Joiners This Month (all roles except admin/superadmin)
    const newJoinersThisMonth = await User.countDocuments({
      ...userFilter,
      role: { $nin: ['admin', 'superadmin'] },
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    });

    // New Employees This Month (office employees only, excluding drivers)
    const newEmployeesThisMonth = await User.countDocuments({
      ...userFilter,
      role: { $nin: ['admin', 'superadmin', 'driver', 'reporter'] },
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth
      }
    });

    // Total Loads - CRITICAL: Must filter by company for non-superadmin
    let loadFilter = {};
    if (isSuperadmin) {
      loadFilter = baseFilter || {};
    } else {
      if (baseFilter) {
        if (baseFilter.$and && Array.isArray(baseFilter.$and)) {
          const hasCompany = baseFilter.$and.some(cond => cond && cond.company);
          if (!hasCompany) {
            loadFilter = {
              ...baseFilter,
              $and: [...baseFilter.$and, { company: companyId }]
            };
          } else {
            loadFilter = baseFilter;
          }
        } else if (baseFilter.company) {
          loadFilter = baseFilter;
        } else {
          loadFilter = { ...baseFilter, company: companyId };
        }
      } else {
        loadFilter = { company: companyId };
      }
    }
    const totalLoads = await Load.countDocuments(loadFilter);

    // Pending Document Renewals (documents expiring within 30 days or expired)
    let pendingRenewals = 0;
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const documentFilter = {
      expiryDate: {
        $lte: thirtyDaysFromNow
      },
      status: { $in: ['expiring-soon', 'expired', 'pending'] }
    };

    if (isSuperadmin) {
      // Superadmin - get all pending renewals
      pendingRenewals = await EmployeeDocument.countDocuments(documentFilter);
    } else if (hasValidCompany && companyId) {
      // Find employees with this company - MUST use company filter
      const employees = await User.find({ company: companyId }).select('_id');
      const employeeIds = employees.map(emp => emp._id);
      
      if (employeeIds.length > 0) {
        documentFilter.employee = { $in: employeeIds };
        pendingRenewals = await EmployeeDocument.countDocuments(documentFilter);
      } else {
        pendingRenewals = 0;
      }
    } else {
      pendingRenewals = 0;
    }

    // Documents with status "pending"
    let pendingDocuments = 0;
    const pendingDocFilter = { status: 'pending' };
    if (isSuperadmin) {
      pendingDocuments = await EmployeeDocument.countDocuments(pendingDocFilter);
    } else if (hasValidCompany && companyId) {
      const employees = await User.find({ company: companyId }).select('_id');
      const employeeIds = employees.map(emp => emp._id);
      if (employeeIds.length > 0) {
        pendingDocFilter.employee = { $in: employeeIds };
        pendingDocuments = await EmployeeDocument.countDocuments(pendingDocFilter);
      } else {
        pendingDocuments = 0;
      }
    } else {
      pendingDocuments = 0;
    }

    // Company Documents - Total and Expiring Soon
    let companyDocsTotal = 0;
    let companyDocsExpiringSoon = 0;
    
    // Count CompanyDocument total
    if (isSuperadmin) {
      companyDocsTotal = await CompanyDocument.countDocuments({});
    } else if (hasValidCompany && companyId) {
      companyDocsTotal = await CompanyDocument.countDocuments({ company: companyId });
    } else {
      companyDocsTotal = 0;
    }

    // Count VehicleDocuments expiring soon (company-level documents)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNowStr = new Date();
    thirtyDaysFromNowStr.setDate(thirtyDaysFromNowStr.getDate() + 30);
    thirtyDaysFromNowStr.setHours(23, 59, 59, 999);
    const todayStr = today.toISOString().split('T')[0];
    const futureDateStr = thirtyDaysFromNowStr.toISOString().split('T')[0];

    const vehicleDocFilter = {
      expiryDate: {
        $gte: todayStr,
        $lte: futureDateStr
      },
      status: { $ne: 'expired' },
      ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
    };

    if (isSuperadmin) {
      companyDocsExpiringSoon = await VehicleDocuments.countDocuments(vehicleDocFilter);
    } else if (hasValidCompany && companyId) {
      vehicleDocFilter.company = companyId;
      companyDocsExpiringSoon = await VehicleDocuments.countDocuments(vehicleDocFilter);
    } else {
      companyDocsExpiringSoon = 0;
    }

    // Attendance - Present Today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let presentToday = 0;
    const attendanceFilter = {
      date: {
        $gte: todayStart,
        $lte: todayEnd
      },
      status: 'present'
    };

    if (isSuperadmin) {
      presentToday = await Attendance.countDocuments(attendanceFilter);
    } else if (hasValidCompany && companyId) {
      attendanceFilter.company = companyId;
      presentToday = await Attendance.countDocuments(attendanceFilter);
    } else {
      presentToday = 0;
    }

    // Employee Portfolio - Completed (count active employees with essential fields)
    const portfolioFilter = {
      ...userFilter,
      role: { $nin: ['admin', 'superadmin'] },
      status: 'active',
      name: { $exists: true, $ne: null, $ne: '' },
      email: { $exists: true, $ne: null, $ne: '' }
    };
    const completedPortfolios = await User.countDocuments(portfolioFilter);

    // Issues - Open
    let openIssues = 0;
    const issueFilter = { status: 'open' };
    if (isSuperadmin) {
      openIssues = await Issue.countDocuments(issueFilter);
    } else if (hasValidCompany && companyId) {
      issueFilter.company = companyId;
      openIssues = await Issue.countDocuments(issueFilter);
    } else {
      openIssues = 0;
    }

    // US-based Drivers count (country or citizenship matches US)
    const usBasedDriversFilter = {
      ...userFilter,
      role: 'driver',
      $or: [
        { country: { $regex: /^US$/i } },
        { country: { $regex: /^United States$/i } },
        { country: { $regex: /^USA$/i } },
        { 'details.citizenship': { $regex: /^US$/i } },
        { 'details.citizenship': { $regex: /^United States$/i } },
        { 'details.citizenship': { $regex: /^USA$/i } }
      ]
    };
    const usBasedDrivers = await User.countDocuments(usBasedDriversFilter);
    // Canada-based Drivers count (country or citizenship matches Canada)
    const canadaBasedDriversFilter = {
      ...userFilter,
      role: 'driver',
      $or: [
        { country: { $regex: /^Canada$/i } },
        { country: { $regex: /^CA$/i } },
        { 'details.citizenship': { $regex: /^Canada$/i } },
        { 'details.citizenship': { $regex: /^Canadian$/i } }
      ]
    };
    const canadaBasedDrivers = await User.countDocuments(canadaBasedDriversFilter);

    // Upcoming Birthdays (next 30 days)
    const todayForBirthdays = new Date();
    todayForBirthdays.setHours(0, 0, 0, 0);
    todayForBirthdays.setMinutes(0, 0);
    todayForBirthdays.setSeconds(0, 0);
    todayForBirthdays.setMilliseconds(0);
    
    const thirtyDaysFromNowForBirthdays = new Date(todayForBirthdays);
    thirtyDaysFromNowForBirthdays.setDate(todayForBirthdays.getDate() + 30);
    thirtyDaysFromNowForBirthdays.setHours(23, 59, 59, 999);

    // Get all users with DOB for birthday calculation (including inactive for completeness)
    const birthdayFilter = {
      ...userFilter,
      $or: [
        { dob: { $exists: true, $ne: null } },
        { 'details.dateOfBirth': { $exists: true, $ne: null } }
      ],
      role: { $nin: ['admin', 'superadmin'] }
      // Removed status filter to include all employees/drivers
    };

    const usersWithDob = await User.find(birthdayFilter).select('name dob details.dateOfBirth role status').lean();
    
    // Filter users with birthdays in next 30 days
    const currentYear = todayForBirthdays.getFullYear();
    const upcomingBirthdays = usersWithDob
      .map(user => {
        const dob = user.dob || user.details?.dateOfBirth;
        if (!dob) return null;
        
        // Handle both Date objects and ISO strings
        const birthDate = dob instanceof Date ? dob : new Date(dob);
        if (isNaN(birthDate.getTime())) return null;
        
        // Get the month and day from the birth date
        const birthMonth = birthDate.getMonth();
        const birthDay = birthDate.getDate();
        
        // Create birthday for this year
        const thisYearBirthday = new Date(currentYear, birthMonth, birthDay);
        thisYearBirthday.setHours(0, 0, 0, 0);
        
        // Create birthday for next year
        const nextYearBirthday = new Date(currentYear + 1, birthMonth, birthDay);
        nextYearBirthday.setHours(0, 0, 0, 0);
        
        // Determine which birthday is upcoming
        let upcomingDate = thisYearBirthday;
        if (thisYearBirthday < todayForBirthdays) {
          upcomingDate = nextYearBirthday;
        }
        
        // Check if the upcoming birthday is within the next 30 days
        if (upcomingDate >= todayForBirthdays && upcomingDate <= thirtyDaysFromNowForBirthdays) {
          // Calculate days until birthday
          const daysUntil = Math.ceil((upcomingDate.getTime() - todayForBirthdays.getTime()) / (1000 * 60 * 60 * 24));
          
          return {
            name: user.name || 'Unknown',
            birthday: upcomingDate.toISOString().split('T')[0],
            daysUntil: daysUntil,
            role: user.role || 'Unknown'
          };
        }
        return null;
      })
      .filter(b => b !== null)
      .sort((a, b) => {
        // Sort by days until birthday (ascending)
        return (a.daysUntil || 0) - (b.daysUntil || 0);
      })
      .slice(0, 50); // Limit to 50 upcoming birthdays

    // Upcoming Work Anniversaries (next 30 days based on joinDate)
    const upcomingAnniversariesFilter = {
      ...userFilter,
      role: { $nin: ['admin', 'superadmin'] },
      status: 'active',
      joinDate: { $exists: true, $ne: null }
    };

    const usersWithJoinDate = await User.find(upcomingAnniversariesFilter).select('name joinDate role');
    
    // Filter users with work anniversaries in next 30 days
    const upcomingWorkAnniversaries = usersWithJoinDate
      .map(user => {
        if (!user.joinDate) return null;
        
        const joinDate = new Date(user.joinDate);
        const thisYearAnniversary = new Date(currentYear, joinDate.getMonth(), joinDate.getDate());
        const nextYearAnniversary = new Date(currentYear + 1, joinDate.getMonth(), joinDate.getDate());
        
        let upcomingDate = thisYearAnniversary;
        if (thisYearAnniversary < todayForBirthdays) {
          upcomingDate = nextYearAnniversary;
        }
        
        if (upcomingDate >= todayForBirthdays && upcomingDate <= thirtyDaysFromNowForBirthdays) {
          // Calculate years of service based on the upcoming anniversary date
          const yearsOfService = upcomingDate.getFullYear() - joinDate.getFullYear();
          return {
            name: user.name || 'Unknown',
            anniversaryDate: upcomingDate.toISOString().split('T')[0],
            yearsOfService: yearsOfService,
            role: user.role
          };
        }
        return null;
      })
      .filter(a => a !== null)
      .sort((a, b) => new Date(a.anniversaryDate) - new Date(b.anniversaryDate))
      .slice(0, 50); // Limit to 50 upcoming anniversaries

    // Document Expiry Tracking (documents expiring within 30 days)
    let documentExpiryTracking = [];
    const todayForDocs = new Date();
    todayForDocs.setHours(0, 0, 0, 0);
    const thirtyDaysFromNowForDocs = new Date();
    thirtyDaysFromNowForDocs.setDate(todayForDocs.getDate() + 30);
    thirtyDaysFromNowForDocs.setHours(23, 59, 59, 999);
    
    const docExpiryFilter = {
      expiryDate: {
        $gte: todayForDocs,
        $lte: thirtyDaysFromNowForDocs
      },
      status: { $in: ['valid', 'expiring-soon'] }, // Only include valid or expiring-soon documents
      ignoreExpiration: { $ne: true } // Exclude documents with ignoreExpiration: true
    };

    if (isSuperadmin) {
      const expiringDocs = await EmployeeDocument.find(docExpiryFilter)
        .populate('employee', 'name role')
        .select('documentType expiryDate employee')
        .sort({ expiryDate: 1 })
        .limit(100);
      
      documentExpiryTracking = expiringDocs.map(doc => ({
        documentType: doc.documentType,
        employeeOrDriverName: doc.employee?.name || 'Unknown',
        expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().split('T')[0] : null,
        role: doc.employee?.role || 'Unknown'
      }));
    } else if (hasValidCompany && companyId) {
      const employees = await User.find({ company: companyId }).select('_id');
      const employeeIds = employees.map(emp => emp._id);
      
      if (employeeIds.length > 0) {
        docExpiryFilter.employee = { $in: employeeIds };
        const expiringDocs = await EmployeeDocument.find(docExpiryFilter)
          .populate('employee', 'name role')
          .select('documentType expiryDate employee')
          .sort({ expiryDate: 1 })
          .limit(100);
        
        documentExpiryTracking = expiringDocs.map(doc => ({
          documentType: doc.documentType,
          employeeOrDriverName: doc.employee?.name || 'Unknown',
          expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().split('T')[0] : null,
          role: doc.employee?.role || 'Unknown'
        }));
      } else {
        documentExpiryTracking = [];
      }
    } else {
      documentExpiryTracking = [];
    }

    const responseData = {
      success: true,
      data: {
        recentDriverActivity: {
          active: activeDriversCount,
          inactive: inactiveDriversCount
        },
        pendingDocumentRenewals: pendingRenewals,
        totalDrivers: totalDrivers,
        totalEmployees: totalEmployees,
        totalOfficeEmployees: totalOfficeEmployees,
        activeDrivers: activeDrivers,
        soloDrivers: soloDrivers,
        teamDrivers: teamDrivers,
        totalLoads: totalLoads,
        newJoinersThisMonth: newJoinersThisMonth,
        newEmployeesThisMonth: newEmployeesThisMonth,
        documents: {
          pending: pendingDocuments
        },
        companyDocuments: {
          total: companyDocsTotal,
          expiringSoon: companyDocsExpiringSoon
        },
        attendance: {
          presentToday: presentToday
        },
        employeePortfolio: {
          completed: completedPortfolios
        },
        issues: {
          open: openIssues
        },
        usBasedDrivers: usBasedDrivers,
        canadaBasedDrivers: canadaBasedDrivers,
        upcomingBirthdays: upcomingBirthdays,
        upcomingWorkAnniversaries: upcomingWorkAnniversaries,
        documentExpiryTracking: documentExpiryTracking
      }
    };


    res.json(responseData);
  } catch (error) {
   
    res.status(500).json({
      success: false,
      message: "Error fetching HR dashboard data",
      error: error.message
    });
  }
};

