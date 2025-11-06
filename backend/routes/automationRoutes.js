// backend/routes/automationRoutes.js

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Import Playwright automation scripts
const searchVehicle = require('../automation/searchVehicle');
const registerVehicle = require('../automation/registerVehicle');
const transferOwnership = require('../automation/transferOwnership');
const updateContacts = require('../automation/updateContacts');

// @route   POST /api/automation/execute
// @desc    Execute automation task based on task type
// @access  Public
router.post('/execute', async (req, res) => {
    try {
        const { taskType, ...taskData } = req.body;

        console.log(`\n🤖 Automation Request Received`);
        console.log(`Task Type: ${taskType}`);
        console.log(`Step:`, taskData.step || 'initial');

        let result;

        switch (taskType) {
            case 'search':
                console.log('🔍 Executing vehicle search automation...');
                result = await searchVehicle(taskData);
                
                // --- THIS IS THE MODIFICATION ---
                // If captcha is needed, read the image file and send it as Base64
                if (result.success && result.needsCaptcha && result.captchaImage) {
                    const imageBuffer = fs.readFileSync(result.captchaImage);
                    const base64Image = imageBuffer.toString('base64');
                    // This is what the <img> tag in the HTML will use
                    result.captchaImageBase64 = `data:image/png;base64,${base64Image}`;
                    // We don't need to send the file path
                    delete result.captchaImage; 
                }
                // --- END OF MODIFICATION ---
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

        if (result.success) {
            console.log('✅ Automation step completed');
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