// backend/routes/api.js

const express = require('express');
const router = express.Router();
const Vehicle = require('../models/vehicleModel');
const User = require('../models/userModel');

// --- NEW: Import our security middleware ---
const { protect } = require('../middleware/authMiddleware');

// --- Authentication Routes ---
router.use('/auth', require('./authRoutes'));


// --- ============================ ---
// --- SECURED VEHICLE ROUTES ---
// --- ============================ ---

// @route   POST /api/vehicle/register
// @desc    Register a new vehicle
// @access  Private (Requires Login)
router.post('/vehicle/register', protect, async (req, res) => {
    try {
        // req.user is available because of the 'protect' middleware
        const loggedInUser = req.user;

        // Get new vehicle data from the request body
        const { regNo, regDate, rto, class: vClass, fuel, model, year, engine, chassis, color, seating, ...ownerDetails } = req.body;
        
        // 1. Create the new vehicle
        const newVehicle = new Vehicle({
            ...req.body,
            owner: loggedInUser.id, // Link to the logged-in user
            ownerName: loggedInUser.name,
            email: loggedInUser.email
        });
        await newVehicle.save();

        // 2. Add this new vehicle to the User's 'vehicles' array
        const updatedUser = await User.findByIdAndUpdate(
            loggedInUser.id,
            { $push: { vehicles: newVehicle._id } },
            { new: true, fields: '-otp -otpExpires' } // 'new: true' returns the updated doc
        );
        
        // 3. Send back the updated user object (with the new vehicle list)
        res.status(201).json({ msg: 'Vehicle registered successfully', user: updatedUser, vehicle: newVehicle });

    } catch (err) {
        console.error(err.message);
        if (err.code === 11000) { // Handle duplicate regNo
            return res.status(400).json({ msg: 'This Registration Number already exists.' });
        }
        res.status(500).send('Server Error');
    }
});


