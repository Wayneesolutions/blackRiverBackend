import { ExpenseType } from "../../models/hr/expenseTypeModel.js";
import { ExpenseCategory } from "../../models/hr/expenseCategoryModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Get All Expense Types (optionally filtered by category)
export const listExpenseTypes = async (req, res) => {
  try {
    const { categoryId } = req.query;
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (categoryId) {
      query.categoryId = categoryId;
    }
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const types = await ExpenseType.find(query)
      .populate('categoryId', 'name status')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      message: "Expense types fetched successfully",
      data: types
    });
  } catch (err) {
    console.error('Error fetching expense types:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Create Expense Type
export const createExpenseType = async (req, res) => {
  try {
    const { name, categoryId, status = 'active' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Expense type name is required"
      });
    }

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required"
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

    // Verify category exists and belongs to same company
    const categoryQuery = { _id: categoryId };
    if (!isSuperadmin && companyId) {
      categoryQuery.company = companyId;
    }

    const category = await ExpenseCategory.findOne(categoryQuery);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Expense category not found"
      });
    }

    // Check if type with same name already exists in this category (within company)
    const existingQuery = { 
      name: name.trim(),
      categoryId: categoryId
    };
    if (!isSuperadmin && companyId) {
      existingQuery.company = companyId;
    }

    const existingType = await ExpenseType.findOne(existingQuery);
    if (existingType) {
      return res.status(400).json({
        success: false,
        message: "Expense type with this name already exists in this category"
      });
    }

    const expenseType = new ExpenseType({
      name: name.trim(),
      categoryId,
      status,
      company: isSuperadmin ? req.body.company || null : companyId
    });

    await expenseType.save();
    await expenseType.populate('categoryId', 'name status');

    res.json({
      success: true,
      message: "Expense type created successfully",
      data: expenseType
    });
  } catch (err) {
    console.error('Error creating expense type:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Expense type with this name already exists in this category"
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Expense Type
export const updateExpenseType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, status } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const expenseType = await ExpenseType.findOne(query);
    if (!expenseType) {
      return res.status(404).json({
        success: false,
        message: "Expense type not found"
      });
    }

    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (categoryId !== undefined) {
      // Verify new category exists
      const categoryQuery = { _id: categoryId };
      if (!isSuperadmin && companyId) {
        categoryQuery.company = companyId;
      }
      const category = await ExpenseCategory.findOne(categoryQuery);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Expense category not found"
        });
      }
      updateData.categoryId = categoryId;
    }
    if (status !== undefined) {
      updateData.status = status;
    }

    // Check for duplicate name if name or category is being updated
    if (updateData.name || updateData.categoryId) {
      const finalName = updateData.name || expenseType.name;
      const finalCategoryId = updateData.categoryId || expenseType.categoryId;
      
      const duplicateQuery = { 
        name: finalName,
        categoryId: finalCategoryId
      };
      if (!isSuperadmin && companyId) {
        duplicateQuery.company = companyId;
      }
      duplicateQuery._id = { $ne: id };

      const duplicate = await ExpenseType.findOne(duplicateQuery);
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Expense type with this name already exists in this category"
        });
      }
    }

    const updatedType = await ExpenseType.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('categoryId', 'name status');

    res.json({
      success: true,
      message: "Expense type updated successfully",
      data: updatedType
    });
  } catch (err) {
    console.error('Error updating expense type:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Expense type with this name already exists in this category"
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Expense Type
export const deleteExpenseType = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const expenseType = await ExpenseType.findOne(query);
    if (!expenseType) {
      return res.status(404).json({
        success: false,
        message: "Expense type not found"
      });
    }

    // Check if type has associated expenses
    const { Expense } = await import("../../models/hr/expenseModel.js");
    const expensesCount = await Expense.countDocuments({ typeId: id });
    
    if (expensesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete expense type. It has ${expensesCount} associated expense(s). Please delete or reassign the expenses first.`
      });
    }

    await ExpenseType.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Expense type deleted successfully"
    });
  } catch (err) {
    console.error('Error deleting expense type:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

