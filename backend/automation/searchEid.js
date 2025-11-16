// backend/automation/searchEid.js
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

async function searchEid(data) {
    const { sessionId, step, eId, ...searchData } = data;

    try {
        // Helper function to take and return screenshot
        const takeScreenshot = async (page, sessionId, stepName) => {
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }
            const screenshotPath = path.join(screenshotsDir, `eid_search_${stepName}_${sessionId || 'new'}_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            return screenshotPath;
        };

        // Step 1: Navigate to E-ID portal and search for E-ID
        let currentSessionId = sessionId;
        
        if (!currentSessionId) {
            console.log('🆔 Step 1 (E-ID Search): Navigating to E-ID portal...');
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
            
            // Navigate to search view - use hover technique for dropdown menu
            const menuSelector = 'nav .dropdown:first-child';
            console.log('Hovering over "My E-ID" menu...');
            await page.hover(menuSelector);
            
            // Wait for the search button to appear in the dropdown
            await page.waitForSelector('#navSearch', { state: 'visible', timeout: 5000 });
            await page.click('#navSearch');
            await page.waitForSelector('#searchView.active', { timeout: 10000 });
            console.log('✅ Navigated to search page.');
            
            // Take screenshot after navigation
            currentSessionId = `eid_search_${Date.now()}`;
            const afterNavScreenshot = await takeScreenshot(page, currentSessionId, 'after_nav');
            console.log('📸 Screenshot saved:', afterNavScreenshot);
            
            setActiveSession(currentSessionId, { browser, context, page });
        }

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

        // Make sure we're on the search view
        const searchView = await page.$('#searchView.active');
        if (!searchView) {
            // Navigate to search view if not already there
            const menuSelector = 'nav .dropdown:first-child';
            await page.hover(menuSelector);
            await page.waitForSelector('#navSearch', { state: 'visible', timeout: 5000 });
            await page.click('#navSearch');
            await page.waitForSelector('#searchView.active', { timeout: 10000 });
        }
        
        // Wait for search form to be visible
        await page.waitForSelector('#eid-number-search', { state: 'visible', timeout: 5000 });
        
        // Take screenshot before searching
        const beforeSearchScreenshot = await takeScreenshot(page, currentSessionId, 'before_search');
        console.log('📸 Screenshot saved:', beforeSearchScreenshot);
        
        // Enter E-ID number
        const eIdToSearch = eId || searchData.eId;
        if (!eIdToSearch) {
            throw new Error('E-ID number is required for search.');
        }
        
        // Clear and type the E-ID
        await page.fill('#eid-number-search', '');
        await page.type('#eid-number-search', eIdToSearch, { delay: 50 });
        console.log(`✅ Entered E-ID: ${eIdToSearch}`);
        
        // Click search button
        await page.click('#searchButton');
        console.log('✅ Clicked search button.');
        
        // Wait for button to finish loading (text changes back from "Searching...")
        try {
            await page.waitForFunction(
                () => {
                    const button = document.querySelector('#searchButton');
                    return button && button.textContent.trim() === 'Search Record';
                },
                { timeout: 5000 }
            );
        } catch (e) {
            // Button might not change text, continue anyway
            console.log('⚠️ Button state check skipped, continuing...');
        }
        
        // Wait for results or error to appear (not hidden)
        // Wait for either resultsCard or searchErrorBox to NOT have the hidden class
        await page.waitForSelector('#resultsCard:not(.hidden), #searchErrorBox:not(.hidden)', { timeout: 15000 });
        console.log('✅ Search result or error appeared.');
        
        // Take screenshot after search
        const afterSearchScreenshot = await takeScreenshot(page, currentSessionId, 'after_search');
        console.log('📸 Screenshot saved:', afterSearchScreenshot);
        
        // Check if there's an error
        const errorBox = await page.$('#searchErrorBox:not(.hidden)');
        if (errorBox) {
            const errorMessage = await page.textContent('#searchErrorMessage');
            console.log(`❌ Search Failed. Reason: ${errorMessage}`);
            
            removeActiveSession(currentSessionId);
            return {
                success: false,
                error: errorMessage || 'Search failed. E-ID not found.',
                screenshots: {
                    beforeSearch: beforeSearchScreenshot,
                    afterSearch: afterSearchScreenshot
                }
            };
        }
        
        // Extract search results
        const resultsCard = await page.$('#resultsCard:not(.hidden)');
        if (!resultsCard) {
            throw new Error('Results card not found.');
        }
        
        // Extract the displayed information (note: PII is masked for security)
        const eIdDisplay = await page.$eval('#res-eid', el => el.textContent.trim());
        const issuedDate = await page.$eval('#res-issued', el => el.textContent.trim());
        
        // Note: Other fields are masked (showing asterisks) for security
        const result = {
            eId: eIdDisplay,
            issuedDate: issuedDate,
            status: 'FOUND',
            message: 'E-ID found. Note: Personal information is masked for security.'
        };
        
        console.log(`✅ E-ID Search Successful! E-ID: ${result.eId}`);
        
        // Wait a bit before closing
        await page.waitForTimeout(2000);
        
        removeActiveSession(currentSessionId);
        
        return {
            success: true,
            message: 'E-ID search completed successfully',
            data: result,
            screenshots: {
                beforeSearch: beforeSearchScreenshot,
                afterSearch: afterSearchScreenshot
            }
        };

    } catch (error) {
        console.error('❌ E-ID Search Automation Error:', error.message);
        
        // Try to take error screenshot if we have a page
        try {
            const currentSessionId = sessionId || Object.keys(activeSessions).pop();
            const session = getActiveSession(currentSessionId);
            if (session && session.page) {
                const screenshotsDir = path.join(__dirname, 'screenshots');
                if (!fs.existsSync(screenshotsDir)) {
                    fs.mkdirSync(screenshotsDir, { recursive: true });
                }
                const errorScreenshot = path.join(screenshotsDir, `eid_search_error_${currentSessionId || 'unknown'}_${Date.now()}.png`);
                await session.page.screenshot({ path: errorScreenshot, fullPage: true });
                console.log('📸 Error screenshot saved:', errorScreenshot);
                
                removeActiveSession(currentSessionId);
                return {
                    success: false,
                    message: error.message || 'Search automation failed',
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
            message: error.message || 'Search automation failed',
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
    searchEid,
    getActiveSession,
    setActiveSession,
    removeActiveSession
};

