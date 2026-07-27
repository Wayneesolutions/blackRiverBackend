import axios from 'axios';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { convertPdfToImage } from './documentValidationService.js';

/**
 * OpenAI Service for Payroll Automation
 * Uses OpenAI API to analyze employee data and generate payroll recommendations
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Get OpenAI API key from environment variables
 */
const getOpenAIKey = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return apiKey;
};

/**
 * Call OpenAI API with a prompt
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {object} options - Additional options
 * @returns {Promise<object>} OpenAI response
 */
export const callOpenAI = async (prompt, options = {}) => {
  try {
    const apiKey = getOpenAIKey();
    const model = options.model || 'gpt-4o-mini'; // Default to cost-effective model
    const temperature = options.temperature || 0.3;
    const maxTokens = options.maxTokens || 2000;
    const systemPrompt = options.systemPrompt || 'You are an expert HR and payroll analyst. Provide accurate, structured responses in JSON format when requested.';

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: options.responseFormat || undefined
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    return {
      success: true,
      data: response.data.choices[0]?.message?.content || '',
      usage: response.data.usage
    };
  } catch (error) {
    console.error('OpenAI API Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      data: null
    };
  }
};

/**
 * Analyze employee attendance and generate payroll recommendations
 * @param {object} employeeData - Employee data including attendance
 * @returns {Promise<object>} Payroll recommendations
 */
export const analyzePayrollWithAttendance = async (employeeData) => {
  const {
    employeeName,
    baseSalary,
    attendanceRecords,
    month,
    year,
    role,
    previousPayrolls
  } = employeeData;

  // Calculate attendance statistics
  const totalDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(r => r.status === 'present').length;
  const absentDays = attendanceRecords.filter(r => r.status === 'absent').length;
  const leaveDays = attendanceRecords.filter(r => r.status === 'leave').length;
  const lateDays = attendanceRecords.filter(r => r.status === 'late').length;
  const totalHours = attendanceRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);

  const prompt = `Analyze the following employee payroll data and provide recommendations:

Employee: ${employeeName}
Role: ${role}
Base Salary: $${baseSalary}
Month: ${month}/${year}

Attendance Summary:
- Total Days: ${totalDays}
- Present Days: ${presentDays}
- Absent Days: ${absentDays}
- Leave Days: ${leaveDays}
- Late Days: ${lateDays}
- Total Hours Worked: ${totalHours.toFixed(2)}

Previous Payroll History:
${previousPayrolls.length > 0 ? JSON.stringify(previousPayrolls.slice(0, 3), null, 2) : 'No previous payroll records'}

Please provide a JSON response with the following structure:
{
  "recommendedBonus": number (0 if no bonus recommended),
  "recommendedDeductions": number (based on absences/late arrivals),
  "attendanceScore": number (0-100),
  "recommendations": string[] (array of recommendation strings),
  "salaryAdjustment": {
    "type": "none" | "increase" | "decrease",
    "amount": number,
    "reason": string
  },
  "notes": string (summary of analysis)
}

Calculate deductions based on:
- Absent days: $${(baseSalary / 30).toFixed(2)} per day
- Late arrivals: Consider small deductions or warnings
- Leave days: Usually no deduction if approved

Provide realistic and fair recommendations.`;

  const result = await callOpenAI(prompt, {
    responseFormat: { type: 'json_object' },
    temperature: 0.2
  });

  if (!result.success) {
    // Fallback calculation if OpenAI fails
    const dailyRate = baseSalary / 30;
    const absentDeduction = absentDays * dailyRate;
    const lateDeduction = lateDays * (dailyRate * 0.1); // 10% deduction for late
    const attendanceScore = ((presentDays + leaveDays) / totalDays) * 100;

    return {
      success: true,
      data: {
        recommendedBonus: attendanceScore >= 95 ? baseSalary * 0.05 : 0,
        recommendedDeductions: absentDeduction + lateDeduction,
        attendanceScore: Math.round(attendanceScore),
        recommendations: [
          attendanceScore >= 95 ? 'Excellent attendance. Consider bonus.' : '',
          absentDays > 0 ? `${absentDays} absent day(s) will result in deductions.` : '',
          lateDays > 0 ? `${lateDays} late arrival(s) noted.` : ''
        ].filter(Boolean),
        salaryAdjustment: {
          type: 'none',
          amount: 0,
          reason: 'No adjustment recommended'
        },
        notes: `Attendance: ${presentDays} present, ${absentDays} absent, ${leaveDays} leave, ${lateDays} late. Total hours: ${totalHours.toFixed(2)}`
      }
    };
  }

  try {
    const parsedData = JSON.parse(result.data);
    return {
      success: true,
      data: parsedData
    };
  } catch (parseError) {
    // If JSON parsing fails, use fallback
    return analyzePayrollWithAttendance(employeeData);
  }
};

/**
 * Generate monthly salary report with attendance details
 * @param {object} reportData - Report data including all employees
 * @returns {Promise<object>} Generated report
 */
export const generateMonthlySalaryReport = async (reportData) => {
  const { employees, month, year, companyName } = reportData;

  const prompt = `Generate a comprehensive monthly salary report for ${companyName} for ${month}/${year}.

Employee Data:
${JSON.stringify(employees.map(emp => ({
    name: emp.name,
    role: emp.role,
    baseSalary: emp.baseSalary,
    attendance: {
      present: emp.attendance.present,
      absent: emp.attendance.absent,
      leave: emp.attendance.leave,
      late: emp.attendance.late,
      totalHours: emp.attendance.totalHours
    },
    calculatedSalary: emp.calculatedSalary,
    deductions: emp.deductions,
    bonus: emp.bonus
  })), null, 2)}

Provide a JSON response with:
{
  "summary": {
    "totalEmployees": number,
    "totalPayroll": number,
    "averageAttendance": number,
    "totalAbsentDays": number,
    "totalLeaveDays": number
  },
  "insights": string[] (key insights about the payroll),
  "recommendations": string[] (recommendations for HR),
  "reportDate": string (current date)
}`;

  const result = await callOpenAI(prompt, {
    responseFormat: { type: 'json_object' },
    temperature: 0.3
  });

  if (!result.success) {
    // Fallback calculation
    const totalEmployees = employees.length;
    const totalPayroll = employees.reduce((sum, emp) => sum + emp.calculatedSalary, 0);
    const avgAttendance = employees.reduce((sum, emp) => {
      const total = emp.attendance.present + emp.attendance.absent + emp.attendance.leave;
      return sum + (total > 0 ? (emp.attendance.present / total) * 100 : 0);
    }, 0) / totalEmployees;
    const totalAbsentDays = employees.reduce((sum, emp) => sum + emp.attendance.absent, 0);
    const totalLeaveDays = employees.reduce((sum, emp) => sum + emp.attendance.leave, 0);

    return {
      success: true,
      data: {
        summary: {
          totalEmployees,
          totalPayroll: Math.round(totalPayroll * 100) / 100,
          averageAttendance: Math.round(avgAttendance * 100) / 100,
          totalAbsentDays,
          totalLeaveDays
        },
        insights: [
          `Total payroll for ${month}/${year}: $${totalPayroll.toFixed(2)}`,
          `Average attendance rate: ${avgAttendance.toFixed(1)}%`,
          `Total absent days: ${totalAbsentDays}`,
          `Total leave days: ${totalLeaveDays}`
        ],
        recommendations: [
          'Review attendance patterns for employees with high absences',
          'Consider implementing attendance incentives for better performance'
        ],
        reportDate: new Date().toISOString()
      }
    };
  }

  try {
    const parsedData = JSON.parse(result.data);
    return {
      success: true,
      data: parsedData
    };
  } catch (parseError) {
    // Use fallback if parsing fails
    return generateMonthlySalaryReport(reportData);
  }
};

/**
 * Analyze driver payroll based on trips and performance metrics
 * @param {object} driverData - Driver data including trips, performance metrics
 * @returns {Promise<object>} Payroll recommendations with bonus and deductions
 */
