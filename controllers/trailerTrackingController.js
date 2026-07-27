import { Trailer } from "../models/driver/trailerModel.js";
import { Vehicle } from "../models/driver/vehicleModel.js";

// ✅ CREATE TRAILER
export const createTrailer = async (req, res) => {
    try {
        const trailerData = {
            ...req.body,
            company: req.user.company
        };

        // Set default location if not provided
        if (!trailerData.currentLocation) {
            trailerData.currentLocation = {
                latitude: "0",
                longitude: "0",
                address: "Unknown Location"
            };
        }

        const trailer = new Trailer(trailerData);
        const savedTrailer = await trailer.save();

        console.log('✅ Trailer created successfully:', savedTrailer._id);

        res.status(201).json({
            success: true,
            message: "Trailer created successfully",
            data: savedTrailer
        });

    } catch (error) {
        console.error('❌ Error creating trailer:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET ALL TRAILERS WITH FILTERS
export const getAllTrailers = async (req, res) => {
    try {
        const {
            status,
            type,
            isAttached,
            page = 1,
            limit = 10,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log('🔄 Fetching trailers with filters:', req.query);

        const isSuperadmin = req.user?.role === 'superadmin';
        const companyId = req.user?.company;

        if (!isSuperadmin && !companyId) {
            return res.status(200).json({
                success: true,
                message: "No company assigned to the current admin.",
                data: [],
                pagination: {
                    current: parseInt(page),
                    pages: 0,
                    total: 0,
                    limit: parseInt(limit)
                }
            });
        }

        // Build filter object
        const filters = {};
        if (!isSuperadmin && companyId) {
            filters.company = companyId;
        }
        if (status) filters.status = status;
        if (type) filters.type = type;
        if (isAttached !== undefined) filters.isAttached = isAttached === 'true';

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const trailers = await Trailer.find(filters)
            .populate('attachedVehicle', 'plateNumber make model driver')
            .populate('attachedVehicle.driver', 'name')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Trailer.countDocuments(filters);

        console.log(`✅ Found ${trailers.length} trailers out of ${total} total`);

        res.status(200).json({
            success: true,
            data: trailers,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching trailers:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET TRAILER BY ID
export const getTrailerById = async (req, res) => {
    try {
        const { id } = req.params;

        console.log('🔄 Fetching trailer by ID:', id);

        const trailer = await Trailer.findById(id)
            .populate('attachedVehicle', 'plateNumber make model driver currentLocation speed status')
            .populate('attachedVehicle.driver', 'name email phone');

        if (!trailer) {
            return res.status(404).json({
                success: false,
                message: "Trailer not found"
            });
        }

        console.log('✅ Trailer found:', trailer._id);

        res.status(200).json({
            success: true,
            data: trailer
        });

    } catch (error) {
        console.error('❌ Error fetching trailer:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE TRAILER
export const updateTrailer = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        console.log('🔄 Updating trailer:', id);

        const trailer = await Trailer.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('attachedVehicle', 'plateNumber make model driver');

        if (!trailer) {
            return res.status(404).json({
                success: false,
                message: "Trailer not found"
            });
        }

        console.log('✅ Trailer updated successfully:', trailer._id);

        res.status(200).json({
            success: true,
            message: "Trailer updated successfully",
            data: trailer
        });

    } catch (error) {
        console.error('❌ Error updating trailer:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ DELETE TRAILER
export const deleteTrailer = async (req, res) => {
    try {
        const { id } = req.params;

        console.log('🔄 Deleting trailer:', id);

        const trailer = await Trailer.findByIdAndDelete(id);

        if (!trailer) {
            return res.status(404).json({
                success: false,
                message: "Trailer not found"
            });
        }

        console.log('✅ Trailer deleted successfully:', trailer._id);

        res.status(200).json({
            success: true,
            message: "Trailer deleted successfully"
        });

    } catch (error) {
        console.error('❌ Error deleting trailer:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ ATTACH TRAILER TO VEHICLE
export const attachTrailerToVehicle = async (req, res) => {
    try {
        const { trailerId, vehicleId } = req.params;

        console.log('🔄 Attaching trailer to vehicle:', trailerId, '->', vehicleId);

        // Check if trailer exists
        const trailer = await Trailer.findById(trailerId);
        if (!trailer) {
            return res.status(404).json({
                success: false,
                message: "Trailer not found"
            });
        }

        // Check if vehicle exists
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: "Vehicle not found"
            });
        }

        // Update trailer
        trailer.isAttached = true;
        trailer.attachedVehicle = vehicleId;
        trailer.status = "moving"; // Assume moving when attached
        await trailer.save();

        // Update vehicle to reference trailer
        vehicle.trailer = trailerId;
        await vehicle.save();

        console.log('✅ Trailer attached successfully:', trailerId, '->', vehicleId);

        res.status(200).json({
            success: true,
            message: "Trailer attached to vehicle successfully",
            data: {
                trailer: trailer._id,
                vehicle: vehicle._id
            }
        });

    } catch (error) {
        console.error('❌ Error attaching trailer:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ DETACH TRAILER FROM VEHICLE
export const detachTrailerFromVehicle = async (req, res) => {
    try {
        const { trailerId } = req.params;

        console.log('🔄 Detaching trailer:', trailerId);

        const trailer = await Trailer.findById(trailerId);
        if (!trailer) {
            return res.status(404).json({
                success: false,
                message: "Trailer not found"
            });
        }

        // Update trailer
        trailer.isAttached = false;
        trailer.attachedVehicle = null;
        trailer.status = "stopped"; // Assume stopped when detached
        await trailer.save();

        // Update vehicle to remove trailer reference
        if (trailer.attachedVehicle) {
            await Vehicle.findByIdAndUpdate(trailer.attachedVehicle, {
                $unset: { trailer: 1 }
            });
        }

        console.log('✅ Trailer detached successfully:', trailerId);

        res.status(200).json({
            success: true,
            message: "Trailer detached from vehicle successfully",
            data: {
                trailer: trailer._id
            }
        });

    } catch (error) {
        console.error('❌ Error detaching trailer:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ UPDATE TRAILER LOCATION (for manual updates or sensor data)
export const updateTrailerLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude, address, speed, sensors } = req.body;

        console.log('🔄 Updating trailer location:', id);

        const updateData = {
            currentLocation: {
                latitude: latitude.toString(),
                longitude: longitude.toString(),
                address: address || "Unknown Location",
                updatedAt: new Date()
            }
        };

        if (speed !== undefined) updateData.speed = speed;
        if (sensors) updateData.sensors = { ...updateData.sensors, ...sensors };

        // Add to route history
        updateData.$push = {
            route: {
                latitude: latitude.toString(),
                longitude: longitude.toString(),
                timestamp: new Date()
            }
        };

        const trailer = await Trailer.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        ).populate('attachedVehicle', 'plateNumber make model');

        if (!trailer) {
            return res.status(404).json({
                success: false,
                message: "Trailer not found"
            });
        }

        console.log('✅ Trailer location updated:', trailer._id);

        res.status(200).json({
            success: true,
            message: "Trailer location updated successfully",
            data: trailer
        });

    } catch (error) {
        console.error('❌ Error updating trailer location:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// ✅ GET TRAILER STATISTICS
export const getTrailerStats = async (req, res) => {
    try {
        console.log('🔄 Fetching trailer statistics');

        const filters = {};
        if (req.user.company) filters.company = req.user.company;

        const [
            total,
            byStatus,
            byType,
            attachedCount,
            availableCount
        ] = await Promise.all([
            Trailer.countDocuments(filters),
            Trailer.aggregate([
                { $match: filters },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),
            Trailer.aggregate([
                { $match: filters },
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]),
            Trailer.countDocuments({ ...filters, isAttached: true }),
            Trailer.countDocuments({ ...filters, isAttached: false })
        ]);

        console.log('✅ Trailer statistics fetched successfully');

        res.status(200).json({
            success: true,
            data: {
                total,
                byStatus,
                byType,
                attachedCount,
                availableCount,
                utilizationRate: total > 0 ? ((attachedCount / total) * 100).toFixed(2) : 0
            }
        });

    } catch (error) {
        console.error('❌ Error fetching trailer statistics:', error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};



