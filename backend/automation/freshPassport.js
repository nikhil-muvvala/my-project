// backend/automation/freshPassport.js
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

async function freshPassport(data) {
    const { sessionId, step, loginName, loginEmail, loginPassword, captcha, ...formData } = data;

    try {
        // Step 1: Login to the mock passport site
        if (!sessionId) {
            console.log('🛂 Step 1 (Passport): Logging in...');
            const browser = await chromium.launch({ headless: true, slowMo: 50 });
            const context = await browser.newContext();
            const page = await context.newPage();

            // --- THIS IS THE FIX ---
            // Corrected the typo from "passport" to "pastport" to match your file name
            await page.goto('http://localhost:5000/mock-pastport-website.html', { waitUntil: 'domcontentloaded' });
            // --- END OF FIX ---

            await page.fill('#loginName', loginName);
            await page.fill('#loginEmail', loginEmail);
            await page.fill('#loginPassword', loginPassword);
            
            await page.click('#loginForm button[type="submit"]');

            // Wait for the main app to load
            await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
            console.log('✅ Login successful, on main app page.');

            const newSessionId = `passport_${Date.now()}`;
            setActiveSession(newSessionId, { browser, context, page, loginEmail: loginEmail }); // Store loginEmail

            return {
                success: true,
                step: 'logged_in',
                sessionId: newSessionId,
                message: 'Login successful. Ready for form details.'
            };
        }

        // We have a session, check which step to perform
        const session = getActiveSession(sessionId);
        if (!session) throw new Error('Session expired.');
        const { browser, page, loginEmail: sessionLoginEmail } = session; // Renamed to avoid conflict

        // Step 2: Fill the 6-stage form and get the captcha
        if (step === 'fill_form') {
            console.log('🛂 Step 2 (Passport): Filling multi-stage form...');
            
            await page.click('a[onclick*="services"]');
            await page.waitForSelector('#servicesPage.active');
            
            await page.click('.service-card:has-text("Fresh Passport")');
            await page.waitForSelector('#applicationPage.active');
            
            // --- Fill Stage 1: Passport Type ---
            await page.check(`input[name="applicationType"][value="${formData.serviceType}"]`);
            await page.check(`input[name="bookletType"][value="${formData.bookletType}"]`);
            await page.click('#nextBtn');
            await page.waitForSelector('#fresh_stage2.active');

            // --- Fill Stage 2: Applicant Details ---
            await page.fill('#givenName', formData.givenName);
            await page.fill('#surname', formData.surname);
            await page.selectOption('#gender', formData.gender);
            await page.fill('#dob', formData.dob);
            await page.fill('#placeOfBirth', formData.placeOfBirth);
            await page.selectOption('#maritalStatus', formData.maritalStatus);
            await page.selectOption('#citizenship', "Birth");
            await page.selectOption('#employment', formData.employment);
            await page.selectOption('#education', "Graduate And Above");
            await page.check(`input[name="nonECR"][value="yes"]`);
            await page.click('#nextBtn');
            await page.waitForSelector('#fresh_stage3.active');

            // --- Fill Stage 3: Family Details ---
            await page.fill('#fatherGivenName', formData.fatherGivenName);
            await page.fill('#motherGivenName', formData.motherGivenName);
            await page.click('#nextBtn');
            await page.waitForSelector('#fresh_stage4.active');
            
            // --- Fill Stage 4: Address Details ---
            await page.fill('#houseNo', formData.houseNo);
            await page.fill('#city', formData.city);
            await page.fill('#pincode', formData.pincode);
            await page.selectOption('#state', formData.state);
            await page.fill('#mobile', formData.mobile);
            await page.fill('#email', sessionLoginEmail); // Use the login email
            await page.click('#nextBtn');
            await page.waitForSelector('#fresh_stage5.active');

            // --- Fill Stage 5: Emergency Contact ---
            await page.fill('#emergencyName', formData.emergencyName);
            await page.fill('#emergencyMobile', formData.emergencyMobile);
            await page.fill('#emergencyAddress', formData.houseNo); // Re-use address
            await page.click('#nextBtn');
            await page.waitForSelector('#fresh_stage6.active');
            console.log('✅ All 5 stages filled.');

            // --- Step 6: Get Captcha ---
            await page.click('button:has-text("Confirm")');
            await page.waitForSelector('#verificationSection', { state: 'visible' });
            
            const captchaElement = await page.$('#captchaCode');
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)){ fs.mkdirSync(screenshotsDir); }
            
            const screenshotPath = path.join(screenshotsDir, `captcha_passport_${sessionId}.png`);
            await captchaElement.screenshot({ path: screenshotPath });
            
            console.log('✅ Captcha screenshot saved.');
            return {
                success: true,
                step: 'captcha_sent',
                sessionId: sessionId,
                captchaImage: screenshotPath,
                message: 'Form filled. Please provide captcha.'
            };
        }

        // Step 3: Submit Captcha and get result
        if (step === 'submit_captcha') {
            console.log('🛂 Step 3 (Passport): Submitting captcha...');
            
            await page.fill('#captchaInput', captcha);
            console.log(`✅ Filled captcha: ${captcha}`);

            // Inject the correct answer
            await page.evaluate((captcha) => {
                window.captchaCode = captcha;
            }, captcha);

            await page.click('button:has-text("Verify & Submit")');
            
            await page.waitForSelector('#successModal.show', { timeout: 15000 });
            console.log('✅ Success modal is visible.');

            // Scrape the result
            const refNumber = await page.textContent('#refNumber');
            
            const result = {
                applicationId: refNumber,
                applicantName: formData.givenName,
                status: 'Submitted',
                processingTime: '30 days'
            };
            
            console.log('✅ Passport Application Submitted:', result.applicationId);
            
            removeActiveSession(sessionId);
            
            return {
                success: true,
                step: 'completed',
                message: 'Passport application submitted successfully',
                data: result
            };
        }

        throw new Error('Invalid step for passport automation.');

    } catch (error) {
        console.error('❌ Passport Automation Error:', error.message);
        removeActiveSession(sessionId);
        return {
            success: false,
            message: error.message || 'Automation failed',
            data: null
        };
    }
}

// (Cleanup function remains the same)
function cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [sessionId, session] of activeSessions.entries()) {
        const sessionTime = parseInt(sessionId.split('_')[1].split('-')[0]); // Handle different session ID formats
        if (now - sessionTime > maxAge) {
            session.browser.close().catch(() => {});
            activeSessions.delete(sessionId);
            console.log(`🧹 Cleaned up old session: ${sessionId}`);
        }
    }
}
setInterval(cleanupOldSessions, 5 * 60 * 1000);

module.exports = {
    freshPassport,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};