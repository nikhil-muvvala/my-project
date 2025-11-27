// backend/automation/registerVehicle.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const activeSessions = new Map();

function getActiveSession(sessionId) { return activeSessions.get(sessionId); }
function setActiveSession(sessionId, sessionData) { activeSessions.set(sessionId, sessionData); }
function removeActiveSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (session) {
        session.browser.close().catch(() => {});
        activeSessions.delete(sessionId);
    }
}

// Helper map to convert state names/codes
const stateNameToCode = {
    'ANDHRA PRADESH': 'AP', 'ARUNACHAL PRADESH': 'AR', 'ASSAM': 'AS', 'BIHAR': 'BR',
    'CHHATTISGARH': 'CG', 'GOA': 'GA', 'GUJARAT': 'GJ', 'HARYANA': 'HR', 'HIMACHAL PRADESH': 'HP',
    'JAMMU AND KASHMIR': 'JK', 'JHARKHAND': 'JH', 'KARNATAKA': 'KA', 'KERALA': 'KL', 'MADHYA PRADESH': 'MP',
    'MAHARASHTRA': 'MH', 'MANIPUR': 'MN', 'MEGHALAYA': 'ML', 'MIZORAM': 'MZ', 'NAGALAND': 'NL',
    'ODISHA': 'OD', 'PUNJAB': 'PB', 'RAJASTHAN': 'RJ', 'SIKKIM': 'SK', 'TAMIL NADU': 'TN',
    'TELANGANA': 'TS', 'TRIPURA': 'TR', 'UTTAR PRADESH': 'UP', 'UTTARAKHAND': 'UK',
    'WEST BENGAL': 'WB', 'ANDAMAN AND NICOBAR': 'AN', 'CHANDIGARH': 'CH', 'DAMAN AND DIU': 'DD',
    'DELHI': 'DL', 'LADAKH': 'LA', 'LAKSHADWEEP': 'LD', 'PUDUCHERRY': 'PY'
};
const capitalize = (s) => {
    if (typeof s !== 'string' || s.length === 0) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};


async function registerVehicle(data) {
    const { email, otp, sessionId, ...vehicleDetails } = data;

    try {
        // Step 1: Send OTP
        if (!sessionId && !otp) {
            console.log('📋 Step 1: Sending OTP...');
            const browser = await chromium.launch({ headless: true, slowMo: 50 });
            const context = await browser.newContext();
            const page = await context.newPage();
            
            // --- THIS IS THE FIX ---
            await page.goto('http://localhost:5000/index.html', { waitUntil: 'networkidle' });
            // --- END OF FIX ---
            
            await page.click('#loginBtn');
            await page.waitForSelector('#loginModal.show', { timeout: 5000 });
            await page.fill('#loginEmail', email);
            await page.click('#sendOtpBtn');
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

        // Step 2: Verify OTP
        if (sessionId && otp && !vehicleDetails.ownerName) {
            console.log('📋 Step 2: Verifying OTP...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');
            const { page } = session;

            await page.fill('#loginOTP', otp);
            await page.click('#verifyOtpBtn');
            await page.waitForSelector('#logoutBtn', { state: 'visible', timeout: 15000 });
            
            console.log('✅ Login Successful. Awaiting vehicle details.');
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
            
            // Navigate to services section
            try {
                const servicesLink = await page.$('a[onclick*="services"]');
                if (servicesLink) {
                    await servicesLink.click();
                    await page.waitForTimeout(500);
                }
            } catch (e) {
                console.log('⚠️ Services link not found or already on services page');
            }

            // Click on New Vehicle Registration
            try {
                await page.click('.service-card:has-text("New Vehicle Registration")');
                await page.waitForSelector('#newRegModal.show', { timeout: 8000 });
                console.log('✅ Opened new registration modal');
            } catch (e) {
                // Try alternative selector
                const regButton = await page.$('button:has-text("New Vehicle Registration"), .service-card');
                if (regButton) {
                    await regButton.click();
                    await page.waitForSelector('#newRegModal.show', { timeout: 8000 });
                    console.log('✅ Opened new registration modal (alternative method)');
                } else {
                    throw new Error('Could not find New Vehicle Registration button');
                }
            }

            await page.waitForSelector('#newReg_ownerName', { state: 'visible', timeout: 8000 });
            await page.waitForTimeout(300); 
            console.log('✅ Form is visible and ready.');

            await page.fill('#newReg_ownerName', vehicleDetails.ownerName);
            await page.fill('#newReg_fatherName', vehicleDetails.fatherName);
            await page.fill('#newReg_mobile', vehicleDetails.mobile);
            await page.fill('#newReg_email', session.email); 
            await page.fill('#newReg_address', vehicleDetails.address);
            await page.fill('#newReg_class', vehicleDetails.vehicleClass);
            await page.fill('#newReg_model', vehicleDetails.model);
            
            const fuelType = capitalize(vehicleDetails.fuel);
            await page.selectOption('#newReg_fuel', { label: fuelType });

            await page.fill('#newReg_color', vehicleDetails.color);
            await page.fill('#newReg_amount', vehicleDetails.price);

            const rtoInput = vehicleDetails.rto.toUpperCase();
            const rtoCode = stateNameToCode[rtoInput] || rtoInput; 
            await page.selectOption('#newReg_rto', rtoCode); 
            console.log('✅ Filled registration form');

            const checkboxes = await page.$$('#newRegModal input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                await checkbox.check();
            }
            console.log('✅ Checked all document checkboxes');

            await page.click('#newRegForm button[type="submit"]');
            console.log('✅ Submit button clicked, waiting for receipt...');
            
            // Wait for receipt modal with better error handling
            try {
                await page.waitForSelector('#receiptModal.show', { timeout: 25000 });
                console.log('✅ Receipt modal opened');
                
                // Wait a bit for content to load
                await page.waitForTimeout(1000);
                
                const receiptText = await page.textContent('#receiptContentOutput');
                if (!receiptText) {
                    throw new Error('Receipt content not found');
                }
                
                const regNoMatch = receiptText.match(/Vehicle Reg\. No: ([A-Z0-9]+)/);
                const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
                
                const result = {
                    applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
                    registrationNumber: regNoMatch ? regNoMatch[1] : 'N/A',
                    ownerName: vehicleDetails.ownerName,
                    model: vehicleDetails.model,
                    status: 'COMPLETED'
                };
                
                console.log('✅ Registration completed:', result.registrationNumber);
                
                removeActiveSession(sessionId);
                
                return {
                    success: true,
                    step: 'completed',
                    message: 'Vehicle registered successfully',
                    data: result
                };
            } catch (waitError) {
                // Check if there's an error message on the page
                const errorElement = await page.$('.alert-danger, .error-message, #newRegModal .alert');
                if (errorElement) {
                    const errorText = await errorElement.textContent();
                    throw new Error(`Registration failed: ${errorText.trim() || 'Unknown error'}`);
                }
                throw new Error(`Failed to get receipt: ${waitError.message}`);
            }
        }

        throw new Error('Invalid request state.');

    } catch (error) {
        console.error('❌ Automation Error:', error.message);
        removeActiveSession(sessionId);
        
        return {
            success: false,
            message: error.message || 'Automation failed',
            data: null
        };
    }
}

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

module.exports = {
    registerVehicle,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};
