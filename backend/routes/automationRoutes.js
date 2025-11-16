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
// --- NEW SCRIPT IMPORTED ---
const { freshPassport } = require('../automation/freshPassport');
const { registerEid } = require('../automation/registerEid');
const { searchEid } = require('../automation/searchEid');
const { updateEid } = require('../automation/updateEid');

// Helper function to convert image to base64
const convertImageToBase64 = (imagePath) => {
    try {
        if (!imagePath || !fs.existsSync(imagePath)) return null;
        const imageBuffer = fs.readFileSync(imagePath);
        return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
        console.error('❌ Error converting image to base64:', error.message);
        return null;
    }
};

// Helper function to handle captcha image conversion
const handleCaptchaResponse = (res, result) => {
    try {
        // Convert captcha image
        if (result.captchaImage) {
            result.captchaImageBase64 = convertImageToBase64(result.captchaImage);
            // Don't delete captcha image yet - user might need it
        }
        
        // Convert any screenshots
        if (result.screenshots) {
            result.screenshotsBase64 = {};
            for (const [key, path] of Object.entries(result.screenshots)) {
                result.screenshotsBase64[key] = convertImageToBase64(path);
            }
        }
        
        // Convert single screenshot if present
        if (result.screenshot) {
            result.screenshotBase64 = convertImageToBase64(result.screenshot);
        }
        
        res.status(200).json(result);
    } catch (imgError) {
        console.error('❌ Error processing images:', imgError.message);
        res.status(500).json({
            success: false,
            message: 'Failed to process images'
        });
    }
};

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

            // --- NEW CASE FOR PASSPORT ---
            case 'passport_fresh':
                console.log('🛂 Executing fresh passport automation...');
                result = await freshPassport(taskData);
                if (result.success && result.step === 'captcha_sent') {
                    return handleCaptchaResponse(res, result);
                }
                break;
            // --- END OF NEW CASE ---

            // --- NEW CASE FOR E-ID REGISTRATION ---
            case 'eid_register':
                console.log('🆔 Executing E-ID registration automation...');
                result = await registerEid(taskData);
                // Always handle response to convert screenshots to base64
                if (result.success) {
                    if (result.step === 'captcha_sent' || result.screenshots || result.screenshot) {
                        return handleCaptchaResponse(res, result);
                    }
                } else if (result.screenshot) {
                    // Even errors might have screenshots
                    return handleCaptchaResponse(res, result);
                }
                break;
            // --- END OF NEW CASE ---

            // --- NEW CASE FOR E-ID SEARCH ---
            case 'eid_search':
                console.log('🔍 Executing E-ID search automation...');
                result = await searchEid(taskData);
                // Always handle response to convert screenshots to base64
                if (result.screenshots || result.screenshot) {
                    return handleCaptchaResponse(res, result);
                }
                break;
            // --- END OF NEW CASE ---

            // --- NEW CASE FOR E-ID UPDATE ---
            case 'eid_update':
                console.log('✏️ Executing E-ID update automation...');
                result = await updateEid(taskData);
                // Always handle response to convert screenshots to base64
                if (result.success) {
                    if (result.step === 'captcha_sent' || result.screenshots || result.screenshot) {
                        return handleCaptchaResponse(res, result);
                    }
                } else if (result.screenshot) {
                    // Even errors might have screenshots
                    return handleCaptchaResponse(res, result);
                }
                break;
            // --- END OF NEW CASE ---

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
        availableTasks: ['search', 'register', 'transfer', 'update', 'passport_fresh', 'eid_register', 'eid_search', 'eid_update'], // Added new task
        note: 'All tasks are now implemented'
    });
});

module.exports = router;