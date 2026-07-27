// controllers/reportController.js
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { Invoice } from "../../models/hr/invoiceModel.js";
import { Expense } from "../../models/hr/expenseModel.js";

export const getReports = async (req, res) => {
  try {
    const payrollSummary = await Payroll.aggregate([
      { $group: { _id: null, totalPaid: { $sum: "$totalSalary" } } }
    ]);

    const invoiceSummary = await Invoice.aggregate([
      { $group: { _id: "$status", totalAmount: { $sum: "$amount" } } }
    ]);

    const expenseSummary = await Expense.aggregate([
      { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]);

    res.json({ success: true, 
      data:{
         payrollSummary:payrollSummary,
       invoiceSummary:invoiceSummary,
        expenseSummary:expenseSummary 
      }
      });
  } catch (err) {
    res.status(500).json({success:false, message: err.message });
  }
};