// backend/routes/automationRoutes.js

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Import Playwright automation scripts
const searchVehicle = require('../automation/searchVehicle');
const { registerVehicle } = require('../automation/registerVehicle');
const { transferOwnership } = require('../automation/transferOwnership');
const { updateContacts } = require('../automation/updateContacts');

// --- THIS FUNCTION IS NOW FIXED ---
// Helper function to handle captcha image conversion
const handleCaptchaResponse = (res, result) => {
    try {
        // 1. Store the path in a variable
        const imagePath = result.captchaImage; 

        // 2. Read the file using the variable
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        result.captchaImageBase64 = `data:image/png;base64,${base64Image}`;
        
        // 3. Delete the property from the object we're sending to the user
        delete result.captchaImage; 
        
        // 4. Delete the actual file from the server using the variable
        fs.unlinkSync(imagePath);
        
        res.status(200).json(result);
    } catch (imgError) {
        console.error('❌ Error reading/deleting captcha image:', imgError.message);
        res.status(500).json({
            success: false,
            message: 'Failed to read captcha image'
        });
    }
};
// --- END OF FIX ---

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
                if (result.success && result.needsCaptcha) {
                    return handleCaptchaResponse(res, result);
                }
                break;

            case 'register':
                console.log('📋 Executing vehicle registration automation...');
                result = await registerVehicle(taskData);
                break;

            case 'transfer':
                console.log('🔄 Executing ownership transfer automation...');
                result = await transferOwnership(taskData);
                if (result.success && result.step === 'search_captcha_sent') {
                    return handleCaptchaResponse(res, result);
                }
                break;

            case 'update':
                console.log('✏️ Executing contact update automation...');
                result = await updateContacts(taskData);
                if (result.success && result.step === 'search_captcha_sent') {
                    return handleCaptchaResponse(res, result);
                }
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
        availableTasks: ['search', 'register', 'transfer', 'update'],
        note: 'All tasks are now implemented'
    });
});

module.exports = router;