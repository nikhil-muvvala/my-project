// backend/automation/transferOwnership.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// We re-use the same active sessions map from other scripts
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

async function transferOwnership(data) {
    const { email, otp, sessionId, regNo, state, searchCaptcha, ...transferDetails } = data;

    try {
        // Step 1: Send OTP (Unchanged)
        if (!sessionId && !otp) {
            console.log('🔄 Step 1 (Transfer): Sending OTP...');
            const browser = await chromium.launch({ headless: true, slowMo: 50 });
            const context = await browser.newContext();
            const page = await context.newPage();
            
            await page.goto('http://localhost:5000', { waitUntil: 'networkidle' });
            
            await page.click('#loginBtn');
            await page.waitForSelector('#loginModal.show', { timeout: 5000 });
            await page.fill('#loginEmail', email);
            await page.click('#sendOtpBtn');
            
            await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
            
            const newSessionId = `transfer_${Date.now()}`;
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
        if (sessionId && otp && !regNo) {
            console.log('🔄 Step 2 (Transfer): Verifying OTP...');
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
                message: 'Login successful. Please provide vehicle registration number.'
            };
        }

        // Step 3: Get Search Captcha
        if (sessionId && regNo && !searchCaptcha) {
            console.log('🔄 Step 3 (Transfer): Getting search captcha...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');
            const { page } = session;

            // --- THIS IS THE FIX ---
            // After login, the dashboard is visible. We must click "Home" to see the search card.
            console.log('... Navigating back to Home to find search card');
            await page.click('a[onclick*="showSection(\'home\')"]');
            await page.waitForSelector('#searchCard', { state: 'visible', timeout: 5000 });
            console.log('✅ Home screen visible.');
            // --- END OF FIX ---
            
            await page.fill('#regNumber', regNo);
            await page.selectOption('#stateSelect', state);
            console.log(`✅ Filled search form for ${regNo}`);

            await page.waitForSelector('#captchaDisplay');
            await page.waitForTimeout(500); // Wait for render
            const captchaElement = await page.$('#captchaDisplay');

            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)){ fs.mkdirSync(screenshotsDir); }
            
            const screenshotPath = path.join(screenshotsDir, `captcha_transfer_${sessionId}.png`);
            await captchaElement.screenshot({ path: screenshotPath });

            console.log('✅ Search captcha screenshot saved.');
            return {
                success: true,
                step: 'search_captcha_sent',
                sessionId: sessionId,
                captchaImage: screenshotPath,
                message: 'Please provide the search captcha.'
            };
        }

        // Step 4: Submit Search & Open Transfer Modal
        if (sessionId && searchCaptcha && !transferDetails.newOwnerName) {
            console.log('🔄 Step 4 (Transfer): Submitting search...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');
            const { page } = session;

            // This line is here in case the user re-runs this step
            // It will fail if the search card isn't visible, so we make sure
            const isSearchCardVisible = await page.isVisible('#searchCard');
            if (!isSearchCardVisible) {
                console.log('... Search card not visible, re-navigating to Home');
                await page.click('a[onclick*="showSection(\'home\')"]');
                await page.waitForSelector('#searchCard', { state: 'visible', timeout: 5000 });
                // Re-fill the form
                await page.fill('#regNumber', regNo);
                await page.selectOption('#stateSelect', state);
            }

            await page.fill('#captchaInput', searchCaptcha);
            await page.click('button[type="submit"]');
            
            await page.waitForSelector('#resultCard', { state: 'visible', timeout: 15000 });
            console.log('✅ Vehicle search successful.');

            // Scroll to the button
            await page.evaluate(() => {
                document.querySelector('button[onclick="showTransferModal()"]').scrollIntoView();
            });

            await page.click('button[onclick="showTransferModal()"]');
            await page.waitForSelector('#transferModal.show', { timeout: 5000 });
            console.log('✅ Transfer modal opened.');

            // We keep the session open for the final step
            return {
                success: true,
                step: 'modal_open',
                sessionId: sessionId,
                message: 'Vehicle found and transfer modal is open. Please provide new owner details.'
            };
        }

        // Step 5: Fill and Submit Transfer Form (Unchanged)
        if (sessionId && transferDetails.newOwnerName) {
            console.log('🔄 Step 5 (Transfer): Submitting final transfer...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');
            const { browser, page } = session;

            // Fill transfer details
            await page.fill('#trans_newOwner', transferDetails.newOwnerName);
            await page.fill('#trans_newFather', transferDetails.newOwnerFather);
            await page.fill('#trans_newMobile', transferDetails.newOwnerMobile);
            await page.fill('#trans_newEmail', transferDetails.newOwnerEmail);
            await page.fill('#trans_newAddress', transferDetails.newOwnerAddress);
            await page.fill('#trans_amount', transferDetails.saleAmount);
            await page.fill('#trans_date', new Date().toISOString().split('T')[0]); // Use today's date
            
            const checkboxes = await page.$$('#transferModal input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                await checkbox.check();
            }
            console.log('✅ Filled transfer form and checked documents.');

            await page.click('#transferForm button[type="submit"]');
            await page.waitForSelector('#receiptModal.show', { timeout: 20000 });
            console.log('✅ Receipt modal opened');
            
            // Extract result
            const receiptText = await page.textContent('#receiptContentOutput');
            const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
            
            const result = {
                applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
                vehicleRegNo: regNo,
                newOwner: transferDetails.newOwnerName,
                status: 'COMPLETED'
            };
            
            console.log('✅ Transfer completed:', result.applicationId);
            
            // Task is complete, clean up
            removeActiveSession(sessionId);
            
            return {
                success: true,
                step: 'completed',
                message: 'Ownership transferred successfully',
                data: result
            };
        }
        
        throw new Error('Invalid request state for transfer.');

    } catch (error) {
        console.error('❌ Transfer Automation Error:', error.message);
        removeActiveSession(sessionId);
        
        // Check for specific errors
        if (error.message.includes('page.waitForSelector: Timeout')) {
            return {
                success: false,
                message: 'Automation failed: Invalid captcha or vehicle not found. Please try again.',
                data: null
            };
        }

        return {
            success: false,
            message: error.message || 'Automation failed',
            data: null
        };
    }
}

// ... (Cleanup functions are unchanged) ...
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
    transferOwnership,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};