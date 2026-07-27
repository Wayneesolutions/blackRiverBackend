import { ExpenseCategory } from "../../models/hr/expenseCategoryModel.js";
import { getUserCompanyId } from "../../utils/companyFilter.js";

// ✅ Get All Expense Categories
export const listExpenseCategories = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = {};
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const categories = await ExpenseCategory.find(query).sort({ name: 1 });
    
    res.json({
      success: true,
      message: "Expense categories fetched successfully",
      data: categories
    });
  } catch (err) {
    console.error('Error fetching expense categories:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Create Expense Category
export const createExpenseCategory = async (req, res) => {
  try {
    const { name, status = 'active' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
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

    // Check if category with same name already exists (within company)
    const existingQuery = { name: name.trim() };
    if (!isSuperadmin && companyId) {
      existingQuery.company = companyId;
    }

    const existingCategory = await ExpenseCategory.findOne(existingQuery);
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists"
      });
    }

    const category = new ExpenseCategory({
      name: name.trim(),
      status,
      company: isSuperadmin ? req.body.company || null : companyId
    });

    await category.save();

    res.json({
      success: true,
      message: "Expense category created successfully",
      data: category
    });
  } catch (err) {
    console.error('Error creating expense category:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists"
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Update Expense Category
export const updateExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const category = await ExpenseCategory.findOne(query);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Expense category not found"
      });
    }

    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (status !== undefined) {
      updateData.status = status;
    }

    // Check for duplicate name if name is being updated
    if (updateData.name && updateData.name !== category.name) {
      const duplicateQuery = { name: updateData.name };
      if (!isSuperadmin && companyId) {
        duplicateQuery.company = companyId;
      }
      duplicateQuery._id = { $ne: id };

      const duplicate = await ExpenseCategory.findOne(duplicateQuery);
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists"
        });
      }
    }

    const updatedCategory = await ExpenseCategory.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Expense category updated successfully",
      data: updatedCategory
    });
  } catch (err) {
    console.error('Error updating expense category:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists"
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete Expense Category
export const deleteExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const query = { _id: id };
    if (!isSuperadmin && companyId) {
      query.company = companyId;
    }

    const category = await ExpenseCategory.findOne(query);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Expense category not found"
      });
    }

    // Check if category has associated expense types
    const { ExpenseType } = await import("../../models/hr/expenseTypeModel.js");
    const typesCount = await ExpenseType.countDocuments({ categoryId: id });
    
    if (typesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${typesCount} associated expense type(s). Please delete or reassign the types first.`
      });
    }

    await ExpenseCategory.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Expense category deleted successfully"
    });
  } catch (err) {
    console.error('Error deleting expense category:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