export const analyzeDriverPayrollWithTrips = async (driverData) => {
  const {
    driverName,
    baseSalary, // This is trip earnings (baseSalary = totalEarnings from trips)
    totalTrips,
    totalMiles,
    totalEarnings,
    tripPerformance,
    startDate,
    endDate,
    previousPayrolls,
    onTimeDeliveryRate,
    weatherConditionsCount,
    averageDistancePerTrip
  } = driverData;

  const prompt = `Analyze the following driver payroll data and provide recommendations for bonus and deductions:

Driver: ${driverName}
Pay Period: ${startDate} to ${endDate}

Trip Performance Summary:
- Total Trips Completed: ${totalTrips}
- Total Miles Driven: ${totalMiles.toLocaleString()} miles
- Base Earnings (from trips): $${totalEarnings.toFixed(2)}
- Average Distance per Trip: ${averageDistancePerTrip ? averageDistancePerTrip.toFixed(1) : 0} miles
- On-Time Delivery Rate: ${onTimeDeliveryRate ? (onTimeDeliveryRate * 100).toFixed(1) : 0}%
- Trips with Weather Conditions (snow/high temp): ${weatherConditionsCount || 0}

Trip Details:
${tripPerformance && tripPerformance.length > 0 ? JSON.stringify(tripPerformance.slice(0, 10), null, 2) : 'No detailed trip data available'}

Previous Payroll History:
${previousPayrolls.length > 0 ? JSON.stringify(previousPayrolls.slice(0, 3), null, 2) : 'No previous payroll records'}

Please provide a JSON response with the following structure:
{
  "recommendedBonus": number (0 if no bonus recommended, typically 2-10% of base earnings for excellent performance),
  "recommendedDeductions": number (0 unless there are performance issues like late deliveries, complaints, etc.),
  "performanceScore": number (0-100, based on trips completed, on-time delivery, miles driven),
  "recommendations": string[] (array of recommendation strings),
  "performanceNotes": string (summary of driver performance),
  "reasoning": string (explanation for bonus/deduction recommendations)
}

Consider the following when making recommendations:
- Bonus factors: High number of trips, on-time deliveries, challenging weather conditions handled well, consistent performance
- Deduction factors: Late deliveries, customer complaints, safety violations (if data available), significantly below average performance
- Typical bonus range: 2-5% of base earnings for good performance, 5-10% for excellent performance
- Base earnings already includes weather premiums (snow/high temp), so don't double-count those

Provide realistic and fair recommendations based on actual performance data.`;

  const result = await callOpenAI(prompt, {
    model: 'gpt-4o-mini', // Use cost-effective model
    responseFormat: { type: 'json_object' },
    temperature: 0.2,
    maxTokens: 1500
  });

  if (!result.success) {
    // Fallback calculation if OpenAI fails
    const performanceScore = Math.min(100, (totalTrips / 20) * 50 + (onTimeDeliveryRate || 0.9) * 50);
    const recommendedBonus = performanceScore >= 80 ? totalEarnings * 0.03 : (performanceScore >= 70 ? totalEarnings * 0.02 : 0);
    const recommendedDeductions = 0; // No deductions in fallback, as we don't have negative performance data

    return {
      success: true,
      data: {
        recommendedBonus: Math.round(recommendedBonus * 100) / 100,
        recommendedDeductions: recommendedDeductions,
        performanceScore: Math.round(performanceScore),
        recommendations: [
          performanceScore >= 80 ? 'Excellent performance. Consider bonus.' : '',
          totalTrips >= 15 ? `Completed ${totalTrips} trips this period.` : '',
          onTimeDeliveryRate >= 0.95 ? 'Outstanding on-time delivery rate.' : ''
        ].filter(Boolean),
        performanceNotes: `Completed ${totalTrips} trips, drove ${totalMiles.toLocaleString()} miles, earned $${totalEarnings.toFixed(2)}.`,
        reasoning: performanceScore >= 80
          ? 'Driver shows excellent performance with high trip completion and good delivery rates. Bonus recommended.'
          : 'Standard performance. No bonus or deductions recommended.'
      }
    };
  }

  try {
    const parsedData = JSON.parse(result.data);
    return {
      success: true,
      data: parsedData
    };
  } catch (parseError) {
    // If JSON parsing fails, use fallback
    console.error('Error parsing AI response:', parseError);
    return analyzeDriverPayrollWithTrips(driverData);
  }
};

/**
 * Analyze cash flow and provide insights using OpenAI o3-mini
 * @param {object} cashFlowData - Financial data including invoices, expenses, payroll
 * @returns {Promise<object>} Cash flow insights and recommendations
 */
export const analyzeCashFlowInsights = async (cashFlowData) => {
  const {
    totalRevenue = 0,
    totalExpenses = 0,
    totalPayroll = 0,
    pendingInvoices = { totalAmount: 0, count: 0 },
    paidInvoices = { totalAmount: 0, count: 0 },
    monthlyBreakdown = [],
    upcomingExpenses = 0,
    upcomingPayroll = 0,
    averageCollectionDays = 0,
    paymentTrends = [],
    startDate = '',
    endDate = ''
  } = cashFlowData;

  const prompt = `Analyze the following cash flow data for a trucking/logistics company and provide comprehensive insights:

**Financial Summary (${startDate} to ${endDate}):**
- Total Revenue (Paid Invoices): $${totalRevenue.toLocaleString()}
- Total Expenses: $${totalExpenses.toLocaleString()}
- Total Payroll: $${totalPayroll.toLocaleString()}
- Net Cash Flow: $${(totalRevenue - totalExpenses - totalPayroll).toLocaleString()}

**Pending Invoices (Outstanding Receivables):**
- Total Pending Amount: $${pendingInvoices.totalAmount.toLocaleString()}
- Number of Pending Invoices: ${pendingInvoices.count}
- Average Days Outstanding: ${averageCollectionDays} days
- Breakdown by aging:
${pendingInvoices.agingBreakdown ? JSON.stringify(pendingInvoices.agingBreakdown, null, 2) : 'No aging data'}

**Monthly Cash Flow Breakdown:**
${monthlyBreakdown.length > 0 ? JSON.stringify(monthlyBreakdown.slice(-6), null, 2) : 'No monthly data'}

**Payment Trends:**
${paymentTrends.length > 0 ? JSON.stringify(paymentTrends.slice(-3), null, 2) : 'No payment trend data'}

**Upcoming Obligations:**
- Upcoming Expenses: $${upcomingExpenses.toLocaleString()}
- Upcoming Payroll: $${upcomingPayroll.toLocaleString()}

Based on this data, provide a comprehensive JSON response with the following structure:
{
  "summary": {
    "currentCashPosition": number (calculated: revenue - expenses - payroll),
    "cashFlowStatus": string ("positive", "negative", "critical"),
    "availableCash": number,
    "totalObligations": number (expenses + payroll),
    "daysCashOnHand": number (estimated days based on average daily burn rate)
  },
  "trends": {
    "revenueTrend": string ("increasing", "decreasing", "stable"),
    "expenseTrend": string ("increasing", "decreasing", "stable"),
    "cashFlowTrend": string ("improving", "declining", "stable"),
    "collectionTrend": string ("improving", "declining", "stable")
  },
  "predictions": {
    "next30Days": {
      "projectedInflow": number,
      "projectedOutflow": number,
      "projectedCashFlow": number,
      "confidence": number (0-100)
    },
    "next60Days": {
      "projectedInflow": number,
      "projectedOutflow": number,
      "projectedCashFlow": number,
      "confidence": number (0-100)
    },
    "next90Days": {
      "projectedInflow": number,
      "projectedOutflow": number,
      "projectedCashFlow": number,
      "confidence": number (0-100)
    }
  },
  "risks": [
    {
      "severity": string ("high", "medium", "low"),
      "category": string ("liquidity", "collections", "expenses", "payroll"),
      "description": string,
      "impact": string,
      "recommendedAction": string
    }
  ],
  "opportunities": [
    {
      "category": string,
      "description": string,
      "potentialBenefit": string,
      "actionRequired": string
    }
  ],
  "recommendations": [
    {
      "priority": string ("high", "medium", "low"),
      "category": string,
      "recommendation": string,
      "rationale": string,
      "expectedImpact": string
    }
  ],
  "insights": [
    string (array of key insights)
  ],
  "keyMetrics": {
    "collectionRate": number (percentage of invoices paid on time),
    "averagePaymentDelay": number (days),
    "expenseToRevenueRatio": number (percentage),
    "payrollToRevenueRatio": number (percentage),
    "cashConversionCycle": number (days)
  },
  "reasoning": string (detailed explanation of the analysis)
}

Focus on practical, actionable insights for managing cash flow in a trucking/logistics business.`;

  const result = await callOpenAI(prompt, {
    model: 'o3-mini', // Using o3-mini model
    responseFormat: { type: 'json_object' },
    temperature: 0.3,
    maxTokens: 3000
  });

  if (!result.success) {
    console.error('OpenAI cash flow analysis failed, using fallback:', result.error);
    // Fallback calculation
    const currentCash = totalRevenue - totalExpenses - totalPayroll;
    const dailyBurnRate = totalExpenses + totalPayroll > 0 ? (totalExpenses + totalPayroll) / 30 : 0;
    const daysCashOnHand = currentCash > 0 && dailyBurnRate > 0 ? Math.floor(currentCash / dailyBurnRate) : 0;

    return {
      success: true,
      data: {
        summary: {
          currentCashPosition: currentCash,
          cashFlowStatus: currentCash > 0 ? 'positive' : currentCash < -50000 ? 'critical' : 'negative',
          availableCash: currentCash,
          totalObligations: totalExpenses + totalPayroll,
          daysCashOnHand: daysCashOnHand
        },
        trends: {
          revenueTrend: 'stable',
          expenseTrend: 'stable',
          cashFlowTrend: currentCash > 0 ? 'improving' : 'declining',
          collectionTrend: 'stable'
        },
        predictions: {
          next30Days: {
            projectedInflow: pendingInvoices.totalAmount * 0.7, // Assume 70% collection
            projectedOutflow: totalExpenses + totalPayroll,
            projectedCashFlow: (pendingInvoices.totalAmount * 0.7) - (totalExpenses + totalPayroll),
            confidence: 60
          },
          next60Days: {
            projectedInflow: pendingInvoices.totalAmount * 0.85,
            projectedOutflow: (totalExpenses + totalPayroll) * 2,
            projectedCashFlow: (pendingInvoices.totalAmount * 0.85) - ((totalExpenses + totalPayroll) * 2),
            confidence: 50
          },
          next90Days: {
            projectedInflow: pendingInvoices.totalAmount,
            projectedOutflow: (totalExpenses + totalPayroll) * 3,
            projectedCashFlow: pendingInvoices.totalAmount - ((totalExpenses + totalPayroll) * 3),
            confidence: 40
          }
        },
        risks: [
          {
            severity: currentCash < 0 ? 'high' : 'medium',
            category: 'liquidity',
            description: currentCash < 0 ? 'Negative cash flow detected' : 'Monitor cash position closely',
            impact: 'May affect operations if not addressed',
            recommendedAction: 'Focus on collecting pending invoices and review expenses'
          }
        ],
        opportunities: [],
        recommendations: [
          {
            priority: pendingInvoices.totalAmount > 10000 ? 'high' : 'medium',
            category: 'collections',
            recommendation: 'Prioritize collection of pending invoices, especially those overdue',
            rationale: `You have $${pendingInvoices.totalAmount.toLocaleString()} in outstanding receivables`,
            expectedImpact: 'Improve cash flow by collecting outstanding amounts'
          }
        ],
        insights: [
          `Current cash position: $${currentCash.toLocaleString()}`,
          `Pending invoices: $${pendingInvoices.totalAmount.toLocaleString()}`,
          `Average collection days: ${averageCollectionDays} days`
        ],
        keyMetrics: {
          collectionRate: totalRevenue > 0 ? ((totalRevenue / (totalRevenue + pendingInvoices.totalAmount)) * 100).toFixed(1) : 0,
          averagePaymentDelay: averageCollectionDays,
          expenseToRevenueRatio: totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(1) : 0,
          payrollToRevenueRatio: totalRevenue > 0 ? ((totalPayroll / totalRevenue) * 100).toFixed(1) : 0,
          cashConversionCycle: averageCollectionDays + 7 // Simplified calculation
        },
        reasoning: 'Fallback analysis: OpenAI service unavailable. Calculations based on available data.'
      }
    };
  }

  try {
    const parsedData = JSON.parse(result.data);
    return {
      success: true,
      data: parsedData
    };
  } catch (parseError) {
    console.error('Failed to parse OpenAI cash flow response, using fallback:', parseError);
    // Return fallback data instead of recursive call
    const currentCash = totalRevenue - totalExpenses - totalPayroll;
    const dailyBurnRate = totalExpenses + totalPayroll > 0 ? (totalExpenses + totalPayroll) / 30 : 0;
    const daysCashOnHand = currentCash > 0 && dailyBurnRate > 0 ? Math.floor(currentCash / dailyBurnRate) : 0;

    return {
      success: true,
      data: {
        summary: {
          currentCashPosition: currentCash,
          cashFlowStatus: currentCash > 0 ? 'positive' : currentCash < -50000 ? 'critical' : 'negative',
          availableCash: currentCash,
          totalObligations: totalExpenses + totalPayroll,
          daysCashOnHand: daysCashOnHand
        },
        trends: {
          revenueTrend: 'stable',
          expenseTrend: 'stable',
          cashFlowTrend: currentCash > 0 ? 'improving' : 'declining',
          collectionTrend: 'stable'
        },
        predictions: {
          next30Days: {
            projectedInflow: pendingInvoices.totalAmount * 0.7,
            projectedOutflow: totalExpenses + totalPayroll,
            projectedCashFlow: (pendingInvoices.totalAmount * 0.7) - (totalExpenses + totalPayroll),
            confidence: 60
          },
          next60Days: {
            projectedInflow: pendingInvoices.totalAmount * 0.85,
            projectedOutflow: (totalExpenses + totalPayroll) * 2,
            projectedCashFlow: (pendingInvoices.totalAmount * 0.85) - ((totalExpenses + totalPayroll) * 2),
            confidence: 50
          },
          next90Days: {
            projectedInflow: pendingInvoices.totalAmount,
            projectedOutflow: (totalExpenses + totalPayroll) * 3,
            projectedCashFlow: pendingInvoices.totalAmount - ((totalExpenses + totalPayroll) * 3),
            confidence: 40
          }
        },
        risks: [
          {
            severity: currentCash < 0 ? 'high' : 'medium',
            category: 'liquidity',
            description: currentCash < 0 ? 'Negative cash flow detected' : 'Monitor cash position closely',
            impact: 'May affect operations if not addressed',
            recommendedAction: 'Focus on collecting pending invoices and review expenses'
          }
        ],
        opportunities: [],
        recommendations: [
          {
            priority: pendingInvoices.totalAmount > 10000 ? 'high' : 'medium',
            category: 'collections',
            recommendation: 'Prioritize collection of pending invoices, especially those overdue',
            rationale: `You have $${pendingInvoices.totalAmount.toLocaleString()} in outstanding receivables`,
            expectedImpact: 'Improve cash flow by collecting outstanding amounts'
          }
        ],
        insights: [
          `Current cash position: $${currentCash.toLocaleString()}`,
          `Pending invoices: $${pendingInvoices.totalAmount.toLocaleString()}`,
          `Average collection days: ${averageCollectionDays} days`
        ],
        keyMetrics: {
          collectionRate: totalRevenue > 0 ? ((totalRevenue / (totalRevenue + pendingInvoices.totalAmount)) * 100).toFixed(1) : 0,
          averagePaymentDelay: averageCollectionDays,
          expenseToRevenueRatio: totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(1) : 0,
          payrollToRevenueRatio: totalRevenue > 0 ? ((totalPayroll / totalRevenue) * 100).toFixed(1) : 0,
          cashConversionCycle: averageCollectionDays + 7
        },
        reasoning: 'Fallback analysis: Unable to parse AI response. Calculations based on available data.'
      }
    };
  }
};

