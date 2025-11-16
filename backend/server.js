// backend/server.js

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/db'); // Your existing main DB connection

// --- NEW: Import the Portal Login Auth Middleware ---
// Note: This path assumes your 'login-setup' folder is at 'backend/login-setup/'
const portalAuthMiddleware = require('./login-setup/middleware/auth-middleware');

// Load env variables
dotenv.config();

// Connect to Database
connectDB(); // Your existing connection

// --- E-ID DATABASE CONNECTION (Separate Connection) ---
const EID_MONGO_URI = process.env.EID_MONGO_URI || 'mongodb+srv://cs24b012_db_user:tranquility%40123@storage-e-id.joof12t.mongodb.net/eidDatabase?appName=storage-e-id';

// Create a separate connection for E-ID database
const eidConnection = mongoose.createConnection(EID_MONGO_URI);

// E-ID Database Model (using the separate connection)
const eidUserSchema = new mongoose.Schema({
    eId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true },
    phone: { type: String, required: true, unique: true, index: true },
    address: { type: String, required: true },
    issued: { type: Date, default: Date.now }
});

const EidUser = eidConnection.model('EidUser', eidUserSchema);

// Handle E-ID Database connection events
eidConnection.on('connected', () => {
    console.log('✅ Successfully connected to E-ID MongoDB!');
});

eidConnection.on('error', (error) => {
    console.error('❌ E-ID MongoDB connection error:', error);
});

eidConnection.on('disconnected', () => {
    console.log('⚠️ E-ID MongoDB disconnected');
});

// Connect to E-ID Database
console.log("Connecting to E-ID MongoDB...");

const app = express();
// --- DEPLOYMENT FIX: Use Render's port, or 3000 for E-ID portal, or 5000 for local ---
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); 
app.use(express.json()); 

// --- Page Routes (MUST come before static) ---

// 1. Root redirects to login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// 2. Route to serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// 3. Route to serve the register page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/register.html'));
});

// 4. Route to serve the (now protected) task portal
app.get('/task-portal', (req, res) => {
    // This file is protected by the 'task-portal-auth.js' script
    // which runs in the user's browser.
    res.sendFile(path.join(__dirname, '../frontend/task-portal.html'));
});

// --- Static Frontend Server ---
// This serves all other files like index.html, script.js, styles.css
app.use(express.static(path.join(__dirname, '../frontend')));


// --- E-ID API ROUTES (Must come before other /api routes to avoid conflicts) ---

/**
 * @route   POST /api/register
 * @desc    Register a new E-ID user
 */
app.post('/api/register', async (req, res) => {
    try {
        const { name, dob, gender, phone, address } = req.body;

        const existingUser = await EidUser.findOne({ phone: phone });
        if (existingUser) {
            console.log('Registration failed: Phone number already in use.');
            return res.status(409).json({ message: 'User already registered with this phone number.' });
        }

        let newEId = '';
        let isUnique = false;
        while (!isUnique) {
            newEId = String(Math.floor(100000000000 + Math.random() * 900000000000));
            const idExists = await EidUser.findOne({ eId: newEId });
            if (!idExists) {
                isUnique = true;
            }
        }

        const newUser = new EidUser({
            eId: newEId,
            name,
            dob,
            gender,
            phone,
            address,
            issued: new Date()
        });

        await newUser.save();
        console.log('New E-ID user registered:', newUser);
        res.status(201).json(newUser);

    } catch (error) {
        console.error('E-ID Registration error:', error);
        if (error.code === 11000) {
             return res.status(409).json({ message: 'A user with this phone number or E-ID already exists.' });
        }
        res.status(500).json({ message: 'Server error during registration.', error: error.message });
    }
});

/**
 * @route   GET /api/search/:eId
 * @desc    Search for an E-ID user by E-ID number
 */
app.get('/api/search/:eId', async (req, res) => {
    try {
        const eIdToFind = req.params.eId;

        if (!eIdToFind || eIdToFind.length !== 12 || !/^\d+$/.test(eIdToFind)) {
            return res.status(400).json({ message: 'Invalid E-ID format. Must be 12 digits.' });
        }

        const user = await EidUser.findOne({ eId: eIdToFind });

        if (!user) {
            console.log(`E-ID Search failed: E-ID ${eIdToFind} not found.`);
            return res.status(404).json({ message: 'No E-ID record found for this number.' });
        }

        console.log('E-ID User found:', user);
        res.status(200).json(user);

    } catch (error) {
        console.error('E-ID Search error:', error);
        res.status(500).json({ message: 'Server error during search.', error: error.message });
    }
});

/**
 * @route   PUT /api/update
 * @desc    Update E-ID user information
 */
app.put('/api/update', async (req, res) => {
    try {
        const { eId, name, phone, address } = req.body;

        if (!eId) {
            return res.status(400).json({ message: 'E-ID is required for updates.' });
        }

        const user = await EidUser.findOne({ eId: eId });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const updates = {};
        if (name) updates.name = name;
        if (address) updates.address = address;

        if (phone && phone !== user.phone) {
            const existingUser = await EidUser.findOne({ phone: phone });
            if (existingUser) {
                return res.status(409).json({ message: 'This phone number is already registered to another user.' });
            }
            updates.phone = phone;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided for update.' });
        }

        const updatedUser = await EidUser.findOneAndUpdate(
            { eId: eId },
            { $set: updates },
            { new: true }
        );

        console.log('E-ID User updated:', updatedUser);
        res.status(200).json(updatedUser);

    } catch (error) {
        console.error('E-ID Update error:', error);
        if (error.code === 11000) {
             return res.status(409).json({ message: 'This phone number is already registered to another user.' });
        }
        res.status(500).json({ message: 'Server error during update.', error: error.message });
    }
});

// --- API Routes ---
// Your existing API routes (UNCHANGED)
app.use('/api', require('./routes/api'));
app.use('/api/automation', require('./routes/automationRoutes'));
app.use('/api/brain', require('./routes/brainRoutes'));

// --- NEW: Add the routes for the Portal Login/Register system ---
// This points to the auth-routes.js you provided
app.use('/api/portal-auth', require('./login-setup/routes/auth-routes'));


// Start the server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔒 Login Portal: http://localhost:${PORT}`);
    console.log(`🚗 VAHAN Portal (Replica): http://localhost:${PORT}/index.html`);
    console.log(`🤖 Automation Portal (Protected): http://localhost:${PORT}/task-portal`);
    console.log(`🆔 E-ID Mock Portal: http://localhost:${PORT}/eid-mock-portal.html`);
});