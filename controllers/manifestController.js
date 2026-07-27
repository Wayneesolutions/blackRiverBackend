import mongoose from 'mongoose';
import Trip from '../models/tripModel.js';
import { getUserCompanyId } from '../utils/companyFilter.js';

// GET /admin/manifests — returns trips with truck, trailer, driver, orders populated
export const getManifests = async (req, res) => {
  try {
    const companyId = getUserCompanyId(req.user);
    const isSuperadmin = req.user?.role === 'superadmin';

    const { search = '', status = '', page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Base filter
    let filter = {};
    if (!isSuperadmin && companyId) {
      const companyObjectId = mongoose.Types.ObjectId.isValid(companyId)
        ? new mongoose.Types.ObjectId(companyId)
        : null;
      if (companyObjectId) filter.company = companyObjectId;
    }

    if (status) filter.status = status;

    if (search) {
      filter.$or = [
        { tripNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const [trips, total] = await Promise.all([
      Trip.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('driver', 'name firstName lastName email phone profileImageUrl internalId details.licenceNumber details.licenceExpiry')
        .populate('coDriver', 'name firstName lastName email phone profileImageUrl internalId')
        .populate('truck', 'unitNumber plateNumber vinNumber make model year type status ownership internalId registrationCountry registrationProvince')
        .populate('trailer', 'unitNumber trailer plateNumber vinNumber make model year type status ownership internalId registrationCountry registrationProvince')
        .populate({
          path: 'orders',
          select: 'orderNumber customerOrderNo orderType status pickupLocation deliveryLocation pickupDate deliveryDate commodity weight weightUnit noOfPackages valueOfGoods pars paps trailerSealNo borderInfo shipper receiver',
          populate: { path: 'customer', select: 'name email phone customerDetails.customerId' }
        })
        .lean(),
      Trip.countDocuments(filter)
    ]);

    // Shape the response
    const manifests = trips.map(trip => ({
      id: trip._id.toString(),
      tripNumber: trip.tripNumber || 'N/A',
      status: trip.status || 'planned',
      plannedStartDate: trip.plannedStartDate || null,
      plannedEndDate: trip.plannedEndDate || null,
      actualStartDate: trip.actualStartDate || null,
      actualEndDate: trip.actualEndDate || null,
      startLocation: trip.startLocation || null,
      endLocation: trip.endLocation || null,
      notes: trip.notes || '',
      documentsApproved: trip.documentsApproved || false,
      manifest: trip.manifest || null,
      borderCompliance: trip.borderCompliance || null,
      driver: trip.driver ? {
        id: trip.driver._id?.toString(),
        name: trip.driver.name || [trip.driver.firstName, trip.driver.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
        email: trip.driver.email || '',
        phone: trip.driver.phone || '',
        profileImageUrl: trip.driver.profileImageUrl || null,
        internalId: trip.driver.internalId || '',
        licenceNumber: trip.driver.details?.licenceNumber || '',
        licenceExpiry: trip.driver.details?.licenceExpiry || null,
      } : null,
      coDriver: trip.coDriver ? {
        id: trip.coDriver._id?.toString(),
        name: trip.coDriver.name || [trip.coDriver.firstName, trip.coDriver.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
        email: trip.coDriver.email || '',
        phone: trip.coDriver.phone || '',
        internalId: trip.coDriver.internalId || '',
      } : null,
      truck: trip.truck ? {
        id: trip.truck._id?.toString(),
        unitNumber: trip.truck.unitNumber || '',
        plateNumber: trip.truck.plateNumber || '',
        vinNumber: trip.truck.vinNumber || '',
        make: trip.truck.make || '',
        model: trip.truck.model || '',
        year: trip.truck.year || '',
        type: trip.truck.type || '',
        status: trip.truck.status || '',
        ownership: trip.truck.ownership || '',
        internalId: trip.truck.internalId || '',
        registrationCountry: trip.truck.registrationCountry || '',
        registrationProvince: trip.truck.registrationProvince || '',
      } : null,
      trailer: trip.trailer ? {
        id: trip.trailer._id?.toString(),
        unitNumber: trip.trailer.unitNumber || trip.trailer.trailer || '',
        plateNumber: trip.trailer.plateNumber || '',
        vinNumber: trip.trailer.vinNumber || '',
        make: trip.trailer.make || '',
        model: trip.trailer.model || '',
        year: trip.trailer.year || '',
        type: trip.trailer.type || '',
        status: trip.trailer.status || '',
        ownership: trip.trailer.ownership || '',
        internalId: trip.trailer.internalId || '',
        registrationCountry: trip.trailer.registrationCountry || '',
        registrationProvince: trip.trailer.registrationProvince || '',
      } : null,
      orders: (trip.orders || []).map(o => ({
        id: o._id?.toString(),
        orderNumber: o.orderNumber || '',
        customerOrderNo: o.customerOrderNo || '',
        orderType: o.orderType || '',
        status: o.status || '',
        pickupLocation: o.pickupLocation?.place || '',
        deliveryLocation: o.deliveryLocation?.place || '',
        pickupDate: o.pickupDate || null,
        deliveryDate: o.deliveryDate || null,
        commodity: o.commodity || '',
        weight: o.weight || 0,
        weightUnit: o.weightUnit || '',
        noOfPackages: o.noOfPackages || 0,
        valueOfGoods: o.valueOfGoods || 0,
        pars: o.pars || '',
        paps: o.paps || '',
        trailerSealNo: o.trailerSealNo || '',
        shipper: o.shipper?.name || '',
        receiver: o.receiver?.name || '',
        customer: o.customer ? {
          id: o.customer._id?.toString(),
          name: o.customer.name || '',
          email: o.customer.email || '',
        } : null,
      })),
      orderCount: (trip.orders || []).length,
      createdAt: trip.createdAt,
    }));

    res.json({
      success: true,
      message: 'Manifests retrieved successfully',
      data: manifests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Error fetching manifests:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// GET /admin/manifests/:id
export const getManifestById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid trip ID' });
    }

    const trip = await Trip.findById(id)
      .populate('driver', 'name firstName lastName email phone profileImageUrl internalId details')
      .populate('coDriver', 'name firstName lastName email phone profileImageUrl internalId')
      .populate('truck', 'unitNumber plateNumber vinNumber make model year type status ownership internalId registrationCountry registrationProvince')
      .populate('trailer', 'unitNumber trailer plateNumber vinNumber make model year type status ownership internalId registrationCountry registrationProvince')
      .populate({
        path: 'orders',
        populate: { path: 'customer', select: 'name email phone' }
      })
      .lean();

    if (!trip) {
      return res.status(404).json({ success: false, message: 'Manifest not found' });
    }

    res.json({ success: true, data: trip });
  } catch (err) {
    console.error('Error fetching manifest by id:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