// @route   PUT /api/vehicle/transfer/:regNo
// @desc    Transfer ownership of a vehicle
// @access  Private (Requires Ownership)
router.put('/vehicle/transfer/:regNo', protect, async (req, res) => {
    try {
        const loggedInUser = req.user;
        const regNo = req.params.regNo.toUpperCase();

        // Find the vehicle
        const vehicle = await Vehicle.findOne({ regNo: regNo });
        if (!vehicle) {
            return res.status(404).json({ msg: 'Vehicle not found' });
        }

        // --- â­ï¸ OWNERSHIP CHECK â­ï¸ ---
        if (vehicle.owner.toString() !== loggedInUser.id) {
            // This is your custom error message!
            return res.status(403).json({ msg: 'This action can only be done by the owner or RTO office.' });
        }

        // --- OWNERSHIP CONFIRMED, PROCEED WITH TRANSFER ---

        const { newOwnerEmail, newOwnerName, newOwnerFather, newOwnerMobile, newOwnerAddress } = req.body;

        // 1. Find or create the new owner
        let newOwner = await User.findOne({ email: newOwnerEmail.toLowerCase() });
        if (!newOwner) {
            newOwner = new User({
                email: newOwnerEmail.toLowerCase(),
                name: newOwnerName.toUpperCase(),
            });
        }
        
        // 2. Update new owner's vehicle list
        newOwner.vehicles.push(vehicle._id);
        await newOwner.save();
        
        // 3. Remove vehicle from old owner (the logged-in user)
        const updatedOldOwner = await User.findByIdAndUpdate(
            loggedInUser.id,
            { $pull: { vehicles: vehicle._id } },
            { new: true, fields: '-otp -otpExpires' }
        );

        // 4. Update the Vehicle document itself
        vehicle.owner = newOwner._id;
        vehicle.ownerName = newOwner.name.toUpperCase();
        vehicle.fatherName = newOwnerFather;
        vehicle.mobile = newOwnerMobile;
        vehicle.email = newOwner.email;
        vehicle.address = newOwnerAddress;
        vehicle.permAddress = newOwnerAddress;
        await vehicle.save();

        res.json({ msg: 'Transfer successful', vehicle: vehicle, user: updatedOldOwner });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   PUT /api/vehicle/update/:regNo
// @desc    Update contact details for a vehicle
// @access  Private (Requires Ownership)
router.put('/vehicle/update/:regNo', protect, async (req, res) => {
    try {
        const loggedInUser = req.user;
        const regNo = req.params.regNo.toUpperCase();
        
        // Find the vehicle
        const vehicle = await Vehicle.findOne({ regNo: regNo });
        if (!vehicle) {
            return res.status(404).json({ msg: 'Vehicle not found' });
        }

        // --- â­ï¸ OWNERSHIP CHECK â­ï¸ ---
        if (vehicle.owner.toString() !== loggedInUser.id) {
            // This is your custom error message!
            return res.status(403).json({ msg: 'This action can only be done by the owner or RTO office.' });
        }
        
        // --- OWNERSHIP CONFIRMED, PROCEED WITH UPDATE ---
        
        const { newAddress, newMobile, newEmail } = req.body;

        // Update the vehicle document
        vehicle.address = newAddress;
        vehicle.permAddress = newAddress;
        vehicle.mobile = newMobile;
        vehicle.email = newEmail;
        await vehicle.save();
        
        // Also update the owner's main User document
        loggedInUser.email = newEmail; // Note: This could be more complex
        await loggedInUser.save();

        res.json({ msg: 'Details updated successfully', vehicle: vehicle });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// --- ============================ ---
// --- USER ROUTES (NEW!) ---
// --- ============================ ---

// @route   GET /api/user/vehicles
// @desc    Get all vehicles for the logged-in user
// @access  Private (Requires Login)


// @route   GET /api/user/profile
// @desc    Get current user's profile
// @access  Private (Requires Login)
// Add these routes to your backend/routes/api.js file
// Place them after the vehicle/register route and before the public routes

// @route   GET /api/user/vehicles
// @desc    Get all vehicles for the logged-in user
// @access  Private (Requires Login)
router.get('/user/vehicles', protect, async (req, res) => {
    try {
        const loggedInUser = req.user;
        
        // Populate the vehicles array with full vehicle documents
        const user = await User.findById(loggedInUser.id)
            .populate('vehicles')
            .select('-otp -otpExpires');
        
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        
        res.json({ vehicles: user.vehicles });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/user/profile
// @desc    Get current user's profile
// @access  Private (Requires Login)
router.get('/user/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('vehicles')
            .select('-otp -otpExpires');
        
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        
        res.json({ user });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// --- ============================ ---
// --- PUBLIC & HELPER ROUTES ---
// --- ============================ ---

// @route   GET /api/vehicle/:regNo
// @desc    Get vehicle details (Public search)
// @access  Public
router.get('/vehicle/:regNo', async (req, res) => {
    try {
        const regNo = req.params.regNo.toUpperCase();
        const vehicle = await Vehicle.findOne({ regNo: regNo });
        if (!vehicle) {
            return res.status(404).json({ msg: 'Vehicle not found' });
        }
        res.json(vehicle);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/seed
// @desc    (Helper) Add all mock data to the database
// @access  Public
router.post('/seed', async (req, res) => {
    try {
        await Vehicle.deleteMany({});
        await User.deleteMany({});

        const user1 = await new User({ email: 'rajesh.kumar@email.com', name: 'RAJESH KUMAR' }).save();
        const user2 = await new User({ email: 'priya.sharma@email.com', name: 'PRIYA SHARMA' }).save();
        const user3 = await new User({ email: 'amit.patel@email.com', name: 'AMIT PATEL' }).save();

        const v1 = new Vehicle({
            owner: user1._id,
            regNo: 'DL01AB1234',
            regDate: '15/03/2020',
            rto: 'RTO Delhi (DL-01), Burari',
            class: 'Motor Car/Light Motor Vehicle (LMV)',
            fuel: 'Petrol',
            model: 'MARUTI SUZUKI SWIFT VXI',
            year: '2020',
            engine: 'K12M' + Math.floor(Math.random() * 100000),
            chassis: 'MA3E' + Math.floor(Math.random() * 1000000000),
            color: 'White',
            seating: '5',
            insCompany: 'ICICI Lombard General Insurance',
            policyNo: 'POL/2024/' + Math.floor(Math.random() * 100000),
            insFrom: '15/03/2024',
            insUpto: '14/03/2025',
            insStatus: 'active',
            fitnessUpto: '14/03/2035',
            fitnessStatus: 'active',
            pucNo: 'PUC/DL/' + Math.floor(Math.random() * 100000),
            pucUpto: '14/09/2025',
            pucStatus: 'active',
            taxUpto: '14/03/2025',
            ownerName: 'RAJESH KUMAR',
            fatherName: 'SURESH KUMAR',
            mobile: '9876543210',
            email: 'rajesh.kumar@email.com',
            address: 'House No. 123, Sector 15, Rohini, New Delhi - 110085',
            permAddress: 'House No. 123, Sector 15, Rohini, New Delhi - 110085',
            financer: 'No Hypothecation'
        });
        await v1.save();
        
        const v2 = new Vehicle({
            owner: user2._id,
            regNo: 'MH01XY5678',
            regDate: '22/07/2019',
            rto: 'RTO Mumbai (MH-01), Tardeo',
            class: 'Motor Cycle/Scooter',
            fuel: 'Petrol',
            model: 'HONDA ACTIVA 6G',
            year: '2019',
            engine: 'HET' + Math.floor(Math.random() * 100000),
            chassis: 'ME4' + Math.floor(Math.random() * 1000000000),
            color: 'Black',
            seating: '2',
            insCompany: 'Bajaj Allianz General Insurance',
            policyNo: 'POL/2024/' + Math.floor(Math.random() * 100000),
            insFrom: '22/07/2024',
            insUpto: '21/07/2025',
            insStatus: 'active',
            fitnessUpto: '21/07/2034',
            fitnessStatus: 'active',
            pucNo: 'PUC/MH/' + Math.floor(Math.random() * 100000),
            pucUpto: '21/01/2025',
            pucStatus: 'warning',
            taxUpto: '21/07/2025',
            ownerName: 'PRIYA SHARMA',
            fatherName: 'VIJAY SHARMA',
            mobile: '9123456789',
            email: 'priya.sharma@email.com',
            address: 'Flat 301, Sunrise Apartments, Andheri West, Mumbai - 400053',
            permAddress: 'Flat 301, Sunrise Apartments, Andheri West, Mumbai - 400053',
            financer: 'HDFC Bank Ltd.'
        });
        await v2.save();
        
        const v3 = new Vehicle({
            owner: user3._id,
            regNo: 'KA03PQ9876',
            regDate: '10/11/2021',
            rto: 'RTO Bangalore (KA-03), Yeshwanthpur',
            class: 'Sport Utility Vehicle (SUV)',
            fuel: 'Diesel',
            model: 'HYUNDAI CRETA SX',
            year: '2021',
            engine: 'D4FB' + Math.floor(Math.random() * 100000),
            chassis: 'MAL' + Math.floor(Math.random() * 1000000000),
            color: 'Grey',
            seating: '7',
            insCompany: 'TATA AIG General Insurance',
            policyNo: 'POL/2024/' + Math.floor(Math.random() * 100000),
            insFrom: '10/11/2024',
            insUpto: '09/11/2025',
            insStatus: 'active',
            fitnessUpto: '09/11/2036',
            fitnessStatus: 'active',
            pucNo: 'PUC/KA/' + Math.floor(Math.random() * 100000),
            pucUpto: '09/05/2025',
            pucStatus: 'active',
            taxUpto: '09/11/2025',
            ownerName: 'AMIT PATEL',
            fatherName: 'RAMESH PATEL',
            mobile: '9988776655',
            email: 'amit.patel@email.com',
            address: 'Plot 45, Whitefield Main Road, Bangalore - 560066',
            permAddress: 'Plot 45, Whitefield Main Road, Bangalore - 560066',
            financer: 'No Hypothecation'
        });
        await v3.save();

        user1.vehicles.push(v1._id); await user1.save();
        user2.vehicles.push(v2._id); await user2.save();
        user3.vehicles.push(v3._id); await user3.save();
        
        console.log('Database seeded successfully!');
        res.status(201).json({ msg: 'Database seeded successfully!' });
    } catch (err) {
        console.error('Seeding error:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;