// server.js

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// Load env variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Middleware
// Enable Cross-Origin Resource Sharing (so our frontend can talk to our backend)
app.use(cors()); 
// Allow the server to accept JSON data
app.use(express.json()); 

// Serve static files from 'frontend' directory
app.use(express.static(path.join(__dirname, '../frontend')));

// A simple test route
app.get('/', (req, res) => {
    res.send('VAHAN Backend API is running...');
});

// Use our API routes
app.use('/api', require('./routes/api'));

// NEW: Use automation routes
app.use('/api/automation', require('./routes/automationRoutes'));

// Serve the task portal on a specific route
app.get('/task-portal', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/task-portal.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🤖 Automation Portal: http://localhost:${PORT}/task-portal`);
    console.log(`🚗 VAHAN Portal: http://localhost:3000`);
});