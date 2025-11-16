// backend/automation/registerEid.js
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

async function registerEid(data) {
    const { sessionId, step, captcha, ...formData } = data;

    try {
        // Helper function to take and return screenshot
        const takeScreenshot = async (page, sessionId, stepName) => {
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }
            const screenshotPath = path.join(screenshotsDir, `eid_${stepName}_${sessionId || 'new'}_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return screenshotPath;
        };

        // Helper function to get CAPTCHA screenshot
        const getCaptchaScreenshot = async (page, captchaViewId) => {
            const captchaViewSelector = `#${captchaViewId}`;
            await page.waitForSelector(captchaViewSelector, { state: 'visible', timeout: 10000 });
            const captchaElement = await page.$(captchaViewSelector);
            if (!captchaElement) throw new Error(`Could not find CAPTCHA view: ${captchaViewId}`);
            
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }
            const screenshotPath = path.join(screenshotsDir, `captcha_eid_${sessionId || Date.now()}.png`);
            await captchaElement.screenshot({ path: screenshotPath });
            return screenshotPath;
        };

        // Step 1: Navigate to E-ID portal and start registration
        // Also handle case where step='fill_form' but no sessionId (frontend didn't initialize)
        let currentSessionId = sessionId;
        
        if (!currentSessionId || (step === 'fill_form' && !currentSessionId)) {
            console.log('🆔 Step 1 (E-ID): Navigating to E-ID portal...');
            const browser = await chromium.launch({ headless: true, slowMo: 50 });
            const context = await browser.newContext();
            const page = await context.newPage();

            // Navigate to E-ID mock portal
            await page.goto('http://localhost:5000/eid-mock-portal.html', { waitUntil: 'domcontentloaded' });
            
            const pageTitle = await page.title();
            console.log(`Navigated to E-ID portal. Page title is: "${pageTitle}"`);
            
            // Wait for navigation bar to ensure page is loaded
            const navBarSelector = 'nav.bg-blue-800';
            await page.waitForSelector(navBarSelector, { timeout: 10000 });
            
            // Take screenshot of initial page
            const initialScreenshot = await takeScreenshot(page, null, 'initial');
            console.log('📸 Screenshot saved:', initialScreenshot);
            
            // Navigate to register view - use hover technique for dropdown menu (like Puppeteer script)
            const menuSelector = 'nav .dropdown:first-child';
            console.log('Hovering over "My E-ID" menu...');
            await page.hover(menuSelector);
            
            // Wait for the register button to appear in the dropdown
            await page.waitForSelector('#navRegister', { state: 'visible', timeout: 5000 });
            await page.click('#navRegister');
            await page.waitForSelector('#registerView.active', { timeout: 10000 });
            console.log('✅ Navigated to registration page.');
            
            // Take screenshot after navigation
            currentSessionId = `eid_${Date.now()}`;
            const afterNavScreenshot = await takeScreenshot(page, currentSessionId, 'after_nav');
            console.log('📸 Screenshot saved:', afterNavScreenshot);
            
            setActiveSession(currentSessionId, { browser, context, page });

            // If step is 'fill_form', continue directly to step 2 using the new session
            if (step === 'fill_form') {
                // Continue to step 2 below - don't return
            } else {
                return {
                    success: true,
                    step: 'ready_for_form',
                    sessionId: currentSessionId,
                    message: 'Ready for registration form details.',
                    screenshot: afterNavScreenshot
                };
            }
        }

        // Step 2: Fill the registration form and get the captcha
        if (step === 'fill_form') {
            console.log('🆔 Step 2 (E-ID): Filling registration form...');
            
            // Get session - currentSessionId should be set by now (either from parameter or from step 1)
            if (!currentSessionId) {
                // Last resort: try to get the most recent session
                const allSessionIds = Array.from(activeSessions.keys());
                if (allSessionIds.length > 0) {
                    currentSessionId = allSessionIds[allSessionIds.length - 1];
                    console.log(`⚠️ No sessionId provided, using most recent: ${currentSessionId}`);
                } else {
                    throw new Error('Session expired or not found. No active sessions.');
                }
            }
            
            const session = getActiveSession(currentSessionId);
            if (!session) throw new Error(`Session expired or not found. SessionId: ${currentSessionId}`);
            const { page } = session;
            
            // Make sure we're on the register view
            const registerView = await page.$('#registerView.active');
            if (!registerView) {
                // Navigate to register view if not already there
                // Try to use JavaScript to directly show the register view
                await page.evaluate(() => {
                    // Hide all views
                    document.querySelectorAll('.page-view').forEach(view => {
                        view.classList.remove('active');
                    });
                    // Show register view
                    const regView = document.getElementById('registerView');
                    if (regView) {
                        regView.classList.add('active');
                    }
                });
                await page.waitForSelector('#registerView.active', { timeout: 10000 });
            }
            
            // Wait for form to be visible
            await page.waitForSelector('#registerForm', { state: 'visible', timeout: 5000 });
            
            // Take screenshot before filling
            const beforeFillScreenshot = await takeScreenshot(page, currentSessionId, 'before_fill');
            console.log('📸 Screenshot saved:', beforeFillScreenshot);
            
            // Fill the form fields (using type for better simulation, like Puppeteer)
            await page.type('#reg-name', formData.name, { delay: 50 });
            
            // For date input, use evaluate to set value directly (like Puppeteer script)
            await page.evaluate((date) => {
                document.getElementById('reg-dob').value = date;
            }, formData.dob);
            
            await page.selectOption('#reg-gender', formData.gender);
            await page.type('#reg-phone', formData.phone, { delay: 50 });
            await page.type('#reg-address', formData.address, { delay: 50 });
            
            console.log('✅ Form filled with user details.');
            
            // Take screenshot after filling
            const afterFillScreenshot = await takeScreenshot(page, currentSessionId, 'after_fill');
            console.log('📸 Screenshot saved:', afterFillScreenshot);
            
            // Submit the form to get to CAPTCHA
            await page.click('#registerButton');
            
            // Wait for CAPTCHA view to appear
            await page.waitForSelector('#captchaView.active', { timeout: 10000 });
            await page.waitForSelector('#captchaText', { state: 'visible', timeout: 5000 });
            
            // Take screenshot of full CAPTCHA page
            const captchaPageScreenshot = await takeScreenshot(page, currentSessionId, 'captcha_page');
            console.log('📸 Screenshot saved:', captchaPageScreenshot);
            
            // Get CAPTCHA screenshot
            const captchaScreenshotPath = await getCaptchaScreenshot(page, 'captchaView');
            console.log('✅ CAPTCHA screenshot saved.');
            
            return {
                success: true,
                step: 'captcha_sent',
                sessionId: currentSessionId,
                captchaImage: captchaScreenshotPath,
                message: 'Form filled. Please provide captcha.',
                screenshots: {
                    beforeFill: beforeFillScreenshot,
                    afterFill: afterFillScreenshot,
                    captchaPage: captchaPageScreenshot
                }
            };
        }

        // Step 3: Submit CAPTCHA and complete registration
        if (step === 'submit_captcha') {
            console.log('🆔 Step 3 (E-ID): Submitting captcha...');
            
            const session = getActiveSession(currentSessionId);
            if (!session) throw new Error('Session expired.');
            const { page } = session;
            
            // Fill the captcha input
            await page.type('#captchaInput', captcha, { delay: 50 });
            console.log(`✅ Filled captcha: ${captcha}`);

            // Take screenshot before submitting
            const beforeSubmitScreenshot = await takeScreenshot(page, currentSessionId, 'before_submit');
            console.log('📸 Screenshot saved:', beforeSubmitScreenshot);

            // Click verify button
            await page.click('#verifyCaptchaButton');
            
            // Wait for success message or error
            try {
                // Wait for either success box or error box
                await page.waitForSelector('#registerSuccessBox:not(.hidden), #registerErrorBox:not(.hidden)', { timeout: 15000 });
                
                // Take screenshot after submission
                const afterSubmitScreenshot = await takeScreenshot(page, currentSessionId, 'after_submit');
                console.log('📸 Screenshot saved:', afterSubmitScreenshot);
                
                // Check if there's an error
                const errorBox = await page.$('#registerErrorBox:not(.hidden)');
                if (errorBox) {
                    const errorMessage = await page.textContent('#registerErrorMessage');
                    throw new Error(errorMessage || 'Registration failed.');
                }
                
                // Get the E-ID number from success message
                const eId = await page.$eval('#newEIdNumber', el => el.textContent.trim());
                
                const result = {
                    eId: eId || 'N/A',
                    name: formData.name,
                    status: 'REGISTERED',
                    issuedDate: new Date().toISOString().split('T')[0]
                };
                
                console.log(`✅ Registration Successful! New E-ID: ${result.eId}`);
                
                // Wait a bit before closing
                await page.waitForTimeout(2000);
                
                removeActiveSession(currentSessionId);
                
                return {
                    success: true,
                    step: 'completed',
                    message: 'E-ID registered successfully',
                    data: result,
                    screenshots: {
                        beforeSubmit: beforeSubmitScreenshot,
                        afterSubmit: afterSubmitScreenshot
                    }
                };
            } catch (error) {
                // Take error screenshot
                const errorScreenshot = await takeScreenshot(page, currentSessionId, 'error');
                console.log('📸 Error screenshot saved:', errorScreenshot);
                
                // Check if captcha was wrong
                const captchaError = await page.$('#captchaError:not(.hidden)');
                if (captchaError) {
                    throw new Error('Incorrect CAPTCHA. Please try again.');
                }
                throw error;
            }
        }

        throw new Error('Invalid step for E-ID automation.');

    } catch (error) {
        console.error('❌ E-ID Automation Error:', error.message);
        
        // Try to take error screenshot if we have a page
        try {
            const currentSessionId = sessionId || Object.keys(activeSessions).pop();
            const session = getActiveSession(currentSessionId);
            if (session && session.page) {
                const screenshotsDir = path.join(__dirname, 'screenshots');
                if (!fs.existsSync(screenshotsDir)) {
                    fs.mkdirSync(screenshotsDir, { recursive: true });
                }
                const errorScreenshot = path.join(screenshotsDir, `eid_error_${currentSessionId || 'unknown'}_${Date.now()}.png`);
                await session.page.screenshot({ path: errorScreenshot, fullPage: true });
                console.log('📸 Error screenshot saved:', errorScreenshot);
                
                removeActiveSession(currentSessionId);
                return {
                    success: false,
                    message: error.message || 'Automation failed',
                    data: null,
                    screenshot: errorScreenshot
                };
            }
        } catch (screenshotError) {
            console.error('Failed to take error screenshot:', screenshotError);
        }
        
        removeActiveSession(sessionId);
        return {
            success: false,
            message: error.message || 'Automation failed',
            data: null
        };
    }
}

// Cleanup function
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
    registerEid,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};
