// backend/routes/automationRoutes.js

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Import Playwright automation scripts
const searchVehicle = require('../automation/searchVehicle');

// @route   POST /api/automation/execute
// @desc    Execute automation task based on task type
// @access  Public
router.post('/execute', async (req, res) => {
    try {
        const { taskType, ...taskData } = req.body;

        console.log(`\n🤖 Automation Request Received`);
        console.log(`Task Type: ${taskType}`);
        console.log(`Data:`, taskData);

        let result;

        switch (taskType) {
            case 'search':
                console.log('🔍 Executing vehicle search automation...');
                result = await searchVehicle(taskData);
                
                // Convert captcha image to Base64 if needed
                if (result.success && result.needsCaptcha && result.captchaImage) {
                    try {
                        const imageBuffer = fs.readFileSync(result.captchaImage);
                        const base64Image = imageBuffer.toString('base64');
                        result.captchaImageBase64 = `data:image/png;base64,${base64Image}`;
                        delete result.captchaImage; // Remove file path
                    } catch (imgError) {
                        console.error('❌ Error reading captcha image:', imgError.message);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to read captcha image'
                        });
                    }
                }
                break;

            case 'register':
                console.log('📋 Vehicle registration automation coming soon...');
                result = {
                    success: false,
                    message: 'Registration automation is not yet implemented'
                };
                break;

            case 'transfer':
                console.log('🔄 Ownership transfer automation coming soon...');
                result = {
                    success: false,
                    message: 'Transfer automation is not yet implemented'
                };
                break;

            case 'update':
                console.log('✏️ Contact update automation coming soon...');
                result = {
                    success: false,
                    message: 'Update automation is not yet implemented'
                };
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
            console.log('❌ Automation failed:', result.message);
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
        availableTasks: ['search'],
        note: 'Only vehicle search is currently implemented'
    });
});

module.exports = router;