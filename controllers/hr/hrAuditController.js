import { getUserCompanyId } from '../../utils/companyFilter.js';
import { getCombinedFilter } from '../../utils/trialDataFilter.js';

export const getHRAuditTrail = async (req, res) => {
  try {
    const { User } = await import('../../models/driver/userModel.js');
    const { Attendance } = await import('../../models/hr/attendanceModel.js');

    const userCompanyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !userCompanyId) {
      return res.json({ success: true, data: [] });
    }

    const companyFilter = userCompanyId ? { company: userCompanyId } : {};
    const baseFilter = await getCombinedFilter(req.user, companyFilter);

    const auditEntries = [];

    // ── Employees (Users with non-driver roles) ──────────────────────────────
    const employees = await User.find(baseFilter)
      .select('firstName lastName email role status createdAt updatedAt company')
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    for (const emp of employees) {
      const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email;
      const entityType = emp.role === 'driver' ? 'Driver' : 'Employee';

      auditEntries.push({
        id: `${emp._id}_created`,
        timestamp: emp.createdAt,
        user: 'System',
        action: 'Created',
        entityType,
        entityId: emp._id.toString(),
        entityName: fullName,
        changes: [
          { field: 'Name', oldValue: 'N/A', newValue: fullName },
          { field: 'Email', oldValue: 'N/A', newValue: emp.email || 'N/A' },
          { field: 'Role', oldValue: 'N/A', newValue: emp.role || 'N/A' },
          { field: 'Status', oldValue: 'N/A', newValue: emp.status || 'active' },
        ],
        details: `${entityType} profile created`,
      });

      const createdMs = new Date(emp.createdAt).getTime();
      const updatedMs = new Date(emp.updatedAt).getTime();
      if (updatedMs - createdMs > 60_000) {
        auditEntries.push({
          id: `${emp._id}_updated`,
          timestamp: emp.updatedAt,
          user: 'System',
          action: 'Updated',
          entityType,
          entityId: emp._id.toString(),
          entityName: fullName,
          changes: [
            { field: 'Last Modified', oldValue: new Date(emp.createdAt).toLocaleString(), newValue: new Date(emp.updatedAt).toLocaleString() },
            ...(emp.status ? [{ field: 'Status', oldValue: 'N/A', newValue: emp.status }] : []),
          ],
          details: `${entityType} profile updated`,
        });
      }
    }

    // ── Attendance ────────────────────────────────────────────────────────────
    const attendanceFilter = await getCombinedFilter(req.user, userCompanyId ? { company: userCompanyId } : {});
    const attendanceRecords = await Attendance.find(attendanceFilter)
      .populate('employee', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .limit(150)
      .lean();

    for (const record of attendanceRecords) {
      const userName = record.employee
        ? `${record.employee.firstName || ''} ${record.employee.lastName || ''}`.trim() || record.employee.email
        : 'Unknown';

      const checkIn = record.checkIn || 'N/A';
      const checkOut = record.checkOut || 'Not yet';

      auditEntries.push({
        id: `att_${record._id}`,
        timestamp: record.date || record.createdAt,
        user: userName,
        action: record.checkOut ? 'Checked Out' : 'Checked In',
        entityType: 'Attendance',
        entityId: record._id.toString(),
        entityName: userName,
        changes: [
          { field: 'Check-In', oldValue: 'N/A', newValue: checkIn },
          { field: 'Check-Out', oldValue: 'N/A', newValue: checkOut },
          { field: 'Status', oldValue: 'N/A', newValue: record.status || 'present' },
        ],
        details: `Attendance recorded for ${userName}`,
      });
    }

    // Sort all entries newest first
    auditEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.json({ success: true, data: auditEntries });
  } catch (error) {
    console.error('❌ getHRAuditTrail error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
