// controllers/payrollController.js
import { Payroll } from "../../models/hr/payrollSchemaModel.js";
import { Paystub } from "../../models/hr/paystubModel.js";
import mongoose from "mongoose";
import { getUserCompanyId } from "../../utils/companyFilter.js";

export const createPayroll = async (req, res) => {
  try {
    const { 
      userId, baseSalary, bonus = 0, deductions = 0, payDate, startDate, endDate, 
      loadIds, tripIds, totalMiles, ratePerMile,
      country = 'USA',
      // Canada taxes
      federalIncomeTaxCA = 0, provincialIncomeTaxCA = 0, cpp = 0, ei = 0, provincialHealthTaxCA = 0,
      // USA taxes
      federalIncomeTaxUS = 0, stateIncomeTaxUS = 0, socialSecurityTax = 0, medicareTax = 0,
      stateDisabilityInsurance = 0, localTax = 0
    } = req.body;

    console.log('📝 Creating payroll:', { userId, baseSalary, loadIds: loadIds?.length || 0, tripIds: tripIds?.length || 0, totalMiles, ratePerMile });

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(400).json({
        success: false,
        message: "Please complete company settings first before creating payroll records."
      });
    }

    // validation
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    // Check if user exists and verify role is not restricted
    const User = (await import("../../models/driver/userModel.js")).User;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent payroll creation only for superadmin and admin roles
    // Allow payroll for all other roles including drivers, HR, dispatchers, etc.
    const restrictedRoles = ['superadmin', 'admin'];
    if (user.role && restrictedRoles.includes(user.role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Cannot create payroll for ${user.role} role. Payroll can be created for employees, drivers, HR, dispatchers, fleet maintenance, safety officers, and compliance managers.`,
      });
    }

    // Block overlapping payroll periods for the same employee
    if (startDate && endDate) {
      const overlap = await Payroll.findOne({
        userId,
        company: isSuperadmin ? (req.body.company || null) : companyId,
        startDate: { $lte: new Date(endDate) },
        endDate:   { $gte: new Date(startDate) },
      });
      if (overlap) {
        return res.status(409).json({
          success: false,
          message: `A payroll record already exists for this employee covering ${new Date(overlap.startDate).toLocaleDateString('en-CA')} – ${new Date(overlap.endDate).toLocaleDateString('en-CA')}. Please choose a different date range.`,
          existing: overlap,
        });
      }
    }

    if (baseSalary == null || baseSalary === '' || (typeof baseSalary === 'string' && baseSalary.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: "Base salary is required",
      });
    }

    // ensure numeric values
    const base = Number(baseSalary);
    const extra = Number(bonus);
    const deduct = Number(deductions);

    if (isNaN(base) || isNaN(extra) || isNaN(deduct)) {
      return res.status(400).json({
        success: false,
        message: "Salary, bonus, and deductions must be numbers",
      });
    }

    // calculate total
    const totalSalary = base + extra - deduct;

    // Convert tripIds to ObjectIds if provided (prefer trips over loads)
    let tripsArray = [];
    if (tripIds && Array.isArray(tripIds) && tripIds.length > 0) {
      tripsArray = tripIds.map(id => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        console.warn(`⚠️ Invalid trip ID: ${id}`);
        return null;
      }).filter(id => id !== null);
      console.log(`✅ Converted ${tripsArray.length} trip IDs to ObjectIds (from ${tripIds.length} provided)`);
    } else {
      console.log(`⚠️ No tripIds provided or tripIds is not an array:`, tripIds);
    }
    
    // Legacy support: Convert loadIds to ObjectIds if provided (for backward compatibility)
    let loadsArray = [];
    if (loadIds && Array.isArray(loadIds) && loadIds.length > 0) {
      loadsArray = loadIds.map(id => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return null;
      }).filter(id => id !== null);
      console.log(`✅ Converted ${loadsArray.length} load IDs to ObjectIds (legacy)`);
    }

    // Calculate total taxes
    let totalTaxes = 0;
    if (country === 'Canada') {
      totalTaxes = Number(federalIncomeTaxCA || 0) + Number(provincialIncomeTaxCA || 0) + 
                   Number(cpp || 0) + Number(ei || 0) + Number(provincialHealthTaxCA || 0);
    } else {
      totalTaxes = Number(federalIncomeTaxUS || 0) + Number(stateIncomeTaxUS || 0) + 
                   Number(socialSecurityTax || 0) + Number(medicareTax || 0) + 
                   Number(stateDisabilityInsurance || 0) + Number(localTax || 0);
    }

    // Recalculate total salary including taxes
    const finalTotalSalary = base + extra - deduct - totalTaxes;

    // Calculate hours from attendance records
    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    const hourlyRate = user.details?.hourlyRate || 0;

    try {
      const Attendance = (await import("../../models/hr/attendanceModel.js")).Attendance;
      const startDateObj = startDate ? new Date(startDate) : new Date();
      const endDateObj = endDate ? new Date(endDate) : new Date();
      startDateObj.setHours(0, 0, 0, 0);
      endDateObj.setHours(23, 59, 59, 999);

      const attendanceFilter = {
        company: companyId,
        employee: userId,
        date: { $gte: startDateObj, $lte: endDateObj }
      };

      const attendanceRecords = await Attendance.find(attendanceFilter).lean();

      // Calculate hours and days from attendance
      attendanceRecords.forEach(record => {
        const hours = record.totalHours || 0;
        
        if (record.status === 'present' || record.status === 'late') {
          // Treat late as present
          presentDays++;
          totalHours += hours;
          
          // Calculate regular vs overtime hours (assuming 8 hours per day is regular)
          if (hourlyRate > 0) {
            const regularHoursForDay = Math.min(hours, 8);
            const overtimeHoursForDay = Math.max(0, hours - 8);
            regularHours += regularHoursForDay;
            overtimeHours += overtimeHoursForDay;
          } else {
            // For salaried employees, all hours are regular
            regularHours += hours;
          }
        } else if (record.status === 'absent') {
          absentDays++;
        } else if (record.status === 'leave') {
          leaveDays++;
        }
      });

      console.log(`✅ Calculated hours from attendance: totalHours=${totalHours}, regularHours=${regularHours}, overtimeHours=${overtimeHours}, presentDays=${presentDays}`);
    } catch (attendanceError) {
      console.error('⚠️ Error fetching attendance records for hours calculation:', attendanceError);
      // Continue without hours if attendance fetch fails
    }

    // create payroll
    const payroll = new Payroll({
      userId,
      baseSalary: base,
      bonus: extra,
      deductions: deduct,
      totalSalary: finalTotalSalary,
      payDate: payDate || new Date(),
      startDate: startDate || new Date(),
      endDate: endDate || new Date(),
      loads: loadsArray, // Legacy support
      trips: tripsArray, // New: trips for drivers
      totalMiles: totalMiles ? Number(totalMiles) : 0,
      ratePerMile: ratePerMile ? parseFloat(Number(ratePerMile).toFixed(2)) : 0,
      // Tax fields
      country: country || 'USA',
      // Canada taxes
      federalIncomeTaxCA: Number(federalIncomeTaxCA || 0),
      provincialIncomeTaxCA: Number(provincialIncomeTaxCA || 0),
      cpp: Number(cpp || 0),
      ei: Number(ei || 0),
      provincialHealthTaxCA: Number(provincialHealthTaxCA || 0),
      // USA taxes
      federalIncomeTaxUS: Number(federalIncomeTaxUS || 0),
      stateIncomeTaxUS: Number(stateIncomeTaxUS || 0),
      socialSecurityTax: Number(socialSecurityTax || 0),
      medicareTax: Number(medicareTax || 0),
      stateDisabilityInsurance: Number(stateDisabilityInsurance || 0),
      localTax: Number(localTax || 0),
      // Hours fields
      totalHours: Math.round(totalHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      hourlyRate: hourlyRate,
      // Attendance summary
      presentDays: presentDays,
      absentDays: absentDays,
      leaveDays: leaveDays,
      company: isSuperadmin ? req.body.company || null : companyId
    });

    await payroll.save();

    console.log('✅ Payroll created successfully:', payroll._id);

    // Automatically create paystub
    try {
      // Populate user to get employee details
      await payroll.populate('userId', 'name email role internalId state city country');
      await payroll.populate('company', 'companyName address contactPhone contactEmail logoUrl');
      
      // Fetch company settings for details
      const CompanySettings = (await import("../../models/driver/companysettingsModel.js")).CompanySettings;
      const companyDetails = companyId ? await CompanySettings.findById(companyId) : null;
      
      // Fetch trip details if trips exist (same approach as AI creation)
      let tripDetailsArray = [];
      if (tripsArray.length > 0) {
        try {
          const Trip = (await import("../../models/tripModel.js")).default;
          const Order = (await import("../../models/loadModel.js")).default;
          
          console.log(`📋 Fetching ${tripsArray.length} trips for trip details...`);
          
          // Fetch trips with full details
          const trips = await Trip.find({ _id: { $in: tripsArray } })
            .populate('truck', 'internalId plateNumber licensePlate unitNumber')
            .populate('orders', 'orderNumber customerOrderNo empty distance pickupLocation deliveryLocation pickupDate deliveryDate')
            .populate('coDriver', 'name')
            .lean();
          
          console.log(`✅ Found ${trips.length} trips (expected ${tripsArray.length})`);
          
          for (const trip of trips) {
            const truckNumber = trip.truck?.internalId || trip.truck?.unitNumber || trip.truck?.plateNumber || trip.truck?.licensePlate || 'N/A';
            const payType = 'Paid Per Mile';
            const orders = trip.orders || [];
            
            // Get load number from first order, or use trip number
            let loadNumber = 'N/A';
            if (orders.length > 0) {
              loadNumber = orders[0]?.orderNumber || orders[0]?.customerOrderNo || 'N/A';
            } else if (trip.tripNumber) {
              loadNumber = trip.tripNumber;
            }
            
            // Determine trip type
            let tripType = 'ALONE';
            const hasCoDriver = !!trip.coDriver;
            const hasEmptyOrder = orders.length > 0 && orders.some(order => order.empty === true);
            
            if (hasEmptyOrder) {
              tripType = hasCoDriver ? 'EMPTY-TEAM' : 'EMPTY';
            } else if (orders.length === 0) {
              tripType = 'EMPTY-T';
            } else if (hasCoDriver) {
              tripType = 'TEAM';
            }
            
            // Get period dates
            const periodFrom = trip.actualStartDate || trip.plannedStartDate || (orders.length > 0 && orders[0]?.pickupDate) || new Date();
            const periodTo = trip.actualEndDate || trip.plannedEndDate || (orders.length > 0 && orders[0]?.deliveryDate) || new Date();
            
            // Get origin and destination - prefer from orders, fallback to trip locations
            let origin = 'N/A';
            let destination = 'N/A';
            
            if (orders.length > 0) {
              // Use first order's pickup and delivery locations
              origin = orders[0]?.pickupLocation?.place || trip.startLocation?.place || 'N/A';
              destination = orders[0]?.deliveryLocation?.place || trip.endLocation?.place || 'N/A';
            } else {
              // Use trip locations
              origin = trip.startLocation?.place || 'N/A';
              destination = trip.endLocation?.place || 'N/A';
            }
            
            // Calculate miles - use best available data source
            let miles = 0;
            
            // First, try to get miles directly from trip (if it has distanceInMiles or similar)
            if (trip.distanceInMiles) {
              miles = Math.round(Number(trip.distanceInMiles) * 100) / 100;
            } else if (trip.distance) {
              // If distance is in km, convert to miles
              miles = Math.round((Number(trip.distance) * 0.621371) * 100) / 100;
            } else if (orders.length > 0) {
              // Sum distance from all orders in the trip
              const totalDistanceKm = orders.reduce((sum, order) => sum + (Number(order.distance) || 0), 0);
              if (totalDistanceKm > 0) {
                miles = Math.round((totalDistanceKm * 0.621371) * 100) / 100;
              }
            }
            
            // Fallback to trip route distance
            if (miles === 0 && trip.route?.totalDistance) {
              miles = Math.round((Number(trip.route.totalDistance) * 0.621371) * 100) / 100;
            }
            
            // Last fallback: if only one trip and totalMiles provided, use it
            if (miles === 0 && totalMiles && tripsArray.length === 1) {
              miles = Math.round(Number(totalMiles) * 100) / 100;
            }
            
            // Calculate amount using payRate
            const payRate = ratePerMile ? parseFloat(Number(ratePerMile).toFixed(2)) : 0;
            const amountCAD = Math.round((miles * payRate) * 100) / 100;
            const amountUSD = amountCAD;
            
            tripDetailsArray.push({
              truckNumber,
              payType,
              loadNumber,
              tripType,
              periodFrom,
              periodTo,
              origin,
              destination,
              payRate,
              miles,
              hours: 0,
              amountCAD,
              amountUSD
            });
          }
          
          console.log(`✅ Created ${tripDetailsArray.length} trip details from ${tripsArray.length} trips`);
        } catch (tripError) {
          console.error('⚠️ Error fetching trip details:', tripError);
        }
      }
      
      // Fetch additions if provided in request body
      let additionsArray = [];
      if (req.body.additions && Array.isArray(req.body.additions)) {
        additionsArray = req.body.additions.map(add => ({
          loadDate: add.loadDate ? new Date(add.loadDate) : new Date(),
          memo: add.memo || add.description || '',
          amount: Number(add.amount || 0),
          per: add.per || 'One Time',
          gst: Number(add.gst || 0),
          totalCAD: Number(add.totalCAD || add.amount || 0)
        }));
      }
      
      // Calculate totals
      const grossPay = base + extra;
      const totalTaxes = country === 'Canada' 
        ? (Number(federalIncomeTaxCA || 0) + Number(provincialIncomeTaxCA || 0) + 
           Number(cpp || 0) + Number(ei || 0) + Number(provincialHealthTaxCA || 0))
        : (Number(federalIncomeTaxUS || 0) + Number(stateIncomeTaxUS || 0) + 
           Number(socialSecurityTax || 0) + Number(medicareTax || 0) + 
           Number(stateDisabilityInsurance || 0) + Number(localTax || 0));
      const totalDeductions = deduct + totalTaxes;
      const netPay = finalTotalSalary;

      // Count trips and loads
      const tripsCount = tripsArray.length;
      const loadsCount = loadsArray.length;
      const mileageEarnings = totalMiles && ratePerMile ? (Number(totalMiles) * Number(ratePerMile)) : 0;
      
      // Determine work type based on role and companyFlag
      // For drivers: check companyFlag to distinguish between Company Driver and Owner-Operator
      // Note: companyFlag=true = Owner Operator, companyFlag=false = Company Driver
      let workType = 'Employee';
      if (user.role === 'driver') {
        const companyFlag = user.details?.companyFlag ?? user.companyFlag ?? false;
        // companyFlag=false means Company Driver, companyFlag=true means Owner Operator
        workType = companyFlag === false ? 'Driver' : 'Owner-Operator';
      }
      
      // Generate paystub ID
      const paystubId = `PS-${payroll._id.toString().slice(-8).toUpperCase()}-${new Date().getFullYear()}`;
      
      // Build earnings breakdown
      const earningsBreakdown = [];
      if (base > 0) {
        earningsBreakdown.push({
          type: 'Basic Pay',
          units: workType === 'Driver' ? 'Trips' : 'Salary',
          rate: workType === 'Driver' ? 0 : base,
          amount: base
        });
      }
      if (extra > 0) {
        earningsBreakdown.push({
          type: 'Bonus',
          units: '',
          rate: 0,
          amount: extra
        });
      }
      if (mileageEarnings > 0) {
        earningsBreakdown.push({
          type: 'Trip Pay / Mileage',
          units: `${totalMiles} Miles`,
          rate: Number(ratePerMile),
          amount: mileageEarnings
        });
      }
      
      // Build deductions breakdown
      const deductionsBreakdown = [];
      if (deduct > 0) {
        deductionsBreakdown.push({
          type: 'Other Deductions',
          amount: deduct
        });
      }
      if (country === 'Canada') {
        if (federalIncomeTaxCA > 0) deductionsBreakdown.push({ type: 'Federal Income Tax', amount: Number(federalIncomeTaxCA) });
        if (provincialIncomeTaxCA > 0) deductionsBreakdown.push({ type: 'Provincial Income Tax', amount: Number(provincialIncomeTaxCA) });
        if (cpp > 0) deductionsBreakdown.push({ type: 'CPP', amount: Number(cpp) });
        if (ei > 0) deductionsBreakdown.push({ type: 'EI', amount: Number(ei) });
        if (provincialHealthTaxCA > 0) deductionsBreakdown.push({ type: 'Provincial Health Tax', amount: Number(provincialHealthTaxCA) });
      } else {
        if (federalIncomeTaxUS > 0) deductionsBreakdown.push({ type: 'Federal Income Tax', amount: Number(federalIncomeTaxUS) });
        if (stateIncomeTaxUS > 0) deductionsBreakdown.push({ type: 'State Income Tax', amount: Number(stateIncomeTaxUS) });
        if (socialSecurityTax > 0) deductionsBreakdown.push({ type: 'Social Security Tax', amount: Number(socialSecurityTax) });
        if (medicareTax > 0) deductionsBreakdown.push({ type: 'Medicare Tax', amount: Number(medicareTax) });
        if (stateDisabilityInsurance > 0) deductionsBreakdown.push({ type: 'State Disability Insurance', amount: Number(stateDisabilityInsurance) });
        if (localTax > 0) deductionsBreakdown.push({ type: 'Local Tax', amount: Number(localTax) });
      }
      
      // Calculate YTD (Year-to-Date) - get all paystubs for this user in current year
      const currentYear = new Date().getFullYear();
      const yearStart = new Date(currentYear, 0, 1);
      const existingPaystubs = await Paystub.find({
        userId: userId,
        'payPeriod.payDate': { $gte: yearStart },
        status: { $ne: 'void' }
      }).select('summary');
      
      const ytdEarnings = existingPaystubs.reduce((sum, ps) => sum + (ps.summary?.grossPay || 0), 0) + (grossPay + mileageEarnings);
      const ytdDeductions = existingPaystubs.reduce((sum, ps) => sum + (ps.summary?.totalDeductions || 0), 0) + totalDeductions;
      const ytdNetPay = existingPaystubs.reduce((sum, ps) => sum + (ps.summary?.netPay || 0), 0) + netPay;
      
      // Get user address
      const userAddress = user.city && user.state 
        ? `${user.city}, ${user.state}${user.country ? ', ' + user.country : ''}`
        : user.country || '';

      // Create paystub
      const paystub = new Paystub({
        payrollId: payroll._id,
        userId: userId,
        employeeName: user.name || 'Unknown',
        employeeId: user.internalId || '',
        employeeEmail: user.email || '',
        employeeRole: user.role || '',
        employeeDepartment: '', // Can be added from user model if available
        employeeAddress: userAddress,
        workType: workType,
        payPeriod: {
          startDate: startDate || new Date(),
          endDate: endDate || new Date(),
          payDate: payDate || new Date()
        },
        paystubId: paystubId,
        earnings: {
          baseSalary: base,
          bonus: extra,
          overtime: 0, // Can be added later if needed
          overtimeHours: 0,
          overtimeRate: 0,
          mileageEarnings: mileageEarnings,
          tripPay: mileageEarnings, // Same as mileage for drivers
          allowance: 0,
          incentives: 0,
          regularHours: 0,
          hourlyRate: 0,
          totalEarnings: grossPay + mileageEarnings,
          earningsBreakdown: earningsBreakdown
        },
        deductions: {
          totalDeductions: totalDeductions,
          otherDeductions: deduct,
          advanceRecovery: 0,
          loanEMI: 0,
          insurance: 0,
          payrollPenalty: 0,
          deductionsBreakdown: deductionsBreakdown
        },
        taxesCA: country === 'Canada' ? {
          federalIncomeTax: Number(federalIncomeTaxCA || 0),
          provincialIncomeTax: Number(provincialIncomeTaxCA || 0),
          cpp: Number(cpp || 0),
          ei: Number(ei || 0),
          provincialHealthTax: Number(provincialHealthTaxCA || 0),
          totalTaxes: totalTaxes
        } : {
          federalIncomeTax: 0,
          provincialIncomeTax: 0,
          cpp: 0,
          ei: 0,
          provincialHealthTax: 0,
          totalTaxes: 0
        },
        taxesUS: country === 'USA' ? {
          federalIncomeTax: Number(federalIncomeTaxUS || 0),
          stateIncomeTax: Number(stateIncomeTaxUS || 0),
          socialSecurityTax: Number(socialSecurityTax || 0),
          medicareTax: Number(medicareTax || 0),
          stateDisabilityInsurance: Number(stateDisabilityInsurance || 0),
          localTax: Number(localTax || 0),
          totalTaxes: totalTaxes
        } : {
          federalIncomeTax: 0,
          stateIncomeTax: 0,
          socialSecurityTax: 0,
          medicareTax: 0,
          stateDisabilityInsurance: 0,
          localTax: 0,
          totalTaxes: 0
        },
        summary: {
          grossPay: grossPay + mileageEarnings,
          totalDeductions: totalDeductions,
          totalTaxes: totalTaxes,
          netPay: netPay
        },
        country: country || 'USA',
        driverInfo: {
          totalMiles: totalMiles ? Number(totalMiles) : 0,
          ratePerMile: ratePerMile ? parseFloat(Number(ratePerMile).toFixed(2)) : 0,
          tripsCount: tripsCount,
          loadsCount: loadsCount
        },
        company: isSuperadmin ? req.body.company || null : companyId,
        companyDetails: {
          companyName: companyDetails?.companyName || payroll.company?.companyName || 'N/A',
          companyAddress: companyDetails?.address || payroll.company?.address || '',
          companyPhone: companyDetails?.contactPhone || payroll.company?.contactPhone || '',
          companyEmail: companyDetails?.contactEmail || payroll.company?.contactEmail || '',
          companyLogo: companyDetails?.logoUrl || payroll.company?.logoUrl || '',
          gstNumber: companyDetails?.taxNumber || ''
        },
        tripDetails: tripDetailsArray,
        additions: additionsArray,
        employerContributions: {
          companyInsurance: 0,
          pensionPF: 0,
          benefitContributions: 0,
          total: 0
        },
        ytd: {
          earnings: ytdEarnings,
          deductions: ytdDeductions,
          netPay: ytdNetPay
        },
        payment: {
          mode: 'Bank Transfer', // Default, can be updated
          bankLast4Digits: '',
          bankName: '',
          accountNumber: ''
        },
        notes: '',
        hrSignature: '',
        hrName: req.user?.name || '',
        status: 'issued'
      });

      await paystub.save();
      console.log('✅ Paystub created successfully:', paystub._id);
    } catch (paystubError) {
      console.error('⚠️ Error creating paystub (payroll still created):', paystubError);
      // Don't fail the payroll creation if paystub creation fails
    }

    // Generate signed URL for company logo if it exists
    const payrollObj = payroll.toObject();
    if (payrollObj.company && payrollObj.company.logoUrl) {
      try {
        const logoUrl = payrollObj.company.logoUrl;
        // Check if it's an S3 URL
        if (logoUrl && (logoUrl.includes('s3.amazonaws.com') || logoUrl.includes('.s3.'))) {
          const { GetObjectCommand } = await import("@aws-sdk/client-s3");
          const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
          const { s3 } = await import("../../config/awsConfig.js");
          
          const cleanUrl = logoUrl.split('?')[0].split('#')[0];
          const urlObj = new URL(cleanUrl);
          let bucketName = process.env.AWS_S3_BUCKET_NAME;
          let key = decodeURIComponent(urlObj.pathname.substring(1));

          if (urlObj.hostname.includes('.s3.')) {
            bucketName = urlObj.hostname.split('.s3.')[0];
            key = decodeURIComponent(urlObj.pathname.substring(1));
          } else if (urlObj.hostname === 's3.amazonaws.com' || urlObj.hostname.includes('s3-')) {
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            bucketName = pathParts[0];
            key = pathParts.slice(1).map(p => decodeURIComponent(p)).join('/');
          }

          // Clean key from query parameters
          if (key.includes('?')) key = key.split('?')[0];
          if (key.includes('&')) key = key.split('&')[0];

          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            ResponseContentType: logoUrl.toLowerCase().includes('.png') ? 'image/png' : 
                                logoUrl.toLowerCase().includes('.gif') ? 'image/gif' : 
                                logoUrl.toLowerCase().includes('.webp') ? 'image/webp' : 
                                'image/jpeg',
          });

          payrollObj.company.logoUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        }
      } catch (error) {
        console.error('Error generating signed URL for company logo:', error);
        // Keep the original URL if signing fails
      }
    }

    res.status(201).json({
      success: true,
      message: "Payroll created successfully",
      data: payrollObj,
    });
  } catch (err) {
    console.error("❌ Error creating payroll:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message,
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};


export const getPayrolls = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';
    const { search } = req.query; // Get search parameter

    if (!isSuperadmin && !companyId) {
      return res.json({
        success: true,
        message: "No company assigned to the current admin.",
        data: []
      });
    }

    const filter = !isSuperadmin && companyId ? { company: companyId } : {};

    // Build query - first get all payrolls
    // Get payrolls without populating trips first to preserve the ObjectIds
    let payrolls = await Payroll.find(filter)
      .populate("userId", "name role internalId")
      .populate("loads", "details.internalId route.selectPickup route.selectDropOff route.multipleDropOffs route.wayPoints completedAt assignedAt startedAt")
      .select("+trips"); // Explicitly include trips field
    
    // Convert to plain objects and preserve trips array structure
    const TripModule = await import("../../models/tripModel.js");
    const Trip = TripModule.default;
    
    payrolls = payrolls.map(p => {
      const payrollObj = p.toObject();
      // Extract trips array - preserve ObjectIds
      if (!payrollObj.trips) {
        payrollObj.trips = [];
      } else {
        // Convert trips to array of IDs (they might be ObjectIds or strings)
        payrollObj.trips = payrollObj.trips.map(trip => {
          // If it's an ObjectId, convert to string
          if (trip && trip.toString) {
            return trip.toString();
          }
          // If it's already a string or object, keep it
          return trip;
        });
      }
      return payrollObj;
    });
    
    payrolls = await Promise.all(payrolls.map(async (payroll) => {
      // Preserve the original trips array length before processing
      const originalTripsCount = payroll.trips && Array.isArray(payroll.trips) ? payroll.trips.length : 0;
      
      if (payroll.trips && Array.isArray(payroll.trips) && payroll.trips.length > 0) {
        // Fetch trips that are still ObjectId strings (not populated)
        // Try Trip model first, then Order model (since payrolls might reference Orders)
        const OrderModule = await import("../../models/orderModel.js");
        const Order = OrderModule.default;
        
        const tripPromises = payroll.trips.map(async (trip) => {
          // If trip is still an ObjectId string, fetch it
          if (typeof trip === 'string' || (trip && trip._id && typeof trip._id === 'string')) {
            const tripId = typeof trip === 'string' ? trip : trip._id;
            console.log(`🔄 Fetching trip/order by ID: ${tripId}`);
            
            // Try Trip model first
            let fullTrip = await Trip.findById(tripId)
              .populate('startLocation.placeId', 'name currentLocation')
              .populate('endLocation.placeId', 'name currentLocation')
              .populate({
                path: 'orders',
                select: 'orderNumber pickupLocation deliveryLocation',
                populate: [
                  {
                    path: 'pickupLocation.placeId',
                    select: 'name currentLocation',
                    model: 'Place'
                  },
                  {
                    path: 'deliveryLocation.placeId',
                    select: 'name currentLocation',
                    model: 'Place'
                  }
                ]
              })
              .lean();
            
            // If not found in Trip model, try Order model
            if (!fullTrip) {
              console.log(`🔄 Trip not found, trying Order model: ${tripId}`);
              const order = await Order.findById(tripId)
                .populate('pickupLocation.placeId', 'name currentLocation')
                .populate('deliveryLocation.placeId', 'name currentLocation')
                .populate('driver', 'name email phone')
                .populate('coDriver', 'name email phone')
                .lean();
              
              if (order) {
                // Transform Order to Trip-like structure for frontend compatibility
                const orderDistanceInMiles = order.distance ? parseFloat((order.distance * 0.621371).toFixed(2)) : 0;
                fullTrip = {
                  _id: order._id,
                  tripNumber: order.orderNumber || 'N/A',
                  orderNumber: order.orderNumber,
                  startLocation: order.pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
                  endLocation: order.deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
                  pickupLocation: order.pickupLocation || { place: 'Unknown', latitude: '', longitude: '' },
                  deliveryLocation: order.deliveryLocation || { place: 'Unknown', latitude: '', longitude: '' },
                  distance: order.distance || 0,
                  distanceInMiles: orderDistanceInMiles,
                  actualEndDate: order.deliveryDate || order.updatedAt,
                  driver: order.driver,
                  coDriver: order.coDriver,
                  driverRole: order.driver?._id?.toString() === payroll.userId?._id?.toString() || order.driver?._id?.toString() === payroll.userId?.toString() ? 'driver' : (order.coDriver?._id?.toString() === payroll.userId?._id?.toString() || order.coDriver?._id?.toString() === payroll.userId?.toString() ? 'coDriver' : 'unknown'),
                  orders: [order], // Wrap in array for compatibility
                  earnings: order.earnings || 0, // Include earnings if available
                  baseRate: order.baseRate || order.mileRate || 0, // Include rate if available
                  rateType: order.rateType || 'ALONE', // Include rate type if available
                  _isOrder: true // Flag to indicate this is an Order, not a Trip
                };
                console.log(`✅ Fetched order as trip:`, {
                  orderNumber: order.orderNumber,
                  hasPickupLocation: !!order.pickupLocation,
                  hasDeliveryLocation: !!order.deliveryLocation,
                  distanceInMiles: orderDistanceInMiles,
                  hasEarnings: !!order.earnings
                });
              }
            }
            
            if (fullTrip) {
              console.log(`✅ Fetched trip/order:`, {
                tripNumber: fullTrip.tripNumber || fullTrip.orderNumber,
                hasStartLocation: !!fullTrip.startLocation,
                hasEndLocation: !!fullTrip.endLocation,
                hasOrders: !!(fullTrip.orders && fullTrip.orders.length > 0)
              });
              return fullTrip;
            }
            // If neither found, return a placeholder to preserve count
            return { _id: tripId, tripNumber: 'N/A', _notFound: true };
          }
          // Trip is already an object (populated), use as-is
          return trip;
        });
        
        let fetchedTrips = await Promise.all(tripPromises);
        // Filter out null/undefined but preserve count
        fetchedTrips = fetchedTrips.filter(trip => trip !== null && trip !== undefined);
        
        // Ensure trips array length matches original count
        if (fetchedTrips.length !== originalTripsCount) {
          console.log(`⚠️ Trip count mismatch: expected ${originalTripsCount}, got ${fetchedTrips.length}`);
        }
        
        // Now process the fetched trips to add location and earnings data
        payroll.trips = await Promise.all(fetchedTrips.map(async (trip, index) => {
          // Trip should now be a plain object (from .lean())
          const tripObj = trip && typeof trip === 'object' ? trip : {};
          
          // Skip if trip is still invalid
          if (!tripObj || !tripObj._id) {
            console.warn(`⚠️ Trip ${index} is invalid:`, tripObj);
            return { 
              _id: typeof trip === 'string' ? trip : 'unknown', 
              tripNumber: 'N/A', 
              startLocation: { place: 'Unknown' }, 
              endLocation: { place: 'Unknown' },
              distanceInMiles: 0,
              earnings: '0.00'
            };
          }
          
          console.log(`🔍 Processing trip ${tripObj.tripNumber || tripObj._id}:`, {
            hasStartLocation: !!tripObj.startLocation,
            startLocationPlace: tripObj.startLocation?.place,
            hasEndLocation: !!tripObj.endLocation,
            endLocationPlace: tripObj.endLocation?.place,
            hasOrders: !!(tripObj.orders && tripObj.orders.length > 0),
            ordersCount: tripObj.orders?.length || 0
          });

          // Handle both Trip and Order structures
          let startLocation = tripObj.startLocation || tripObj.pickupLocation;
          let endLocation = tripObj.endLocation || tripObj.deliveryLocation;

          // If startLocation/endLocation are null or missing place data, try to get from orders
          if ((!startLocation || !startLocation.place || startLocation.place === 'Unknown') && tripObj.orders && tripObj.orders.length > 0) {
            const firstOrder = Array.isArray(tripObj.orders) ? tripObj.orders[0] : tripObj.orders;
            if (firstOrder && firstOrder.pickupLocation) {
              // Check if placeId is populated
              if (firstOrder.pickupLocation.placeId && typeof firstOrder.pickupLocation.placeId === 'object' && firstOrder.pickupLocation.placeId.currentLocation) {
                const place = firstOrder.pickupLocation.placeId;
                startLocation = {
                  place: place.name || place.currentLocation.address || firstOrder.pickupLocation.place || 'Unknown',
                  latitude: place.currentLocation.latitude || firstOrder.pickupLocation.latitude || '',
                  longitude: place.currentLocation.longitude || firstOrder.pickupLocation.longitude || ''
                };
              } else if (firstOrder.pickupLocation.place) {
                startLocation = {
                  place: firstOrder.pickupLocation.place,
                  latitude: firstOrder.pickupLocation.latitude || '',
                  longitude: firstOrder.pickupLocation.longitude || ''
                };
              }
            }
          }

          if ((!endLocation || !endLocation.place || endLocation.place === 'Unknown') && tripObj.orders && tripObj.orders.length > 0) {
            const orderArray = Array.isArray(tripObj.orders) ? tripObj.orders : [tripObj.orders];
            const lastOrder = orderArray[orderArray.length - 1];
            if (lastOrder && lastOrder.deliveryLocation) {
              // Check if placeId is populated
              if (lastOrder.deliveryLocation.placeId && typeof lastOrder.deliveryLocation.placeId === 'object' && lastOrder.deliveryLocation.placeId.currentLocation) {
                const place = lastOrder.deliveryLocation.placeId;
                endLocation = {
                  place: place.name || place.currentLocation.address || lastOrder.deliveryLocation.place || 'Unknown',
                  latitude: place.currentLocation.latitude || lastOrder.deliveryLocation.latitude || '',
                  longitude: place.currentLocation.longitude || lastOrder.deliveryLocation.longitude || ''
                };
              } else if (lastOrder.deliveryLocation.place) {
                endLocation = {
                  place: lastOrder.deliveryLocation.place,
                  latitude: lastOrder.deliveryLocation.latitude || '',
                  longitude: lastOrder.deliveryLocation.longitude || ''
                };
              }
            }
          }
          
          // For orders, also check pickupLocation/deliveryLocation directly
          if ((!startLocation || !startLocation.place || startLocation.place === 'Unknown') && tripObj.pickupLocation) {
            if (tripObj.pickupLocation.placeId && typeof tripObj.pickupLocation.placeId === 'object' && tripObj.pickupLocation.placeId.currentLocation) {
              const place = tripObj.pickupLocation.placeId;
              startLocation = {
                place: place.name || place.currentLocation.address || tripObj.pickupLocation.place || 'Unknown',
                latitude: place.currentLocation.latitude || tripObj.pickupLocation.latitude || '',
                longitude: place.currentLocation.longitude || tripObj.pickupLocation.longitude || ''
              };
            } else if (tripObj.pickupLocation.place) {
              startLocation = {
                place: tripObj.pickupLocation.place,
                latitude: tripObj.pickupLocation.latitude || '',
                longitude: tripObj.pickupLocation.longitude || ''
              };
            }
          }
          
          if ((!endLocation || !endLocation.place || endLocation.place === 'Unknown') && tripObj.deliveryLocation) {
            if (tripObj.deliveryLocation.placeId && typeof tripObj.deliveryLocation.placeId === 'object' && tripObj.deliveryLocation.placeId.currentLocation) {
              const place = tripObj.deliveryLocation.placeId;
              endLocation = {
                place: place.name || place.currentLocation.address || tripObj.deliveryLocation.place || 'Unknown',
                latitude: place.currentLocation.latitude || tripObj.deliveryLocation.latitude || '',
                longitude: place.currentLocation.longitude || tripObj.deliveryLocation.longitude || ''
              };
            } else if (tripObj.deliveryLocation.place) {
              endLocation = {
                place: tripObj.deliveryLocation.place,
                latitude: tripObj.deliveryLocation.latitude || '',
                longitude: tripObj.deliveryLocation.longitude || ''
              };
            }
          }

          // Ensure we have location objects
          if (!startLocation || !startLocation.place) {
            startLocation = { place: 'Unknown', latitude: '', longitude: '' };
          }
          if (!endLocation || !endLocation.place) {
            endLocation = { place: 'Unknown', latitude: '', longitude: '' };
          }

          // Calculate distanceInMiles if not already present
          // Handle both Trip (route.totalDistance) and Order (distance) structures
          let distanceInMiles = tripObj.distanceInMiles;
          if (!distanceInMiles || distanceInMiles === 0) {
            if (tripObj.route && tripObj.route.totalDistance) {
              // Trip model: Convert km to miles (1 km = 0.621371 miles)
              distanceInMiles = parseFloat((tripObj.route.totalDistance * 0.621371).toFixed(2));
            } else if (tripObj.distance) {
              // Order model: Convert km to miles
              distanceInMiles = parseFloat((tripObj.distance * 0.621371).toFixed(2));
            } else {
              distanceInMiles = 0;
            }
          } else {
            distanceInMiles = parseFloat(distanceInMiles);
          }

          // Calculate earnings using the same logic as getCompletedTripsByDriver (with weather premiums)
          let earnings = tripObj.earnings;
          if (!earnings || earnings === '0.00' || parseFloat(earnings) === 0) {
            // Fetch driver to get salary rates
            const User = (await import("../../models/driver/userModel.js")).User;
            const driver = await User.findById(payroll.userId._id || payroll.userId);
            
            if (driver && distanceInMiles > 0) {
              const baseRate = driver.details?.salaryPerMile || driver.details?.mileRate || payroll.ratePerMile || 0;
              const snowRate = driver.details?.salaryPerMileSnow || 0;
              const highTempRate = driver.details?.salaryPerMileHighTemp || 0;
              const highTempThreshold = driver.details?.highTempThreshold || 35;
              
              // Check weather conditions from orders
              let hasSnow = false;
              let hasHighTemp = false;
              
              if (tripObj.orders && Array.isArray(tripObj.orders)) {
                hasSnow = tripObj.orders.some(order => order.weatherConditions?.snow === true);
                
                hasHighTemp = tripObj.orders.some(order => {
                  if (order.weatherConditions?.highTemperature === true) {
                    return true;
                  }
                  if (order.temperature !== null && order.temperature !== undefined) {
                    const tempInCelsius = order.temperatureUnit === 'Fahrenheit' 
                      ? (order.temperature - 32) * 5/9 
                      : order.temperature;
                    return tempInCelsius >= highTempThreshold;
                  }
                  return false;
                });
              }
              
              // Calculate earnings with premiums
              let calculatedEarnings = distanceInMiles * baseRate;
              
              if (hasSnow && snowRate > 0) {
                calculatedEarnings += distanceInMiles * snowRate;
              }
              
              if (hasHighTemp && highTempRate > 0) {
                calculatedEarnings += distanceInMiles * highTempRate;
              }
              
              earnings = parseFloat(calculatedEarnings.toFixed(2));
            } else if (distanceInMiles && payroll.ratePerMile) {
              // Fallback to simple calculation
              earnings = parseFloat((distanceInMiles * payroll.ratePerMile).toFixed(2));
            } else {
              earnings = 0;
            }
          } else {
            earnings = typeof earnings === 'string' ? parseFloat(earnings) : earnings;
          }

          return {
            ...tripObj,
            startLocation,
            endLocation,
            distanceInMiles: distanceInMiles || 0,
            earnings: earnings || 0
          };
        }));
      } else if (originalTripsCount > 0) {
        // If trips array is empty but we had a count, preserve it
        payroll.trips = Array(originalTripsCount).fill(null).map((_, idx) => ({ _id: `unknown-${idx}`, tripNumber: 'N/A', _notFound: true }));
      } else {
        // No trips, ensure empty array
        payroll.trips = [];
      }
      
      return payroll;
    }));

    // Filter out payrolls only for superadmin and admin roles
    // Allow all other roles including drivers, HR, dispatchers, etc.
    const restrictedRoles = ['superadmin', 'admin'];
    let filteredPayrolls = payrolls.filter(payroll => {
      if (!payroll.userId) return false;
      if (restrictedRoles.includes(payroll.userId.role?.toLowerCase())) return false;
      return true;
    });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPayrolls = filteredPayrolls.filter(payroll => {
        if (!payroll.userId) return false;
        const nameMatch = payroll.userId.name?.toLowerCase().includes(searchLower);
        const internalIdMatch = payroll.userId.internalId?.toLowerCase().includes(searchLower);
        return nameMatch || internalIdMatch;
      });
    }

    res.json({ success: true, data: filteredPayrolls });
  } catch (err) {
    console.error("❌ Error fetching payrolls:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✅ Update Payroll
export const updatePayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      baseSalary, bonus, deductions, payDate, startDate, endDate,
      country = 'USA',
      // Canada taxes
      federalIncomeTaxCA = 0, provincialIncomeTaxCA = 0, cpp = 0, ei = 0, provincialHealthTaxCA = 0,
      // USA taxes
      federalIncomeTaxUS = 0, stateIncomeTaxUS = 0, socialSecurityTax = 0, medicareTax = 0,
      stateDisabilityInsurance = 0, localTax = 0
    } = req.body;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const payroll = await Payroll.findOne(query);
    if (!payroll) {
      return res.status(404).json({ success: false, message: "Payroll not found" });
    }

    // Block overlapping payroll periods (exclude the record being updated)
    if (startDate || endDate) {
      const newStart = new Date(startDate || payroll.startDate);
      const newEnd   = new Date(endDate   || payroll.endDate);
      const overlapQuery = {
        _id:     { $ne: payroll._id },
        userId:  payroll.userId,
        startDate: { $lte: newEnd },
        endDate:   { $gte: newStart },
      };
      if (!isSuperadmin) overlapQuery.company = companyId;
      const overlap = await Payroll.findOne(overlapQuery);
      if (overlap) {
        return res.status(409).json({
          success: false,
          message: `A payroll record already exists for this employee covering ${new Date(overlap.startDate).toLocaleDateString('en-CA')} – ${new Date(overlap.endDate).toLocaleDateString('en-CA')}. Please choose a different date range.`,
          existing: overlap,
        });
      }
    }

    // Update fields if provided
    if (baseSalary !== undefined) payroll.baseSalary = Number(baseSalary);
    if (bonus !== undefined) payroll.bonus = Number(bonus);
    if (deductions !== undefined) payroll.deductions = Number(deductions);
    
    // Track if dates changed to recalculate hours
    const datesChanged = (startDate && new Date(startDate).getTime() !== payroll.startDate.getTime()) ||
                         (endDate && new Date(endDate).getTime() !== payroll.endDate.getTime());
    
    if (payDate) payroll.payDate = payDate;
    if (startDate) payroll.startDate = startDate;
    if (endDate) payroll.endDate = endDate;

    // Recalculate hours if dates changed
    if (datesChanged) {
      try {
        const Attendance = (await import("../../models/hr/attendanceModel.js")).Attendance;
        const User = (await import("../../models/driver/userModel.js")).User;
        const user = await User.findById(payroll.userId);
        
        const startDateObj = payroll.startDate;
        const endDateObj = payroll.endDate;
        startDateObj.setHours(0, 0, 0, 0);
        endDateObj.setHours(23, 59, 59, 999);

        const attendanceFilter = {
          company: companyId,
          employee: payroll.userId,
          date: { $gte: startDateObj, $lte: endDateObj }
        };

        const attendanceRecords = await Attendance.find(attendanceFilter).lean();

        // Reset hours
        let totalHours = 0;
        let regularHours = 0;
        let overtimeHours = 0;
        let presentDays = 0;
        let absentDays = 0;
        let leaveDays = 0;
        const hourlyRate = user?.details?.hourlyRate || 0;

        // Calculate hours and days from attendance
        attendanceRecords.forEach(record => {
          const hours = record.totalHours || 0;
          
          if (record.status === 'present' || record.status === 'late') {
            // Treat late as present
            presentDays++;
            totalHours += hours;
            
            // Calculate regular vs overtime hours (assuming 8 hours per day is regular)
            if (hourlyRate > 0) {
              const regularHoursForDay = Math.min(hours, 8);
              const overtimeHoursForDay = Math.max(0, hours - 8);
              regularHours += regularHoursForDay;
              overtimeHours += overtimeHoursForDay;
            } else {
              // For salaried employees, all hours are regular
              regularHours += hours;
            }
          } else if (record.status === 'absent') {
            absentDays++;
          } else if (record.status === 'leave') {
            leaveDays++;
          }
        });

        // Update hours fields
        payroll.totalHours = Math.round(totalHours * 100) / 100;
        payroll.regularHours = Math.round(regularHours * 100) / 100;
        payroll.overtimeHours = Math.round(overtimeHours * 100) / 100;
        payroll.hourlyRate = hourlyRate;
        payroll.presentDays = presentDays;
        payroll.absentDays = absentDays;
        payroll.leaveDays = leaveDays;

        console.log(`✅ Recalculated hours after date change: totalHours=${payroll.totalHours}, regularHours=${payroll.regularHours}, overtimeHours=${payroll.overtimeHours}`);
      } catch (attendanceError) {
        console.error('⚠️ Error recalculating hours after date change:', attendanceError);
        // Continue without updating hours if attendance fetch fails
      }
    }

    // Update tax fields if provided
    if (country !== undefined) payroll.country = country;
    if (federalIncomeTaxCA !== undefined) payroll.federalIncomeTaxCA = Number(federalIncomeTaxCA);
    if (provincialIncomeTaxCA !== undefined) payroll.provincialIncomeTaxCA = Number(provincialIncomeTaxCA);
    if (cpp !== undefined) payroll.cpp = Number(cpp);
    if (ei !== undefined) payroll.ei = Number(ei);
    if (provincialHealthTaxCA !== undefined) payroll.provincialHealthTaxCA = Number(provincialHealthTaxCA);
    if (federalIncomeTaxUS !== undefined) payroll.federalIncomeTaxUS = Number(federalIncomeTaxUS);
    if (stateIncomeTaxUS !== undefined) payroll.stateIncomeTaxUS = Number(stateIncomeTaxUS);
    if (socialSecurityTax !== undefined) payroll.socialSecurityTax = Number(socialSecurityTax);
    if (medicareTax !== undefined) payroll.medicareTax = Number(medicareTax);
    if (stateDisabilityInsurance !== undefined) payroll.stateDisabilityInsurance = Number(stateDisabilityInsurance);
    if (localTax !== undefined) payroll.localTax = Number(localTax);

    // Calculate total taxes
    let totalTaxes = 0;
    const payrollCountry = payroll.country || 'USA';
    if (payrollCountry === 'Canada') {
      totalTaxes = (payroll.federalIncomeTaxCA || 0) + (payroll.provincialIncomeTaxCA || 0) + 
                   (payroll.cpp || 0) + (payroll.ei || 0) + (payroll.provincialHealthTaxCA || 0);
    } else {
      totalTaxes = (payroll.federalIncomeTaxUS || 0) + (payroll.stateIncomeTaxUS || 0) + 
                   (payroll.socialSecurityTax || 0) + (payroll.medicareTax || 0) + 
                   (payroll.stateDisabilityInsurance || 0) + (payroll.localTax || 0);
    }

    // Recalculate total salary including taxes
    payroll.totalSalary = payroll.baseSalary + payroll.bonus - payroll.deductions - totalTaxes;

    await payroll.save();

    // Update associated paystub if it exists
    try {
      const paystub = await Paystub.findOne({ payrollId: payroll._id });
      if (paystub) {
        // Populate user to get employee details
        await payroll.populate('userId', 'name email role internalId');
        const user = payroll.userId;

        // Calculate totals
        const grossPay = payroll.baseSalary + payroll.bonus;
        const netPay = payroll.totalSalary;

        // Update paystub
        paystub.earnings.baseSalary = payroll.baseSalary;
        paystub.earnings.bonus = payroll.bonus;
        paystub.earnings.totalEarnings = grossPay + (paystub.earnings.mileageEarnings || 0);
        paystub.earnings.regularHours = payroll.regularHours || 0;
        paystub.earnings.overtimeHours = payroll.overtimeHours || 0;
        paystub.earnings.overtime = payroll.overtimeHours && payroll.hourlyRate ? (payroll.overtimeHours * payroll.hourlyRate * 1.5) : 0;
        paystub.earnings.overtimeRate = payroll.hourlyRate ? (payroll.hourlyRate * 1.5) : 0;
        paystub.earnings.hourlyRate = payroll.hourlyRate || 0;
        paystub.deductions.totalDeductions = payroll.deductions;
        paystub.deductions.otherDeductions = payroll.deductions;

        // Update taxes based on country
        if (payroll.country === 'Canada') {
          paystub.taxesCA.federalIncomeTax = payroll.federalIncomeTaxCA || 0;
          paystub.taxesCA.provincialIncomeTax = payroll.provincialIncomeTaxCA || 0;
          paystub.taxesCA.cpp = payroll.cpp || 0;
          paystub.taxesCA.ei = payroll.ei || 0;
          paystub.taxesCA.provincialHealthTax = payroll.provincialHealthTaxCA || 0;
          paystub.taxesCA.totalTaxes = totalTaxes;
          paystub.taxesUS.totalTaxes = 0;
        } else {
          paystub.taxesUS.federalIncomeTax = payroll.federalIncomeTaxUS || 0;
          paystub.taxesUS.stateIncomeTax = payroll.stateIncomeTaxUS || 0;
          paystub.taxesUS.socialSecurityTax = payroll.socialSecurityTax || 0;
          paystub.taxesUS.medicareTax = payroll.medicareTax || 0;
          paystub.taxesUS.stateDisabilityInsurance = payroll.stateDisabilityInsurance || 0;
          paystub.taxesUS.localTax = payroll.localTax || 0;
          paystub.taxesUS.totalTaxes = totalTaxes;
          paystub.taxesCA.totalTaxes = 0;
        }

        paystub.summary.grossPay = grossPay + (paystub.earnings.mileageEarnings || 0);
        paystub.summary.totalDeductions = payroll.deductions + totalTaxes;
        paystub.summary.totalTaxes = totalTaxes;
        paystub.summary.netPay = netPay;

        if (payDate) paystub.payPeriod.payDate = new Date(payDate);
        if (startDate) paystub.payPeriod.startDate = new Date(startDate);
        if (endDate) paystub.payPeriod.endDate = new Date(endDate);

        await paystub.save();
        console.log('✅ Paystub updated successfully:', paystub._id);
      }
    } catch (paystubError) {
      console.error('⚠️ Error updating paystub (payroll still updated):', paystubError);
      // Don't fail the payroll update if paystub update fails
    }

    res.json({
      success: true,
      message: "Payroll updated successfully",
      data: payroll,
    });
  } catch (err) {
    console.error("Error updating payroll:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// ✅ Delete Payroll
export const deletePayroll = async (req, res) => {
  try {
    const { id } = req.params;

    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = { _id: id };
    if (!isSuperadmin) {
      query.company = companyId;
    }

    const payroll = await Payroll.findOneAndDelete(query);
    if (!payroll) {
      return res.status(404).json({ success: false, message: "Payroll not found" });
    }

    res.json({
      success: true,
      message: "Payroll deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting payroll:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Delete All Payrolls
export const deleteAllPayrolls = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    if (!isSuperadmin && !companyId) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to the current admin."
      });
    }

    const query = isSuperadmin ? {} : { company: companyId };

    const result = await Payroll.deleteMany(query);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} payroll record(s)`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error("Error deleting all payrolls:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};