/**
 * Analyze bulk payroll for all employees at once using AI
 * @param {Array} employeePayrollData - Array of employee payroll data
 * @param {object} options - Options including startDate, endDate, companyName
 * @returns {Promise<object>} AI analysis with recommendations for all employees
 */
export const analyzeBulkPayrollWithAI = async (employeePayrollData, options = {}) => {
  const { startDate, endDate, companyName = 'Company' } = options;

  // Prepare summary data for AI
  const summaryData = employeePayrollData.map(emp => {
    const totalDays = emp.presentDays + emp.absentDays + emp.leaveDays + emp.lateDays;
    const attendanceScore = totalDays > 0
      ? ((emp.presentDays + emp.leaveDays) / totalDays) * 100
      : 0;

    return {
      name: emp.employeeName,
      role: emp.role,
      baseSalary: emp.baseSalary,
      hourlyRate: emp.hourlyRate,
      attendance: {
        present: emp.presentDays,
        absent: emp.absentDays,
        leave: emp.leaveDays,
        late: emp.lateDays,
        totalHours: emp.totalHours,
        score: Math.round(attendanceScore)
      }
    };
  });

  const prompt = `Analyze payroll data for ${employeePayrollData.length} employees and provide recommendations:

Company: ${companyName}
Pay Period: ${startDate} to ${endDate}

Employee Data:
${JSON.stringify(summaryData, null, 2)}

Provide a JSON response with the following structure:
{
  "recommendations": [
    {
      "employeeIndex": number (0-based index),
      "recommendedBonus": number,
      "recommendedDeductions": number,
      "attendanceScore": number (0-100),
      "recommendations": string[],
      "notes": string
    }
  ],
  "insights": string[] (key insights about overall payroll),
  "summary": {
    "totalEmployees": number,
    "averageAttendanceScore": number,
    "totalAbsentDays": number,
    "totalLeaveDays": number,
    "recommendations": string[] (general recommendations)
  }
}

Calculation Guidelines:
- Bonus: 2-5% of base salary for attendance score ≥95%, 5-10% for ≥98%
- Deductions: Absent days × (baseSalary / 30) for salary employees
- For hourly employees: Calculate based on hours worked (regular + overtime at 1.5x)
- Late arrivals: Consider small deductions (5-10% of daily rate) or warnings
- Leave days: Usually no deduction if approved

Provide fair and realistic recommendations based on actual attendance data.`;

  const result = await callOpenAI(prompt, {
    model: 'gpt-4o-mini',
    responseFormat: { type: 'json_object' },
    temperature: 0.2,
    maxTokens: 4000 // More tokens for bulk analysis
  });

  if (!result.success) {
    // Fallback: Generate recommendations without AI
    const recommendations = employeePayrollData.map((emp, index) => {
      const totalDays = emp.presentDays + emp.absentDays + emp.leaveDays + emp.lateDays;
      const attendanceScore = totalDays > 0
        ? ((emp.presentDays + emp.leaveDays) / totalDays) * 100
        : 0;
      const dailyRate = emp.baseSalary / 30;

      return {
        employeeIndex: index,
        recommendedBonus: attendanceScore >= 95 ? emp.baseSalary * 0.05 : 0,
        recommendedDeductions: emp.absentDays * dailyRate,
        attendanceScore: Math.round(attendanceScore),
        recommendations: [
          attendanceScore >= 95 ? 'Excellent attendance. Consider bonus.' : '',
          emp.absentDays > 0 ? `${emp.absentDays} absent day(s) will result in deductions.` : '',
          emp.lateDays > 0 ? `${emp.lateDays} late arrival(s) noted.` : ''
        ].filter(Boolean),
        notes: `Attendance: ${emp.presentDays} present, ${emp.absentDays} absent, ${emp.leaveDays} leave, ${emp.lateDays} late. Total hours: ${emp.totalHours.toFixed(2)}`
      };
    });

    const avgAttendance = recommendations.reduce((sum, r) => sum + r.attendanceScore, 0) / recommendations.length;
    const totalAbsentDays = employeePayrollData.reduce((sum, emp) => sum + emp.absentDays, 0);
    const totalLeaveDays = employeePayrollData.reduce((sum, emp) => sum + emp.leaveDays, 0);

    return {
      success: true,
      recommendations,
      insights: [
        `Average attendance score: ${Math.round(avgAttendance)}%`,
        `Total absent days across all employees: ${totalAbsentDays}`,
        `Total leave days: ${totalLeaveDays}`
      ]
    };
  }

  try {
    const parsedData = JSON.parse(result.data);
    return {
      success: true,
      recommendations: parsedData.recommendations || [],
      insights: parsedData.insights || [],
      summary: parsedData.summary || {}
    };
  } catch (parseError) {
    console.error('Error parsing bulk AI response:', parseError);
    // Return fallback
    return analyzeBulkPayrollWithAI(employeePayrollData, options);
  }
};

