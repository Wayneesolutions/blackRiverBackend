import mongoose from "mongoose";
import { User } from "../../models/driver/userModel.js";
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { Attendance } from "../../models/hr/attendanceModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";
import { getCombinedFilter } from "../../utils/trialDataFilter.js";

const TIME_RANGE_IN_DAYS = {
  "1week": 7,
  "2weeks": 14,
  "1month": 30
};

const normalizeDate = (date, endOfDay = false) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
};

const resolveDateRange = (timeRange = "1month", customStart, customEnd) => {
  const now = new Date();
  const endDate = normalizeDate(customEnd, true) || normalizeDate(now, true);

  let startDate = normalizeDate(customStart);
  if (!startDate) {
    const days = TIME_RANGE_IN_DAYS[timeRange] ?? TIME_RANGE_IN_DAYS["1month"];
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
};

const buildSearchFilter = (filter, searchTerm) => {
  if (!searchTerm) return filter;

  const regex = new RegExp(searchTerm.trim(), "i");
  const searchConditions = [
    { name: regex },
    { email: regex },
    { phone: regex },
    { internalId: regex }
  ];

  if (filter.$or) {
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: filter.$or });
    filter.$and.push({ $or: searchConditions });
    delete filter.$or;
  } else {
    filter.$or = searchConditions;
  }

  return filter;
};

const aggregatePayrollByUser = async ({ userIds, startDate, endDate, companyId }) => {
  if (!userIds.length) {
    return new Map();
  }

  const matchStage = { userId: { $in: userIds } };
  if (startDate && endDate) {
    matchStage.payDate = { $gte: startDate, $lte: endDate };
  }
  if (companyId) {
    matchStage.company = { $in: [companyId, null] };
  }

  const results = await Payroll.aggregate([
    { $match: matchStage },
    {
      $addFields: {
        tripsArraySize: {
          $cond: [{ $isArray: "$trips" }, { $size: "$trips" }, 0]
        }
      }
    },
    {
      $group: {
        _id: "$userId",
        totalEarnings: { $sum: { $ifNull: ["$totalSalary", 0] } },
        baseSalary: { $sum: { $ifNull: ["$baseSalary", 0] } },
        bonus: { $sum: { $ifNull: ["$bonus", 0] } },
        deductions: { $sum: { $ifNull: ["$deductions", 0] } },
        totalMiles: { $sum: { $ifNull: ["$totalMiles", 0] } },
        invoices: { $sum: 1 },
        tripsCompleted: { $sum: "$tripsArraySize" }
      }
    }
  ]);

  const map = new Map();
  results.forEach((row) => {
    map.set(row._id.toString(), {
      totalEarnings: row.totalEarnings || 0,
      baseSalary: row.baseSalary || 0,
      bonus: row.bonus || 0,
      deductions: row.deductions || 0,
      totalMiles: row.totalMiles || 0,
      invoices: row.invoices || 0,
      tripsCompleted: row.tripsCompleted || 0
    });
  });

  return map;
};

const aggregateAttendanceByUser = async ({ userIds, startDate, endDate, companyId }) => {
  if (!userIds.length) {
    return new Map();
  }

  const matchStage = { employee: { $in: userIds } };
  if (startDate && endDate) {
    matchStage.date = { $gte: startDate, $lte: endDate };
  }
  if (companyId) {
    matchStage.company = { $in: [companyId, null] };
  }

  const results = await Attendance.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$employee",
        totalHours: { $sum: { $ifNull: ["$totalHours", 0] } },
        daysWorked: {
          $sum: {
            $cond: [{ $in: ["$status", ["present", "late", "leave"]] }, 1, 0]
          }
        },
        presentDays: {
          $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
        },
        absentDays: {
          $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
        },
        lateDays: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
        leaveDays: { $sum: { $cond: [{ $eq: ["$status", "leave"] }, 1, 0] } }
      }
    }
  ]);

  const map = new Map();
  results.forEach((row) => {
    map.set(row._id.toString(), {
      totalHours: row.totalHours || 0,
      daysWorked: row.daysWorked || 0,
      presentDays: row.presentDays || 0,
      absentDays: row.absentDays || 0,
      lateDays: row.lateDays || 0,
      leaveDays: row.leaveDays || 0
    });
  });

  return map;
};

