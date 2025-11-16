// backend/automation/updateEid.js
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

async function updateEid(data) {
    const { sessionId, step, eId, captcha, name, phone, address, ...updateData } = data;

    try {
        // Helper function to take and return screenshot
        const takeScreenshot = async (page, sessionId, stepName) => {
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }
            const screenshotPath = path.join(screenshotsDir, `eid_update_${stepName}_${sessionId || 'new'}_${Date.now()}.png`);
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
            const screenshotPath = path.join(screenshotsDir, `captcha_eid_update_${sessionId || Date.now()}.png`);
            await captchaElement.screenshot({ path: screenshotPath });
            return screenshotPath;
        };

        // Step 1: Navigate to E-ID portal and find user
        let currentSessionId = sessionId;
        
        if (!currentSessionId || (step === 'find_user' && !currentSessionId)) {
            console.log('🆔 Step 1 (E-ID Update): Navigating to E-ID portal...');
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
            
            // Navigate to update view - use hover technique for dropdown menu
            const menuSelector = 'nav .dropdown:first-child';
            console.log('Hovering over "My E-ID" menu...');
            await page.hover(menuSelector);
            
            // Wait for the update button to appear in the dropdown
            await page.waitForSelector('#navUpdate', { state: 'visible', timeout: 5000 });
            await page.click('#navUpdate');
            await page.waitForSelector('#updateView.active', { timeout: 10000 });
            console.log('✅ Navigated to update page.');
            
            // Take screenshot after navigation
            currentSessionId = `eid_update_${Date.now()}`;
            const afterNavScreenshot = await takeScreenshot(page, currentSessionId, 'after_nav');
            console.log('📸 Screenshot saved:', afterNavScreenshot);
            
            setActiveSession(currentSessionId, { browser, context, page });

            // If step is 'find_user', continue directly to finding user
            if (step === 'find_user') {
                // Continue to find user below - don't return
            } else {
                return {
                    success: true,
                    step: 'ready_for_find',
                    sessionId: currentSessionId,
                    message: 'Ready to find E-ID record for update.',
                    screenshot: afterNavScreenshot
                };
            }
        }

        // Step 2: Find user by E-ID
        if (step === 'find_user') {
            console.log('🆔 Step 2 (E-ID Update): Finding user...');
            
            // Get session
            if (!currentSessionId) {
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
            
            // Make sure we're on the update view
            const updateView = await page.$('#updateView.active');
            if (!updateView) {
                // Navigate to update view if not already there
                const menuSelector = 'nav .dropdown:first-child';
                await page.hover(menuSelector);
                await page.waitForSelector('#navUpdate', { state: 'visible', timeout: 5000 });
                await page.click('#navUpdate');
                await page.waitForSelector('#updateView.active', { timeout: 10000 });
            }
            
            // Wait for find user form to be visible
            await page.waitForSelector('#eid-number-update', { state: 'visible', timeout: 5000 });
            
            // Take screenshot before finding
            const beforeFindScreenshot = await takeScreenshot(page, currentSessionId, 'before_find');
            console.log('📸 Screenshot saved:', beforeFindScreenshot);
            
            // Enter E-ID number
            const eIdToFind = eId || updateData.eId;
            if (!eIdToFind) {
                throw new Error('E-ID number is required to find user for update.');
            }
            
            // Clear and type the E-ID
            await page.fill('#eid-number-update', '');
            await page.type('#eid-number-update', eIdToFind, { delay: 50 });
            console.log(`✅ Entered E-ID: ${eIdToFind}`);
            
            // Click find button
            await page.click('#findUserButton');
            console.log('✅ Clicked find user button.');
            
            // Wait for button to finish loading
            try {
                await page.waitForFunction(
                    () => {
                        const button = document.querySelector('#findUserButton');
                        return button && !button.disabled;
                    },
                    { timeout: 5000 }
                );
            } catch (e) {
                console.log('⚠️ Button state check skipped, continuing...');
            }
            
            // Wait for either step 2 form to appear or error box
            await page.waitForSelector('#updateStep2:not(.hidden), #updateFindErrorBox:not(.hidden)', { timeout: 15000 });
            console.log('✅ User found or error appeared.');
            
            // Take screenshot after finding
            const afterFindScreenshot = await takeScreenshot(page, currentSessionId, 'after_find');
            console.log('📸 Screenshot saved:', afterFindScreenshot);
            
            // Check if there's an error
            const errorBox = await page.$('#updateFindErrorBox:not(.hidden)');
            if (errorBox) {
                const errorMessage = await page.textContent('#updateFindErrorMessage');
                console.log(`❌ Find User Failed. Reason: ${errorMessage}`);
                
                removeActiveSession(currentSessionId);
                return {
                    success: false,
                    error: errorMessage || 'User not found.',
                    screenshots: {
                        beforeFind: beforeFindScreenshot,
                        afterFind: afterFindScreenshot
                    }
                };
            }
            
            // Check if step 2 form is visible
            const step2Form = await page.$('#updateStep2:not(.hidden)');
            if (!step2Form) {
                throw new Error('Update form not found after finding user.');
            }
            
            console.log('✅ User found. Ready for editing.');
            
            return {
                success: true,
                step: 'user_found',
                sessionId: currentSessionId,
                message: 'User found. Ready to edit details.',
                screenshots: {
                    beforeFind: beforeFindScreenshot,
                    afterFind: afterFindScreenshot
                }
            };
        }

        // Step 3: Edit fields and submit to get CAPTCHA
        if (step === 'edit_fields') {
            console.log('🆔 Step 3 (E-ID Update): Editing fields...');
            
            const session = getActiveSession(currentSessionId);
            if (!session) throw new Error('Session expired.');
            const { page } = session;
            
            // Make sure we're on the update view and step 2 is visible
            const updateView = await page.$('#updateView.active');
            if (!updateView) {
                throw new Error('Not on update view.');
            }
            
            await page.waitForSelector('#updateStep2:not(.hidden)', { timeout: 5000 });
            
            // Take screenshot before editing
            const beforeEditScreenshot = await takeScreenshot(page, currentSessionId, 'before_edit');
            console.log('📸 Screenshot saved:', beforeEditScreenshot);
            
            // Determine which fields to edit
            let fieldsToEdit = [];
            if (name) fieldsToEdit.push({ field: 'update-name', value: name });
            if (phone) fieldsToEdit.push({ field: 'update-phone', value: phone });
            if (address) fieldsToEdit.push({ field: 'update-address', value: address });
            
            if (fieldsToEdit.length === 0) {
                throw new Error('At least one field (name, phone, or address) must be provided for update.');
            }
            
            // Edit each field
            for (const { field, value } of fieldsToEdit) {
                // Click the edit button for this field
                const editButton = await page.$(`button[data-field="${field}"]`);
                if (!editButton) {
                    throw new Error(`Edit button not found for field: ${field}`);
                }
                
                // Check if field is already editable
                const input = await page.$(`#${field}`);
                const isReadOnly = await input.getAttribute('readonly');
                
                if (isReadOnly !== null) {
                    // Click edit button to make it editable
                    await editButton.click();
                    await page.waitForTimeout(300); // Wait for field to become editable
                }
                
                // Clear and fill the field
                await page.fill(`#${field}`, '');
                await page.type(`#${field}`, value, { delay: 50 });
                console.log(`✅ Edited ${field} with value: ${value}`);
            }
            
            // Take screenshot after editing
            const afterEditScreenshot = await takeScreenshot(page, currentSessionId, 'after_edit');
            console.log('📸 Screenshot saved:', afterEditScreenshot);
            
            // Click save changes button
            await page.click('#updateSaveChangesButton');
            console.log('✅ Clicked save changes button.');
            
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
                message: 'Fields edited. Please provide captcha.',
                screenshots: {
                    beforeEdit: beforeEditScreenshot,
                    afterEdit: afterEditScreenshot,
                    captchaPage: captchaPageScreenshot
                }
            };
        }

        // Step 4: Submit CAPTCHA and complete update
        if (step === 'submit_captcha') {
            console.log('🆔 Step 4 (E-ID Update): Submitting captcha...');
            
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
                await page.waitForSelector('#updateSuccessBox:not(.hidden), #updateErrorBox:not(.hidden)', { timeout: 15000 });
                
                // Take screenshot after submission
                const afterSubmitScreenshot = await takeScreenshot(page, currentSessionId, 'after_submit');
                console.log('📸 Screenshot saved:', afterSubmitScreenshot);
                
                // Check if there's an error
                const errorBox = await page.$('#updateErrorBox:not(.hidden)');
                if (errorBox) {
                    const errorMessage = await page.textContent('#updateErrorMessage');
                    throw new Error(errorMessage || 'Update failed.');
                }
                
                // Check for success
                const successBox = await page.$('#updateSuccessBox:not(.hidden)');
                if (!successBox) {
                    throw new Error('Update status not found.');
                }
                
                const result = {
                    eId: eId || updateData.eId,
                    status: 'UPDATED',
                    message: 'E-ID information updated successfully.'
                };
                
                // Add updated fields to result
                if (name) result.name = name;
                if (phone) result.phone = phone;
                if (address) result.address = address;
                
                console.log(`✅ Update Successful! E-ID: ${result.eId}`);
                
                // Wait a bit before closing
                await page.waitForTimeout(2000);
                
                removeActiveSession(currentSessionId);
                
                return {
                    success: true,
                    step: 'completed',
                    message: 'E-ID updated successfully',
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

        throw new Error('Invalid step for E-ID update automation.');

    } catch (error) {
        console.error('❌ E-ID Update Automation Error:', error.message);
        
        // Try to take error screenshot if we have a page
        try {
            const currentSessionId = sessionId || Object.keys(activeSessions).pop();
            const session = getActiveSession(currentSessionId);
            if (session && session.page) {
                const screenshotsDir = path.join(__dirname, 'screenshots');
                if (!fs.existsSync(screenshotsDir)) {
                    fs.mkdirSync(screenshotsDir, { recursive: true });
                }
                const errorScreenshot = path.join(screenshotsDir, `eid_update_error_${currentSessionId || 'unknown'}_${Date.now()}.png`);
                await session.page.screenshot({ path: errorScreenshot, fullPage: true });
                console.log('📸 Error screenshot saved:', errorScreenshot);
                
                removeActiveSession(currentSessionId);
                return {
                    success: false,
                    message: error.message || 'Update automation failed',
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
            message: error.message || 'Update automation failed',
            data: null
        };
    }
}

// Cleanup function
function cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [sessionId, session] of activeSessions.entries()) {
        const sessionTime = parseInt(sessionId.split('_')[2] || sessionId.split('_')[1]);
        if (now - sessionTime > maxAge) {
            session.browser.close().catch(() => {});
            activeSessions.delete(sessionId);
            console.log(`🧹 Cleaned up old session: ${sessionId}`);
        }
    }
}
setInterval(cleanupOldSessions, 5 * 60 * 1000);

module.exports = {
    updateEid,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};