/**
 * Extract order data from text or document content using GPT-4.1
 * @param {string} content - Text content or extracted text from document
 * @returns {Promise<object>} Extracted order data
 */
export const extractOrderData = async (content) => {
  try {
    const systemPrompt = `You are an expert logistics order entry assistant. Extract order information from the provided text/document and return it in a structured JSON format. Be accurate and precise. If a field is not found in the content, return null for that field.`;

    const userPrompt = `Extract order information from the following content and return it as a JSON object:

${content}

Return a JSON object with the following structure (use null for missing fields):
{
  "customerOrderNo": string | null,
  "orderType": "FTL" | "LTL" | "Regular" | "Express" | null,
  "freightOn": "Order" | "Item" | null,
  "salesman": string | null,
  "orderNotes": string | null,
  "pickupDate": string | null (format: YYYY-MM-DD),
  "pickupTime": string | null (format: HH:MM),
  "pickupAppointment": boolean | null,
  "pickupNote": string | null,
  "deliveryDate": string | null (format: YYYY-MM-DD),
  "deliveryTime": string | null (format: HH:MM),
  "deliveryAppointment": boolean | null,
  "deliveryNote": string | null,
  "commodity": string | null,
  "valueOfGoods": number | null,
  "valueOfGoodsCurrency": "CAD" | "USD" | "INR" | null,
  "equipment": string[] | null,
  "noOfPackages": number | null,
  "noOfPackagesType": string | null,
  "weight": number | null,
  "weightUnit": "kg" | "lbs" | "tons" | null,
  "temperature": number | null,
  "temperatureUnit": "Celsius" | "Fahrenheit" | null,
  "dimensions": {
    "length": number | null,
    "width": number | null,
    "height": number | null,
    "unit": "cm" | "inch" | "m" | "ft" | null
  },
  "distance": number | null,
  "additionalInfo": {
    "CSA": boolean | null,
    "CTPAT": boolean | null,
    "PIP": boolean | null,
    "HAZMAT": boolean | null,
    "TARP": boolean | null,
    "OverDimension": boolean | null
  },
  "shipperName": string | null,
  "shipperPhone": string | null,
  "shipperEmail": string | null,
  "receiverName": string | null,
  "receiverPhone": string | null,
  "receiverAddress": string | null,
  "pickupAppointmentType": "FCFS" | "Window" | "Strict Time" | null,
  "pickupAppointmentDate": string | null (format: YYYY-MM-DD),
  "pickupAppointmentTime": string | null (format: HH:MM),
  "pickupSpecialInstructions": string | null,
  "pickupGatePass": string | null,
  "deliveryAppointmentType": "Window" | "Strict Time" | null,
  "deliveryAppointmentDate": string | null (format: YYYY-MM-DD),
  "deliveryAppointmentTime": string | null (format: HH:MM),
  "deliveryUnloadingInstructions": string | null
}

Guidelines:
- Extract dates in YYYY-MM-DD format
- Extract times in HH:MM format (24-hour)
- Convert all weights to numbers
- Extract equipment types (Dry Van, Refrigerated, Flatbed, etc.)
- Identify special requirements (HAZMAT, TARP, OverDimension, etc.)
- Extract shipper and receiver information if available (but NOT addresses)
- Do NOT extract pickup/delivery locations, customer information, or reference numbers`;

    const result = await callOpenAI(userPrompt, {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 3000,
      responseFormat: { type: 'json_object' }
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to extract order data',
        data: null
      };
    }

    try {
      const extractedData = typeof result.data === 'string'
        ? JSON.parse(result.data)
        : result.data;

      return {
        success: true,
        data: extractedData,
        usage: result.usage
      };
    } catch (parseError) {
      console.error('Error parsing order extraction response:', parseError);
      return {
        success: false,
        error: 'Failed to parse extracted data',
        data: null
      };
    }
  } catch (error) {
    console.error('Error in extractOrderData:', error);
    return {
      success: false,
      error: error.message || 'Failed to extract order data',
      data: null
    };
  }
};

/**
 * Extract expense data from receipt image/PDF using OpenAI Vision API
 * @param {Buffer} fileBuffer - File buffer (image or PDF)
 * @param {string} mimeType - MIME type of the file (e.g., 'image/jpeg', 'application/pdf')
 * @returns {Promise<object>} Extracted expense data
 */
export const extractExpenseFromReceipt = async (fileBuffer, mimeType) => {
  try {
    const apiKey = getOpenAIKey();

    // Convert file buffer to base64
    const base64Image = fileBuffer.toString('base64');

    // Determine if it's an image or PDF
    const isImage = mimeType.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';

    if (!isImage && !isPDF) {
      return {
        success: false,
        error: 'Unsupported file type. Please upload an image (JPEG, PNG, etc.) or PDF.',
        data: null
      };
    }

    // For PDFs, we'll need to use a different approach or convert to image first
    // For now, we'll handle images and note that PDF support may require additional processing
    if (isPDF) {
      // Note: OpenAI Vision API doesn't directly support PDFs
      // You might need to convert PDF to images first or use a different approach
      return {
        success: false,
        error: 'PDF extraction requires conversion to images first. Please upload an image file.',
        data: null
      };
    }

    const systemPrompt = `You are an expert expense receipt analyzer. Extract all relevant information from the receipt image and return it in a structured JSON format. Be accurate and precise. If a field is not found in the receipt, return null for that field.`;

    const userPrompt = `Analyze this receipt image and extract all expense information. Return a JSON object with the following structure (use null for missing fields):

{
  "amount": number | null (total amount as a number, without currency symbol),
  "date": string | null (date in YYYY-MM-DD format),
  "description": string | null (description of the expense, what was purchased),
  "vendor": string | null (merchant/store name),
  "type": string | null (expense type/category like "Fuel", "Meals", "Office Supplies", "Travel", "Maintenance", etc.),
  "currency": string | null (currency code like "USD", "CAD", etc.),
  "tax": number | null (tax amount if shown),
  "subtotal": number | null (subtotal before tax if shown),
  "receiptNumber": string | null (receipt/invoice number if visible),
  "items": array | null (array of line items if detailed receipt, each with "name", "quantity", "price"),
  "notes": string | null (any additional notes or special information from the receipt)
}

Guidelines:
- Extract the total amount as a number (remove currency symbols and commas)
- Extract the date and convert to YYYY-MM-DD format
- Try to identify the expense type/category based on the merchant and items
- If multiple items are listed, include them in the items array
- Be precise with numbers and dates`;

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'gpt-4o', // Use vision-capable model
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 seconds timeout for image processing
      }
    );

    const extractedData = response.data.choices[0]?.message?.content;

    if (!extractedData) {
      return {
        success: false,
        error: 'No data extracted from receipt',
        data: null
      };
    }

    try {
      const parsedData = typeof extractedData === 'string'
        ? JSON.parse(extractedData)
        : extractedData;

      return {
        success: true,
        data: parsedData,
        usage: response.data.usage
      };
    } catch (parseError) {
      console.error('Error parsing expense extraction response:', parseError);
      return {
        success: false,
        error: 'Failed to parse extracted data',
        data: null
      };
    }
  } catch (error) {
    console.error('Error in extractExpenseFromReceipt:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to extract expense data',
      data: null
    };
  }
};

/**
 * Extract fuel receipt data from image/PDF using OpenAI Vision API
 * @param {Buffer} fileBuffer - File buffer (image or PDF)
 * @param {string} mimeType - MIME type of the file (e.g., 'image/jpeg', 'application/pdf')
 * @returns {Promise<object>} Extracted fuel receipt data
 */
