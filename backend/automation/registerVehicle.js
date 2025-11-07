// backend/automation/registerVehicle.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// We re-use the same active sessions map
const activeSessions = new Map();

// Helper to manage sessions
function getActiveSession(sessionId) {
    return activeSessions.get(sessionId);
}

function setActiveSession(sessionId, sessionData) {
    activeSessions.set(sessionId, sessionData);
}

function removeActiveSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (session) {
        session.browser.close().catch(() => {});
        activeSessions.delete(sessionId);
    }
}

async function registerVehicle(data) {
    const { email, otp, sessionId, ...vehicleDetails } = data;

    try {
        // Step 1: Send OTP (Unchanged)
        if (!sessionId && !otp) {
            console.log('📋 Step 1: Sending OTP...');
            const browser = await chromium.launch({ headless: true, slowMo: 50 });
            const context = await browser.newContext();
            const page = await context.newPage();
            
            await page.goto('http://localhost:5000', { waitUntil: 'networkidle' });
            
            await page.click('#loginBtn');
            await page.waitForSelector('#loginModal.show', { timeout: 5000 });
            await page.fill('#loginEmail', email);
            await page.click('#sendOtpBtn');
            
            // Wait for OTP form to ensure email was accepted
            await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
            
            const newSessionId = `register_${Date.now()}`;
            setActiveSession(newSessionId, { browser, context, page, email });
            
            console.log('✅ OTP Sent. Awaiting verification.');
            return {
                success: true,
                step: 'otp_sent',
                sessionId: newSessionId,
                message: 'OTP sent. Please provide OTP to continue.'
            };
        }

        // Step 2: Verify OTP (Unchanged)
        if (sessionId && otp && !vehicleDetails.ownerName) {
            console.log('📋 Step 2: Verifying OTP...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');

            const { page } = session;

            await page.fill('#loginOTP', otp);
            await page.click('#verifyOtpBtn');
            
            // Wait for login to complete (logout button appears)
            await page.waitForSelector('#logoutBtn', { state: 'visible', timeout: 15000 });
            
            console.log('✅ Login Successful. Awaiting vehicle details.');
            
            // We keep the session (browser) open!
            return {
                success: true,
                step: 'logged_in',
                sessionId: sessionId,
                message: 'Login successful. Please provide vehicle details.'
            };
        }

        // Step 3: Fill and Submit Registration Form
        if (sessionId && vehicleDetails.ownerName) {
            console.log('📋 Step 3: Filling registration form...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');

            const { browser, page } = session;
            
            // Click on e-Services (if not already there)
            await page.click('a[onclick*="services"]');
            await page.waitForTimeout(500);

            // Click on New Vehicle Registration service card
            await page.click('.service-card:has-text("New Vehicle Registration")');
            await page.waitForSelector('#newRegModal.show', { timeout: 5000 });
            console.log('✅ Opened new registration modal');

            // --- THIS IS THE FIX ---
            // Wait for the first form field to be visible and stable
            await page.waitForSelector('#newReg_ownerName', { state: 'visible', timeout: 5000 });
            await page.waitForTimeout(200); // Small buffer for CSS animation
            console.log('✅ Form is visible and ready.');
            // --- END OF FIX ---

            // Fill the form with data from the portal
            await page.fill('#newReg_ownerName', vehicleDetails.ownerName);
            await page.fill('#newReg_fatherName', vehicleDetails.fatherName);
            await page.fill('#newReg_mobile', vehicleDetails.mobile);
            await page.fill('#newReg_email', session.email); // Use the verified email
            await page.fill('#newReg_address', vehicleDetails.address);
            await page.fill('#newReg_class', vehicleDetails.vehicleClass);
            await page.fill('#newReg_model', vehicleDetails.model);
            await page.selectOption('#newReg_fuel', vehicleDetails.fuel);
            await page.fill('#newReg_color', vehicleDetails.color);
            await page.fill('#newReg_amount', vehicleDetails.price);
            
            // This line will now work
            await page.selectOption('#newReg_rto', vehicleDetails.rto);
            console.log('✅ Filled registration form');

            // Check all checkboxes
            const checkboxes = await page.$$('#newRegModal input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                await checkbox.check();
            }
            console.log('✅ Checked all document checkboxes');

            // Submit form
            await page.click('#newRegForm button[type="submit"]');
            
            // Wait for receipt modal
            await page.waitForSelector('#receiptModal.show', { timeout: 20000 });
            console.log('✅ Receipt modal opened');
            
            // Extract result
            const receiptText = await page.textContent('#receiptContentOutput');
            const regNoMatch = receiptText.match(/Vehicle Reg\. No: ([A-Z0-9]+)/);
            const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
            
            const result = {
                applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
                registrationNumber: regNoMatch ? regNoMatch[1] : 'N/A',
                ownerName: vehicleDetails.ownerName,
                model: vehicleDetails.model,
                status: 'COMPLETED',
                receiptPreview: receiptText.substring(0, 500) + '...'
            };
            
            console.log('✅ Registration completed:', result.registrationNumber);
            
            // Task is complete, clean up the session
            removeActiveSession(sessionId);
            
            return {
                success: true,
                step: 'completed',
                message: 'Vehicle registered successfully',
                data: result
            };
        }

        // If no condition is met, something is wrong
        throw new Error('Invalid request state.');

    } catch (error) {
        console.error('❌ Automation Error:', error.message);
        // Clean up on error
        removeActiveSession(sessionId);
        
        return {
            success: false,
            message: error.message || 'Automation failed',
            data: null
        };
    }
}

// Re-using the cleanup logic from your searchVehicle script
function cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [sessionId, session] of activeSessions.entries()) {
        const sessionTime = parseInt(sessionId.split('_')[1]);
        if (now - sessionTime > maxAge) {
            session.browser.close().catch(() => {});
            activeSessions.delete(sessionId);
            console.log(`🧹 Cleaned up old session: ${sessionId}`);
        }
    }
}
setInterval(cleanupOldSessions, 5 * 60 * 1000);

// We need to export an object containing all our functions
module.exports = {
    registerVehicle,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};