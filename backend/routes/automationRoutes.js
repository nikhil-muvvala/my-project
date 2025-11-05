// backend/routes/automationRoutes.js

const express = require('express');
const router = express.Router();

// Import Playwright automation scripts
const searchVehicle = require('../automation/searchVehicle');
const registerVehicle = require('../automation/registerVehicle');
const transferOwnership = require('../automation/transferOwnership');
const updateContacts = require('../automation/updateContacts');

// @route   POST /api/automation/execute
// @desc    Execute automation task based on task type
// @access  Public (no auth required for demonstration)
router.post('/execute', async (req, res) => {
    try {
        const { taskType, ...taskData } = req.body;

        console.log(`\n🤖 Automation Request Received`);
        console.log(`Task Type: ${taskType}`);
        console.log(`Task Data:`, taskData);

        let result;

        // Route to appropriate automation script based on task type
        switch (taskType) {
            case 'search':
                console.log('🔍 Executing vehicle search automation...');
                result = await searchVehicle(taskData);
                break;

            case 'register':
                console.log('📋 Executing vehicle registration automation...');
                result = await registerVehicle(taskData);
                break;

            case 'transfer':
                console.log('🔄 Executing ownership transfer automation...');
                result = await transferOwnership(taskData);
                break;

            case 'update':
                console.log('✏️ Executing contact update automation...');
                result = await updateContacts(taskData);
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid task type specified'
                });
        }

        // Return result
        if (result.success) {
            console.log('✅ Automation completed successfully');
            res.status(200).json(result);
        } else {
            console.log('❌ Automation failed');
            res.status(500).json(result);
        }

    } catch (error) {
        console.error('❌ Automation route error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Server error during automation: ' + error.message,
            data: null
        });
    }
});

// @route   GET /api/automation/status
// @desc    Check if automation service is running
// @access  Public
router.get('/status', (req, res) => {
    res.json({
        success: true,
        message: 'Automation service is running',
        availableTasks: ['search', 'register', 'transfer', 'update']
    });
});

module.exports = router;