export const extractFuelReceiptData = async (fileBuffer, mimeType) => {
  try {
    const apiKey = getOpenAIKey();

    // Determine if it's an image or PDF
    const isImage = mimeType.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';

    if (!isImage && !isPDF) {
      return {
        success: false,
        error: 'Unsupported file type. Please upload an image (JPEG, PNG, etc.) or PDF.',
        data: null
      };
    }

    // Convert PDF to images if needed
    let imageBuffers = [fileBuffer];
    let finalMimeType = mimeType;
    
    if (isPDF) {
      try {
        console.log('📄 Converting PDF to images for fuel receipt extraction...');
        imageBuffers = await convertPdfBufferToImages(fileBuffer);
        finalMimeType = 'image/png';
        console.log(`✅ PDF converted successfully: ${imageBuffers.length} page(s)`);
      } catch (conversionError) {
        console.error('❌ Error converting PDF to images:', conversionError);
        return {
          success: false,
          error: 'Failed to convert PDF to image. Please try uploading an image file instead.',
          data: null
        };
      }
    }

    // Process first page/image (most fuel receipts are single page)
    const base64Image = imageBuffers[0].toString('base64');

    const systemPrompt = `You are an expert fuel receipt analyzer. Extract all relevant information from the fuel receipt image and return it in a structured JSON format. Be accurate and precise. If a field is not found in the receipt, return null for that field.`;

    const userPrompt = `Analyze this fuel receipt image and extract all fuel purchase information. Return a JSON object with the following structure (use null for missing fields):

{
  "transactionAmount": number | null (total amount paid as a number, without currency symbol),
  "fuelAmount": number | null (gallons or liters purchased as a number),
  "date": string | null (date in YYYY-MM-DD format),
  "fuelVendor": string | null (gas station/vendor name like "Shell", "Flying J", "Petro-Canada", etc.),
  "transactionNumber": string | null (receipt/invoice/transaction number if visible),
  "product": string | null (fuel type like "Diesel", "Truck Diesel", "Reefer Diesel", "DEF", "Gasoline", etc.),
  "pricePerUnit": number | null (price per gallon/liter if shown),
  "currency": string | null (currency code like "USD", "CAD", etc.),
  "location": {
    "address": string | null (full address if visible),
    "city": string | null (city name),
    "state": string | null (state/province name),
    "postalCode": string | null (postal/zip code)
  },
  "odometer": string | null (odometer reading if shown),
  "paymentMethod": string | null (payment method if visible),
  "notes": string | null (any additional notes or special information from the receipt)
}

Guidelines:
- Extract the total transaction amount as a number (remove currency symbols and commas)
- Extract the fuel amount (gallons or liters) as a number
- Extract the date and convert to YYYY-MM-DD format
- Identify the fuel vendor/store name accurately
- Extract transaction/receipt number if visible
- Identify fuel type/product (Diesel, DEF, etc.)
- Extract location information if available on receipt
- Extract odometer reading if shown
- Be precise with numbers and dates`;

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${finalMimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.2,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const extractedData = response.data.choices[0]?.message?.content;

    if (!extractedData) {
      return {
        success: false,
        error: 'No data extracted from fuel receipt',
        data: null
      };
    }

    try {
      const parsedData = typeof extractedData === 'string'
        ? JSON.parse(extractedData)
        : extractedData;

      return {
        success: true,
        data: parsedData,
        usage: response.data.usage
      };
    } catch (parseError) {
      console.error('Error parsing fuel receipt extraction response:', parseError);
      return {
        success: false,
        error: 'Failed to parse extracted data',
        data: null
      };
    }
  } catch (error) {
    console.error('Error in extractFuelReceiptData:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to extract fuel receipt data',
      data: null
    };
  }
};

/**
 * Convert PDF buffer to multiple image buffers (all pages) for OpenAI Vision API
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Buffer[]>} Array of PNG image buffers (one per page)
 */
const convertPdfBufferToImages = async (pdfBuffer) => {
  let tempPdfPath = null;
  const imageBuffers = [];
  
  try {
    console.log('🔄 Converting PDF buffer to images (all pages)...');
    
    // Create temporary PDF file
    const tempDir = os.tmpdir();
    tempPdfPath = path.join(tempDir, `carrier-profile-${Date.now()}.pdf`);
    await fsPromises.writeFile(tempPdfPath, pdfBuffer);
    
    // Polyfill Promise methods for Node.js < 22 (required by pdfjs-dist 5.x)
    if (typeof Promise.withResolvers !== 'function') {
      Promise.withResolvers = function() {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      };
    }
    
    // Polyfill Promise.try (used by pdfjs-dist worker)
    if (typeof Promise.try !== 'function') {
      Promise.try = function(fn) {
        try {
          return Promise.resolve(fn());
        } catch (e) {
          return Promise.reject(e);
        }
      };
    }
    
    // Add browser polyfills for Node.js environment (required for pdfjs-dist 5.x)
    if (typeof global !== 'undefined') {
      // Polyfill DOMMatrix (required by pdfjs-dist 5.x)
      if (!global.DOMMatrix) {
        try {
          const { DOMMatrix, DOMMatrixReadOnly } = await import('@napi-rs/canvas');
          global.DOMMatrix = DOMMatrix;
          global.DOMMatrixReadOnly = DOMMatrixReadOnly;
        } catch (e) {
          // If @napi-rs/canvas doesn't have DOMMatrix, create a simple polyfill
          class DOMMatrixPolyfill {
            constructor(init) {
              if (typeof init === 'string') {
                const values = init.match(/matrix\(([^)]+)\)/)?.[1]?.split(/\s*,\s*/).map(Number) || [];
                this.a = values[0] || 1;
                this.b = values[1] || 0;
                this.c = values[2] || 0;
                this.d = values[3] || 1;
                this.e = values[4] || 0;
                this.f = values[5] || 0;
              } else {
                this.a = init?.a ?? 1;
                this.b = init?.b ?? 0;
                this.c = init?.c ?? 0;
                this.d = init?.d ?? 1;
                this.e = init?.e ?? 0;
                this.f = init?.f ?? 0;
              }
            }
            multiply(other) {
              return new DOMMatrixPolyfill({
                a: this.a * other.a + this.c * other.b,
                b: this.b * other.a + this.d * other.b,
                c: this.a * other.c + this.c * other.d,
                d: this.b * other.c + this.d * other.d,
                e: this.a * other.e + this.c * other.f + this.e,
                f: this.b * other.e + this.d * other.f + this.f
              });
            }
            translate(x, y) {
              return this.multiply(new DOMMatrixPolyfill({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }));
            }
            scale(x, y) {
              return this.multiply(new DOMMatrixPolyfill({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }));
            }
          }
          global.DOMMatrix = DOMMatrixPolyfill;
          global.DOMMatrixReadOnly = DOMMatrixPolyfill;
        }
      }
      
      // Polyfill other DOM APIs if needed
      if (!global.DOMRect) {
        global.DOMRect = class DOMRect {
          constructor(x = 0, y = 0, width = 0, height = 0) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.top = y;
            this.right = x + width;
            this.bottom = y + height;
            this.left = x;
          }
        };
      }
    }
    
    // Import pdfjs-dist to get page count and convert all pages
    const canvasModule = await import('canvas');
    const { createCanvas, Image } = canvasModule;
    
    // Polyfill Path2D for Node.js (required by pdfjs-dist)
    // The canvas library should provide Path2D, but we need to make sure it's available globally
    if (typeof global !== 'undefined' && !global.Path2D) {
      let Path2DFound = false;
      
      // Check if canvas module provides Path2D directly
      if (canvasModule.Path2D) {
        global.Path2D = canvasModule.Path2D;
        Path2DFound = true;
        console.log('✅ Using Path2D from canvas module');
      } else {
        // Try to get Path2D from a canvas instance's context
        try {
          const testCanvas = createCanvas(1, 1);
          const testCtx = testCanvas.getContext('2d');
          
          // Check various possible locations for Path2D
          if (testCtx && testCtx.constructor && testCtx.constructor.Path2D) {
            global.Path2D = testCtx.constructor.Path2D;
            Path2DFound = true;
            console.log('✅ Using Path2D from canvas context constructor');
          } else if (testCtx && testCtx.Path2D) {
            global.Path2D = testCtx.Path2D;
            Path2DFound = true;
            console.log('✅ Using Path2D from canvas context');
          } else if (testCanvas.constructor && testCanvas.constructor.Path2D) {
            global.Path2D = testCanvas.constructor.Path2D;
            Path2DFound = true;
            console.log('✅ Using Path2D from canvas constructor');
          }
        } catch (e) {
          console.log('⚠️ Could not find Path2D in canvas:', e.message);
        }
      }
      
      // If Path2D still not found, create polyfill
      if (!Path2DFound) {
        // Create a simple Path2D polyfill
        console.log('⚠️ Creating Path2D polyfill');
        global.Path2D = class Path2D {
          constructor(path) {
            this._commands = [];
            if (path instanceof Path2D) {
              this._commands = [...path._commands];
            } else if (typeof path === 'string') {
              // SVG path string - simplified parser
              this._commands.push({ type: 'svg', data: path });
            }
          }
          
          addPath(path, transform) {
            if (path instanceof Path2D) {
              this._commands.push({ type: 'addPath', path: path._commands, transform });
            }
          }
          
          arc(x, y, radius, startAngle, endAngle, anticlockwise) {
            this._commands.push({ type: 'arc', x, y, radius, startAngle, endAngle, anticlockwise });
          }
          
          arcTo(x1, y1, x2, y2, radius) {
            this._commands.push({ type: 'arcTo', x1, y1, x2, y2, radius });
          }
          
          bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
            this._commands.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
          }
          
          closePath() {
            this._commands.push({ type: 'closePath' });
          }
          
          ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise) {
            this._commands.push({ type: 'ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise });
          }
          
          lineTo(x, y) {
            this._commands.push({ type: 'lineTo', x, y });
          }
          
          moveTo(x, y) {
            this._commands.push({ type: 'moveTo', x, y });
          }
          
          quadraticCurveTo(cpx, cpy, x, y) {
            this._commands.push({ type: 'quadraticCurveTo', cpx, cpy, x, y });
          }
          
          rect(x, y, width, height) {
            this._commands.push({ type: 'rect', x, y, width, height });
          }
          
          // Apply path to a canvas context
          _applyToContext(ctx) {
            for (const cmd of this._commands) {
              switch (cmd.type) {
                case 'moveTo':
                  ctx.moveTo(cmd.x, cmd.y);
                  break;
                case 'lineTo':
                  ctx.lineTo(cmd.x, cmd.y);
                  break;
                case 'arc':
                  ctx.arc(cmd.x, cmd.y, cmd.radius, cmd.startAngle, cmd.endAngle, cmd.anticlockwise);
                  break;
                case 'arcTo':
                  ctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.radius);
                  break;
                case 'bezierCurveTo':
                  ctx.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
                  break;
                case 'quadraticCurveTo':
                  ctx.quadraticCurveTo(cmd.cpx, cmd.cpy, cmd.x, cmd.y);
                  break;
                case 'rect':
                  ctx.rect(cmd.x, cmd.y, cmd.width, cmd.height);
                  break;
                case 'ellipse':
                  ctx.ellipse(cmd.x, cmd.y, cmd.radiusX, cmd.radiusY, cmd.rotation, cmd.startAngle, cmd.endAngle, cmd.anticlockwise);
                  break;
                case 'closePath':
                  ctx.closePath();
                  break;
                case 'addPath':
                  ctx.save();
                  if (cmd.transform) {
                    ctx.transform(cmd.transform.a, cmd.transform.b, cmd.transform.c, cmd.transform.d, cmd.transform.e, cmd.transform.f);
                  }
                  // Recursively apply path commands
                  const tempPath = new Path2D();
                  tempPath._commands = cmd.path;
                  tempPath._applyToContext(ctx);
                  ctx.restore();
                  break;
                case 'svg':
                  // For SVG paths, try to parse and apply (simplified)
                  try {
                    ctx.beginPath();
                    // Basic SVG path parsing - simplified
                    const svgPath = cmd.data;
                    const commands = svgPath.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];
                    for (const svgCmd of commands) {
                      const type = svgCmd[0];
                      const coords = svgCmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
                      switch (type) {
                        case 'M':
                          ctx.moveTo(coords[0], coords[1]);
                          break;
                        case 'L':
                          ctx.lineTo(coords[0], coords[1]);
                          break;
                        case 'Z':
                        case 'z':
                          ctx.closePath();
                          break;
                      }
                    }
                  } catch (e) {
                    console.warn('Failed to parse SVG path:', e);
                  }
                  break;
              }
            }
          }
        };
      }
    }
    
    // Import pdfjs-dist - USE LEGACY BUILD for Node.js (as recommended by pdfjs-dist)
    let pdfjsLib;
    try {
      // Use legacy build first (recommended for Node.js environments)
      const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjsLib = pdfjsModule.default || pdfjsModule;
      console.log('✅ Using pdfjs-dist legacy build for Node.js');
    } catch (e1) {
      console.error('Error importing pdfjs-dist legacy build:', e1.message);
      try {
        // Fallback to main module
        const pdfjsModule = await import('pdfjs-dist');
        pdfjsLib = pdfjsModule.default || pdfjsModule;
        
        // Check if getDocument exists
        if (!pdfjsLib.getDocument) {
          if (pdfjsModule.getDocument) {
            pdfjsLib = pdfjsModule;
          } else {
            const { getDocument } = pdfjsModule;
            if (getDocument) {
              pdfjsLib = { getDocument, ...pdfjsModule };
            }
          }
        }
        console.log('⚠️ Using pdfjs-dist main build (legacy recommended)');
      } catch (e2) {
        console.error('Error importing pdfjs-dist main module:', e2.message);
        throw new Error(`pdfjs-dist library not found or cannot be imported. Please ensure pdfjs-dist is installed: npm install pdfjs-dist. Errors: ${e1.message}, ${e2.message}`);
      }
    }

    if (!pdfjsLib || !pdfjsLib.getDocument) {
      console.error('pdfjsLib structure:', Object.keys(pdfjsLib || {}));
      console.error('pdfjsLib type:', typeof pdfjsLib);
      throw new Error('pdfjs-dist library not properly loaded - getDocument method not found. Available methods: ' + Object.keys(pdfjsLib || {}).join(', '));
    }
    
    if (typeof global !== 'undefined' && !global.Image) {
      global.Image = Image;
    }

    const pdfData = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ 
      data: pdfData,
      verbosity: 0,
      canvasFactory: {
        create: (width, height) => {
          const canvas = createCanvas(width, height);
          return { canvas, context: canvas.getContext('2d') };
        },
        reset: (canvasAndContext, width, height) => {
          canvasAndContext.canvas.width = width;
          canvasAndContext.canvas.height = height;
        },
        destroy: (canvasAndContext) => {
          canvasAndContext.canvas.width = 0;
          canvasAndContext.canvas.height = 0;
        }
      }
    });
    
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    console.log(`📄 PDF has ${numPages} page(s), converting all pages...`);
    
    const scale = 2.0; // High quality
    
    // Convert each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      const buffer = canvas.toBuffer('image/png');
      imageBuffers.push(buffer);
      console.log(`✅ Converted page ${pageNum}/${numPages} (${buffer.length} bytes)`);
    }
    
    console.log(`✅ Successfully converted ${numPages} page(s) to images`);
    return imageBuffers;
  } catch (error) {
    console.error('❌ Error converting PDF to images:', error);
    // Fallback: try single page conversion
    console.log('🔄 Falling back to single page conversion...');
    try {
      const singleImage = await convertPdfBufferToImage(pdfBuffer);
      return [singleImage];
    } catch (fallbackError) {
      throw error; // Throw original error
    }
  } finally {
    // Clean up temp PDF file
    if (tempPdfPath) {
      try {
        if (fs.existsSync(tempPdfPath)) {
          await fsPromises.unlink(tempPdfPath);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up temp PDF file:', cleanupError);
      }
    }
  }
};