export const getUserProfilesPortfolio = async (req, res) => {
  try {
    const {
      search = "",
      role = "all",
      page = 1,
      limit = 50,
      timeRange = "1month",
      startDate: customStart,
      endDate: customEnd
    } = req.query;

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (numericPage - 1) * numericLimit;

    const companyId = getUserCompanyId(req.user);
    const normalizedCompanyId =
      companyId && mongoose.Types.ObjectId.isValid(companyId)
        ? new mongoose.Types.ObjectId(companyId)
        : companyId;
    const isSuperadmin = req.user?.role === "superadmin";

    if (!isSuperadmin && !companyId) {
      return res.status(200).json({
        success: true,
        message:
          "Please complete company settings first to view user profiles. Go to Company Settings to set up your company.",
        data: [],
        requiresCompanySetup: true,
        pagination: {
          currentPage: numericPage,
          totalPages: 0,
          totalItems: 0,
          pageSize: numericLimit
        }
      });
    }

    const companyFilter = normalizedCompanyId ? { company: normalizedCompanyId } : null;
    const combinedFilter = await getCombinedFilter(req.user, companyFilter);
    const baseFilter = combinedFilter ? { ...combinedFilter } : {};

    // Default: exclude admin & superadmin from list
    baseFilter.role = role && role !== "all" ? role : { $nin: ["admin", "superadmin"] };

    if (companyId) {
      baseFilter.company = companyId;
    }

    buildSearchFilter(baseFilter, search);

    const totalEmployeesPromise = User.countDocuments(baseFilter);
    const employeesPromise = User.find(baseFilter)
      .select(
        "name email role phone joinDate status country state city location details.citizenship details.sinNo details.dateOfBirth details.remark details.postalCode details.hireDate details.cell1 details.cell2 details.cross_border_eligible"
      )
      .sort({ name: 1 })
      .skip(skip)
      .limit(numericLimit)
      .lean();

    const [totalEmployees, employees] = await Promise.all([
      totalEmployeesPromise,
      employeesPromise
    ]);

    const userIds = employees.map((emp) => emp._id);
    const { startDate, endDate } = resolveDateRange(timeRange, customStart, customEnd);

    let [payrollMap, attendanceMap] = await Promise.all([
      aggregatePayrollByUser({
        userIds,
        startDate,
        endDate,
        companyId: normalizedCompanyId
      }),
      aggregateAttendanceByUser({
        userIds,
        startDate,
        endDate,
        companyId: normalizedCompanyId
      })
    ]);

    if (userIds.length > 0) {
      const missingPayrollIds = userIds.filter((id) => !payrollMap.has(id.toString()));
      if (missingPayrollIds.length) {
        const fallbackPayrollMap = await aggregatePayrollByUser({
          userIds: missingPayrollIds,
          companyId: normalizedCompanyId
        });
        fallbackPayrollMap.forEach((value, key) => {
          if (!payrollMap.has(key)) {
            payrollMap.set(key, value);
          }
        });
      }

      const missingAttendanceIds = userIds.filter((id) => !attendanceMap.has(id.toString()));
      if (missingAttendanceIds.length) {
        const fallbackAttendanceMap = await aggregateAttendanceByUser({
          userIds: missingAttendanceIds,
          companyId: normalizedCompanyId
        });
        fallbackAttendanceMap.forEach((value, key) => {
          if (!attendanceMap.has(key)) {
            attendanceMap.set(key, value);
          }
        });
      }
    }

    const profiles = employees.map((employee) => {
      const id = employee._id.toString();
      const payroll = payrollMap.get(id) || {};
      const attendance = attendanceMap.get(id) || {};

      return {
        _id: id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        phone: employee.phone || employee.details?.cell1 || employee.details?.cell2 || null,
        joinDate: employee.joinDate,
        status: employee.status,
        address: employee.location?.address || null,
        city: employee.city || null,
        province: employee.state || null,
        country: employee.country || null,
        postalCode: employee.details?.postalCode || null,
        citizenshipStatus: employee.details?.citizenship || null,
        sinNumber: employee.details?.sinNo || null,
        dateOfBirth: employee.details?.dateOfBirth || null,
        notes: employee.details?.remark || "",
        cross_border_eligible: employee.details?.cross_border_eligible || false,
        totalEarnings: payroll.totalEarnings || 0,
        baseSalary: payroll.baseSalary || 0,
        bonus: payroll.bonus || 0,
        deductions: payroll.deductions || 0,
        invoices: payroll.invoices || 0,
        milesDriven: payroll.totalMiles || 0,
        tripsCompleted: payroll.tripsCompleted || 0,
        daysWorked: attendance.daysWorked || 0,
        totalHours: attendance.totalHours || 0,
        presentDays: attendance.presentDays || 0,
        absentDays: attendance.absentDays || 0,
        lateDays: attendance.lateDays || 0,
        leaveDays: attendance.leaveDays || 0
      };
    });

    const totalPages = Math.ceil(totalEmployees / numericLimit) || 0;

    return res.json({
      success: true,
      data: profiles,
      pagination: {
        currentPage: numericPage,
        totalPages,
        totalItems: totalEmployees,
        pageSize: numericLimit,
        hasNextPage: numericPage < totalPages,
        hasPrevPage: numericPage > 1
      },
      filters: {
        timeRange,
        startDate,
        endDate
      }
    });
  } catch (error) {
    console.error("❌ Error fetching user profiles:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user profiles",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};


