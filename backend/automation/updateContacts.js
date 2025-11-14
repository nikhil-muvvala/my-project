// backend/automation/updateContacts.js
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

async function updateContacts(data) {
    const { email, otp, sessionId, regNo, state, searchCaptcha, ...updateDetails } = data;

    try {
        // Step 1: Send OTP
        if (!sessionId && !otp) {
            console.log('✏️ Step 1 (Update): Sending OTP...');
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
            
            const newSessionId = `update_${Date.now()}`;
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
        if (sessionId && otp && !regNo) {
            console.log('✏️ Step 2 (Update): Verifying OTP...');
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
            console.log('✏️ Step 3 (Update): Getting search captcha...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');
            const { page } = session;
            
            await page.click('a[onclick*="showSection(\'home\')"]');
            await page.waitForSelector('#searchCard', { state: 'visible', timeout: 5000 });

            await page.fill('#regNumber', regNo);
            await page.selectOption('#stateSelect', state);
            console.log(`✅ Filled search form for ${regNo}`);

            await page.waitForSelector('#captchaDisplay');
            await page.waitForTimeout(500);
            const captchaElement = await page.$('#captchaDisplay');

            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)){ fs.mkdirSync(screenshotsDir); }
            
            const screenshotPath = path.join(screenshotsDir, `captcha_update_${sessionId}.png`);
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

        // Step 4: Submit Search & Open Update Modal
        if (sessionId && searchCaptcha && !updateDetails.newAddress) {
            console.log('✏️ Step 4 (Update): Submitting search...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');
            const { page } = session;

            const isSearchCardVisible = await page.isVisible('#searchCard');
            if (!isSearchCardVisible) {
                await page.click('a[onclick*="showSection(\'home\')"]');
                await page.waitForSelector('#searchCard', { state: 'visible', timeout: 5000 });
                await page.fill('#regNumber', regNo);
                await page.selectOption('#stateSelect', state);
            }

            await page.fill('#captchaInput', searchCaptcha);
            await page.evaluate((captcha) => {
                window.currentCaptcha = captcha;
            }, searchCaptcha);

            await page.click('button[type="submit"]');
            await page.waitForSelector('#resultCard', { state: 'visible', timeout: 15000 });
            console.log('✅ Vehicle search successful.');

            await page.evaluate(() => {
                document.querySelector('button[onclick="showUpdateDetailsModal()"]').scrollIntoView();
            });

            await page.click('button[onclick="showUpdateDetailsModal()"]');
            await page.waitForSelector('#updateDetailsModal.show', { timeout: 5000 });
            console.log('✅ Update Details modal opened.');

            return {
                success: true,
                step: 'modal_open',
                sessionId: sessionId,
                message: 'Vehicle found. Please provide new contact details.'
            };
        }

        // Step 5: Fill and Submit Update Form
        if (sessionId && updateDetails.newAddress) {
            console.log('✏️ Step 5 (Update): Submitting final details...');
            const session = getActiveSession(sessionId);
            if (!session) throw new Error('Session expired.');
            const { browser, page, email } = session; 

            await page.fill('#addr_newAddress', updateDetails.newAddress);
            await page.fill('#addr_newMobile', updateDetails.newMobile);
            await page.fill('#addr_newEmail', email); 
            console.log(`✅ Filled form with new details and auto-filled email: ${email}`);
            
            const checkboxes = await page.$$('#updateDetailsModal input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                await checkbox.check();
            }
            console.log('✅ Checked all document checkboxes.');

            await page.click('#updateDetailsForm button[type="submit"]');
            await page.waitForSelector('#receiptModal.show', { timeout: 20000 });
            console.log('✅ Receipt modal opened');
            
            const receiptText = await page.textContent('#receiptContentOutput');
            const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
            
            const result = {
                applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
                vehicleRegNo: regNo,
                newAddress: updateDetails.newAddress,
                newMobile: updateDetails.newMobile,
                status: 'COMPLETED'
            };
            
            console.log('✅ Update completed:', result.applicationId);
            
            removeActiveSession(sessionId);
            
            return {
                success: true,
                step: 'completed',
                message: 'Contact details updated successfully',
                data: result
            };
        }
        
        throw new Error('Invalid request state for update.');

    } catch (error) {
        console.error('❌ Update Automation Error:', error.message);
        removeActiveSession(sessionId);

        if (error.message.includes('page.waitForSelector: Timeout')) {
            return {
                success: false,
                message: 'Automation failed: Invalid captcha or vehicle not found/not owned. Please try again.',
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
    updateContacts,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};