/**
 * Convert PDF buffer to image buffer (first page only)
 * Uses the existing convertPdfToImage function from documentValidationService
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Buffer>} PNG image buffer
 */
const convertPdfBufferToImage = async (pdfBuffer) => {
  let tempPdfPath = null;
  let tempImagePath = null;
  
  try {
    console.log('🔄 Converting PDF buffer to image...');
    
    // Create temporary directory for PDF conversion
    const tempDir = path.join(os.tmpdir(), 'pdf-conversions');
    await fsPromises.mkdir(tempDir, { recursive: true });
    
    // Write PDF buffer to temporary file
    tempPdfPath = path.join(tempDir, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`);
    await fsPromises.writeFile(tempPdfPath, pdfBuffer);
    console.log(`📄 PDF written to temp file: ${tempPdfPath}`);
    
    // Use the existing convertPdfToImage function from documentValidationService
    // This function converts PDF to image and returns the image file path
    tempImagePath = await convertPdfToImage(tempPdfPath);
    console.log(`📸 PDF converted to image: ${tempImagePath}`);
    
    // Read the converted image file as buffer
    const imageBuffer = await fsPromises.readFile(tempImagePath);
    
    console.log(`✅ PDF converted to image buffer (${imageBuffer.length} bytes)`);
    
    // Clean up temp files
    try {
      if (tempPdfPath && fs.existsSync(tempPdfPath)) {
        await fsPromises.unlink(tempPdfPath);
      }
      if (tempImagePath && fs.existsSync(tempImagePath)) {
        await fsPromises.unlink(tempImagePath);
      }
    } catch (cleanupError) {
      console.warn('⚠️ Warning: Could not clean up temp files:', cleanupError.message);
    }
    
    return imageBuffer;
  } catch (error) {
    // Clean up temp files on error
    try {
      if (tempPdfPath && fs.existsSync(tempPdfPath)) {
        await fsPromises.unlink(tempPdfPath);
      }
      if (tempImagePath && fs.existsSync(tempImagePath)) {
        await fsPromises.unlink(tempImagePath);
      }
    } catch (cleanupError) {
      console.warn('⚠️ Warning: Could not clean up temp files after error:', cleanupError.message);
    }
    
    console.error('❌ Error converting PDF to image:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    // Provide helpful error message
    const errorMsg = error.message || 'Unknown error';
    if (errorMsg.includes('Image or Canvas expected')) {
      throw new Error('PDF conversion failed due to compatibility issues with embedded images in this PDF. Please convert the PDF to an image (PNG or JPEG) and upload the image file instead.');
    }
    
    throw new Error(`Failed to convert PDF to image: ${errorMsg}`);
  }
};

/**
 * Extract carrier profile inspection data from document using OpenAI Vision API
 * @param {Buffer} fileBuffer - File buffer (image or PDF converted to image)
 * @param {string} mimeType - MIME type of the file (e.g., 'image/jpeg', 'application/pdf')
 * @returns {Promise<object>} Extracted carrier profile data
 */
export const extractCarrierProfileData = async (fileBuffer, mimeType) => {
  try {
    const apiKey = getOpenAIKey();

    // Determine if it's an image or PDF
    const isImage = mimeType.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';

    if (!isImage && !isPDF) {
      return {
        success: false,
        error: 'Unsupported file type. Please upload an image (JPEG, PNG, etc.) or PDF.',
        data: null
      };
    }

    // Convert PDF to images if needed (all pages for carrier profiles)
    let imageBuffers = [fileBuffer]; // For images, use single buffer
    let finalMimeType = mimeType;
    
    if (isPDF) {
      try {
        console.log('📄 Converting PDF to images for AI processing (all pages)...');
        imageBuffers = await convertPdfBufferToImages(fileBuffer); // Convert all pages
        finalMimeType = 'image/png'; // Converted PDFs are PNG images
        console.log(`✅ PDF converted successfully: ${imageBuffers.length} page(s)`);
      } catch (conversionError) {
        console.error('❌ PDF conversion failed:', conversionError);
        // Provide helpful error message
        const errorMsg = conversionError.message || 'Unknown error';
        if (errorMsg.includes('Image or Canvas expected')) {
          return {
            success: false,
            error: 'PDF conversion failed due to compatibility issues with this PDF file. Please convert the PDF to an image (PNG or JPEG) and upload the image file instead. You can use online tools or screenshot the PDF pages.',
            data: null
          };
        }
        
        // Check if it's an ImageMagick installation issue
        if (errorMsg.includes('ImageMagick') || errorMsg.includes('GraphicsMagick') || errorMsg.includes('convert') || errorMsg.includes('spawn') || errorMsg.includes('Failed to convert')) {
          return {
            success: false,
            error: `PDF conversion requires ImageMagick or GraphicsMagick to be installed on the server. 

To fix this:
1. Install ImageMagick on your server (Windows: https://imagemagick.org/script/download.php)
2. OR convert the PDF to an image file (PNG/JPEG) using any PDF viewer or online tool, then upload the image file instead.

The system administrator needs to install ImageMagick for PDF conversion to work automatically.`,
            data: null
          };
        }
        
        return {
          success: false,
          error: `Failed to convert PDF to image: ${errorMsg}. Please try uploading an image file (PNG or JPEG) instead, or convert the PDF to an image first using a PDF viewer or online conversion tool.`,
          data: null
        };
      }
    }

    // Convert image buffers to base64
    const base64Images = imageBuffers.map(buffer => buffer.toString('base64'));

    const systemPrompt = `You are an expert compliance analyst specializing in CVSA (Commercial Vehicle Safety Alliance) inspections and carrier profile documents. Your task is to analyze government-issued carrier safety profile documents and extract structured inspection data. These are official compliance documents that contain inspection records, statistics, and safety ratings for commercial vehicle carriers. Extract all inspection data from these documents, including inspection counts, pass/fail statistics, out-of-service records, and other compliance metrics. Return data in a structured JSON format. This is a legitimate business compliance task.`;

    const userPrompt = `Analyze this carrier profile document${imageBuffers.length > 1 ? ` (${imageBuffers.length} pages)` : ''} and extract all CVSA inspection data. Return a JSON object with the following structure (use null for missing fields):

{
  "inspections": [
    {
      "inspectionId": string | null,
      "date": string | null (format: YYYY-MM-DD),
      "month": string | null (e.g., "January", "February"),
      "year": number | null,
      "country": "canada" | "usa" | null,
      "province": string | null (e.g., "MB", "BC", "ON", "AB", "SK" for Canada - extract from "Prov. State" column),
      "state": string | null (e.g., "CA", "TX", "NY" for USA - extract from "Prov. State" column),
      "location": string | null,
      "status": "pass" | "fail" | "warning" | "out-of-service" | null (map "Result" column: Pass=pass, Fail=fail, OOS=out-of-service),
      "inspectionType": "level-1" | "level-2" | "level-3" | "level-4" | "level-5" | "level-6" | null (map "Level" column: 1=level-1, 2=level-2, etc.),
      "reportNumber": string | null (extract from "Report #" column),
      "inspectorName": string | null,
      "vehicleUnitNo": string | null (extract from "Power Unit Plate" column),
      "driverName": string | null (extract from "Driver Name" column),
      "driverLicenseNumber": string | null,
      "violations": [
        {
          "code": string | null,
          "description": string | null,
          "severity": "minor" | "major" | "critical" | null
        }
      ],
      "notes": string | null
    }
  ],
  "summary": {
    "totalInspections": number | null,
    "totalPass": number | null,
    "totalFail": number | null,
    "totalWarning": number | null,
    "totalOutOfService": number | null,
    "canadaInspections": number | null,
    "usaInspections": number | null,
    "period": string | null (e.g., "January 2024", "Q1 2024", "2024")
  }
}

Guidelines:
- CRITICAL PRIORITY: The document likely contains an inspection table with columns like "Report #", "Level", "Prov. State", "Inspection Location", "Inspection Date", "Power Unit Plate", "Driver Name", "Result"
- YOU MUST extract EVERY ROW from this table as an individual inspection record
- DO NOT leave the inspections array empty if you see a table of inspections - extract ALL rows
- Each row in the inspection table should become one object in the inspections array
- Look for sections titled "Carrier Inspections" or similar - these contain the inspection table
- The table may span multiple pages - extract ALL inspections from ALL pages
- Example: If you see a table with 33 rows, the inspections array should have 33 objects
- Extract summary statistics (total pass, fail, warning, OOS counts) from summary sections
- CRITICAL: Always identify and extract country information (Canada or USA) for each inspection and in summary
- Identify country (Canada or USA) based on:
  * Province/State codes in "Prov. State" column: MB, BC, ON, AB, SK, QC, NS, NB, NL, PE, YT, NT, NU = Canada; AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, etc. = USA
  * Inspection report numbers (e.g., MBE25-xxx = Manitoba/Canada, ONEA-xxx = Ontario/Canada, AB29xxx = Alberta/Canada)
  * Location names (Canadian provinces/cities vs US states/cities)
  * Explicit country labels in the document
  * Jurisdiction codes (CBSA for Canada, DOT/CVS for USA)
  * Document headers or section labels
- IMPORTANT: Always extract canadaInspections and usaInspections counts:
  * Count individual inspections by province/state codes (MB, BC, ON, AB, SK, etc. = Canada; US state codes = USA)
  * Look for explicit country breakdowns in summary sections
  * If you extract individual inspections, count them: canadaInspections = count of inspections with Canadian province codes, usaInspections = count of inspections with US state codes
  * If only summary totals are shown without breakdown, count from individual inspection records you extracted
- For individual inspections from tables:
  * Extract "Report #" as reportNumber
  * Extract "Level" as inspectionType (1=level-1, 2=level-2, 3=level-3, 4=level-4, 5=level-5, 6=level-6)
  * Extract "Prov. State" as province (if Canadian) or state (if US)
  * Extract "Inspection Location" as location
  * Extract "Inspection Date" as date (convert to YYYY-MM-DD format)
  * Extract "Result" as status (Pass=pass, Fail=fail, OOS=out-of-service)
  * Extract "Power Unit Plate" as vehicleUnitNo
  * Extract "Driver Name" as driverName
- Extract dates in YYYY-MM-DD format (convert from formats like "30/Dec/2025" or "30-Dec-2025")
- Extract month names as full month names (January, February, etc.)
- Be precise with numbers and dates
- If the document shows monthly data, extract each month's statistics separately`;

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'gpt-4o', // Use vision-capable model
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt
              },
              // Add all pages as images
              ...base64Images.map(base64Image => ({
                type: 'image_url',
                image_url: {
                  url: `data:${finalMimeType};base64,${base64Image}`
                }
              }))
            ]
          }
        ],
        max_tokens: 8000, // Increased for multi-page documents
        temperature: 0.1, // Lower temperature for more consistent extraction
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000 // 90 seconds timeout for document processing
      }
    );

    // Log the full response for debugging
    console.log('📥 OpenAI API Response:', {
      hasData: !!response.data,
      hasChoices: !!response.data?.choices,
      choicesLength: response.data?.choices?.length,
      firstChoice: response.data?.choices?.[0] ? {
        hasMessage: !!response.data.choices[0].message,
        hasContent: !!response.data.choices[0].message?.content,
        contentLength: response.data.choices[0].message?.content?.length,
        contentPreview: response.data.choices[0].message?.content?.substring(0, 200)
      } : null,
      error: response.data?.error
    });

    const extractedData = response.data.choices?.[0]?.message?.content;
    const refusal = response.data.choices?.[0]?.message?.refusal;

    if (!extractedData) {
      // Check if there's a refusal from the model
      if (refusal) {
        console.error('❌ OpenAI API Refusal:', refusal);
        console.log('🔄 Attempting retry without strict JSON format requirement...');
        
        // Retry without response_format constraint (sometimes helps with refusals)
        try {
          const retryResponse = await axios.post(
            OPENAI_API_URL,
            {
              model: 'gpt-4o',
              messages: [
                {
                  role: 'system',
                  content: systemPrompt
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: userPrompt + '\n\nIMPORTANT: Return ONLY valid JSON. Do not include any explanatory text before or after the JSON.'
                    },
                    ...base64Images.map(base64Image => ({
                      type: 'image_url',
                      image_url: {
                        url: `data:${finalMimeType};base64,${base64Image}`
                      }
                    }))
                  ]
                }
              ],
              max_tokens: 8000,
              temperature: 0.1
              // Removed response_format to see if it helps
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 90000
            }
          );
          
          const retryContent = retryResponse.data.choices?.[0]?.message?.content;
          const retryRefusal = retryResponse.data.choices?.[0]?.message?.refusal;
          
          if (retryRefusal) {
            return {
              success: false,
              error: `The AI model refused to process this document. This may happen if the document is unreadable, corrupted, or contains content that triggers safety filters. Please ensure the document is a valid carrier profile document and try again. If the issue persists, try converting the PDF to images manually and uploading the images instead.`,
              data: null
            };
          }
          
          if (retryContent) {
            // Try to parse the retry response
            try {
              let cleanedContent = retryContent.trim();
              // Remove markdown code blocks if present
              cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
              const parsedData = JSON.parse(cleanedContent);
              
              console.log('✅ Retry successful - extracted data from retry attempt');
              return {
                success: true,
                data: parsedData,
                usage: retryResponse.data.usage
              };
            } catch (parseError) {
              console.error('❌ Failed to parse retry response:', parseError);
            }
          }
        } catch (retryError) {
          console.error('❌ Retry attempt failed:', retryError.message);
        }
        
        return {
          success: false,
          error: `The AI model refused to process this document. This may happen if the document is unreadable, corrupted, or contains content that triggers safety filters. Please ensure the document is a valid carrier profile document and try again. If the issue persists, try converting the PDF to images manually and uploading the images instead.`,
          data: null
        };
      }

      // Check if there's an error in the response
      if (response.data?.error) {
        console.error('❌ OpenAI API Error:', response.data.error);
        return {
          success: false,
          error: `OpenAI API error: ${response.data.error.message || JSON.stringify(response.data.error)}`,
          data: null
        };
      }

      // Log the full response structure for debugging
      console.error('❌ No content in OpenAI response. Full response structure:', JSON.stringify(response.data, null, 2));
      
      return {
        success: false,
        error: 'No data extracted from carrier profile document. The AI model did not return any content. Please try again or check if the document is readable.',
        data: null
      };
    }

    try {
      // Clean the extracted data (remove markdown code blocks if present)
      let cleanedData = extractedData;
      if (typeof cleanedData === 'string') {
        // Remove markdown code blocks
        cleanedData = cleanedData.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }

      const parsedData = typeof cleanedData === 'string'
        ? JSON.parse(cleanedData)
        : cleanedData;

      // Validate that we have at least some data
      if (!parsedData || (typeof parsedData === 'object' && Object.keys(parsedData).length === 0)) {
        console.error('❌ Parsed data is empty:', parsedData);
        return {
          success: false,
          error: 'Extracted data is empty. The document may not contain carrier profile information, or the AI could not read it properly.',
          data: null
        };
      }

      // Ensure we have at least summary or inspections
      if (!parsedData.summary && (!parsedData.inspections || parsedData.inspections.length === 0)) {
        console.error('❌ No summary or inspections found in extracted data:', parsedData);
        return {
          success: false,
          error: 'No inspection data found in the document. Please ensure the document contains carrier profile inspection information.',
          data: null
        };
      }

      console.log('✅ Successfully extracted carrier profile data:', {
        hasSummary: !!parsedData.summary,
        hasInspections: !!parsedData.inspections,
        inspectionsCount: parsedData.inspections?.length || 0,
        summaryTotal: parsedData.summary?.totalInspections || null
      });

      return {
        success: true,
        data: parsedData,
        usage: response.data.usage
      };
    } catch (parseError) {
      console.error('❌ Error parsing carrier profile extraction response:', parseError);
      console.error('Raw extracted data:', extractedData?.substring(0, 500));
      return {
        success: false,
        error: `Failed to parse extracted data: ${parseError.message}. The AI response may be malformed.`,
        data: null
      };
    }
  } catch (error) {
    console.error('Error in extractCarrierProfileData:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to extract carrier profile data',
      data: null
    };
  }
};

