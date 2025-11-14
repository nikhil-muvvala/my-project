// backend/server.js

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db'); // Your existing main DB connection

// --- NEW: Import the Portal Login Auth Middleware ---
// Note: This path assumes your 'login-setup' folder is at 'backend/login-setup/'
const portalAuthMiddleware = require('./login-setup/middleware/auth-middleware');

// Load env variables
dotenv.config();

// Connect to Database
connectDB(); // Your existing connection

const app = express();
const PORT = process.env.PORT || 5000;

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
});