/**
 * Extract text from a PDF buffer using pdfjs-dist (no canvas/image conversion needed).
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>} Raw text extracted from all pages
 */
const extractPdfText = async (pdfBuffer) => {
  // Polyfill Promise methods required by pdfjs-dist 5.x in Node.js
  if (!Promise.withResolvers) {
    Promise.withResolvers = function () {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
  if (!Promise.try) {
    Promise.try = function (fn) {
      return new Promise((resolve, reject) => {
        try { resolve(fn()); } catch (e) { reject(e); }
      });
    };
  }

  let pdfjsLib;
  try {
    const m = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib = m.default || m;
  } catch {
    const m = await import('pdfjs-dist');
    pdfjsLib = m.default || m;
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n--- Page Break ---\n\n');
};

const INVOICE_EXTRACTION_PROMPT = `Return a JSON object with this exact structure (use null for missing fields):

{
  "invoiceNumber": string | null,
  "invoiceDate": string | null (format: YYYY-MM-DD),
  "dueDate": string | null (format: YYYY-MM-DD),
  "terms": string | null (e.g. "Net 30"),
  "vendorName": string | null (company that issued the invoice / "From"),
  "vendorAddress": string | null,
  "vendorPhone": string | null,
  "vendorEmail": string | null,
  "billToName": string | null (company the invoice is billed to),
  "billToAddress": string | null,
  "items": [
    {
      "description": string,
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number,
      "serviceDate": string | null (YYYY-MM-DD)
    }
  ],
  "subtotal": number | null,
  "taxAmount": number | null,
  "taxRate": number | null (percentage, e.g. 5 for 5%),
  "taxName": string | null (e.g. "GST", "HST", "PST"),
  "total": number | null,
  "unitInfo": {
    "unitNumber": string | null,
    "makeModel": string | null,
    "vinNumber": string | null,
    "currentKm": string | null
  },
  "notes": string | null
}

Guidelines:
- Parse all dates to YYYY-MM-DD format (e.g. "16/03/2026" → "2026-03-16")
- Extract every line item from the invoice table with qty, unit price, and total
- For unit info, look for "UNIT:", "VIN NO:", "MAKE/MODEL:", "CURRENT KM/HOURS:"
- Remove currency symbols from all numeric fields
- If a line item has no explicit service date, set serviceDate to null`;

/**
 * Extract fleet invoice data from an image or PDF.
 * For PDFs: uses pdfjs-dist text extraction (no canvas needed) → GPT-4o text mode.
 * For images: uses GPT-4o vision.
 */
export const extractFleetInvoiceData = async (fileBuffer, mimeType) => {
  try {
    const apiKey = getOpenAIKey();
    const isImage = mimeType.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';

    if (!isImage && !isPDF) {
      return { success: false, error: 'Unsupported file type. Please upload an image or PDF.', data: null };
    }

    const systemPrompt = `You are an expert invoice analyst for a fleet/trucking company. Extract all structured data from fleet maintenance or vendor invoices and return it as JSON. Be precise with numbers, dates, and text.`;

    let messages;

    if (isPDF) {
      // --- PDF path: extract text with pdfjs-dist, send as text to GPT-4o ---
      let pdfText;
      try {
        console.log('📄 Extracting text from invoice PDF...');
        pdfText = await extractPdfText(fileBuffer);
        console.log(`✅ PDF text extracted (${pdfText.length} chars)`);
      } catch (textError) {
        console.error('❌ PDF text extraction failed:', textError.message);
        return {
          success: false,
          error: `Failed to read PDF: ${textError.message}. Please try uploading a JPEG or PNG image of the invoice instead.`,
          data: null
        };
      }

      messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyze the following invoice text extracted from a PDF and extract all data.\n\n${INVOICE_EXTRACTION_PROMPT}\n\nINVOICE TEXT:\n${pdfText}`
        }
      ];
    } else {
      // --- Image path: use GPT-4o vision ---
      const base64 = fileBuffer.toString('base64');
      messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Analyze this invoice image and extract all data.\n\n${INVOICE_EXTRACTION_PROMPT}` },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
          ]
        }
      ];
    }

    const response = await axios.post(
      OPENAI_API_URL,
      { model: 'gpt-4o', messages, max_tokens: 4000, temperature: 0.1, response_format: { type: 'json_object' } },
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 90000 }
    );

    const extractedData = response.data.choices[0]?.message?.content;
    if (!extractedData) {
      return { success: false, error: 'No data extracted from invoice', data: null };
    }

    try {
      const parsed = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData;
      return { success: true, data: parsed, usage: response.data.usage };
    } catch (parseError) {
      return { success: false, error: `Failed to parse extracted data: ${parseError.message}`, data: null };
    }
  } catch (error) {
    console.error('Error in extractFleetInvoiceData:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to extract invoice data',
      data: null
    };
  }
};

