// backend/automation/searchVehicle.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Store browser contexts globally to maintain session
const activeSessions = new Map();

async function searchVehicle(data) {
    const { regNo, state, captcha, sessionId } = data;

    try {
        // Step 1: Initialize browser and get captcha
        if (!captcha) {
            console.log('🔄 Step 1: Opening VAHAN portal and fetching captcha...');
            
            // Launch headless browser
            const browser = await chromium.launch({
                headless: true, // This makes it invisible
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });
            
            const page = await context.newPage();
            
            // Generate unique session ID
            const newSessionId = `search_${Date.now()}`;
            
            // Store the browser, context, and page for next step
            activeSessions.set(newSessionId, { browser, context, page });
            
            // Navigate to your VAHAN portal
            await page.goto('http://localhost:5000', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            
            console.log('✅ Page loaded successfully');
            
            // Wait for the search form to be visible
            await page.waitForSelector('#regNumber', { timeout: 10000 });
            
            // Fill in the registration number
            await page.fill('#regNumber', regNo.toUpperCase());
            
            // Select the state
            await page.selectOption('#stateSelect', state);
            
            console.log(`✅ Filled form with RegNo: ${regNo}, State: ${state}`);
            
            // Wait for captcha to be generated
            await page.waitForSelector('#captchaDisplay', { timeout: 5000 });
            await page.waitForTimeout(1000); // Give time for captcha to render
            
            // Take screenshot of the captcha element
            const captchaElement = await page.$('#captchaDisplay');
            const screenshotPath = path.join(__dirname, `../temp/captcha_${newSessionId}.png`);
            
            // Ensure temp directory exists
            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            await captchaElement.screenshot({ path: screenshotPath });
            
            console.log('✅ Captcha screenshot saved');
            
            return {
                success: true,
                needsCaptcha: true,
                captchaImage: screenshotPath,
                sessionId: newSessionId,
                message: 'Captcha fetched. Please solve it and submit.'
            };
        }
        
        // Step 2: Submit form with captcha and get results
        else {
            console.log('🔄 Step 2: Submitting form with captcha...');
            
            // Retrieve the stored session
            const session = activeSessions.get(sessionId);
            
            if (!session) {
                throw new Error('Session expired. Please start again.');
            }
            
            const { browser, context, page } = session;
            
            // Fill in the captcha
            await page.fill('#captchaInput', captcha);
            
            console.log(`✅ Filled captcha: ${captcha}`);
            
            // Click the search button
            await page.click('button[type="submit"]');
            
            console.log('✅ Form submitted, waiting for results...');
            
            // Wait for result card to appear (with longer timeout)
            await page.waitForSelector('#resultCard', { 
                state: 'visible',
                timeout: 15000 
            });
            
            console.log('✅ Results loaded');
            
            // Wait a bit for data to populate
            await page.waitForTimeout(2000);
            
            // Extract vehicle details from the page
            const vehicleData = await page.evaluate(() => {
                const getData = (id) => {
                    const el = document.getElementById(id);
                    return el ? el.textContent.trim() : '-';
                };
                
                return {
                    regNo: getData('res_regNo'),
                    regDate: getData('res_regDate'),
                    rto: getData('res_rto'),
                    class: getData('res_class'),
                    fuel: getData('res_fuel'),
                    model: getData('res_model'),
                    year: getData('res_year'),
                    engine: getData('res_engine'),
                    chassis: getData('res_chassis'),
                    color: getData('res_color'),
                    seating: getData('res_seating'),
                    insCompany: getData('res_insCompany'),
                    policyNo: getData('res_policyNo'),
                    insFrom: getData('res_insFrom'),
                    insUpto: getData('res_insUpto'),
                    insStatus: getData('res_insStatus'),
                    fitnessUpto: getData('res_fitnessUpto'),
                    fitnessStatus: getData('res_fitnessStatus'),
                    pucNo: getData('res_pucNo'),
                    pucUpto: getData('res_pucUpto'),
                    pucStatus: getData('res_pucStatus'),
                    taxUpto: getData('res_taxUpto'),
                    ownerName: getData('res_ownerName'),
                    fatherName: getData('res_fatherName'),
                    mobile: getData('res_mobile'),
                    email: getData('res_email'),
                    address: getData('res_address'),
                    permAddress: getData('res_permAddress'),
                    financer: getData('res_financer')
                };
            });
            
            console.log('✅ Vehicle data extracted');
            
            // Clean up - close browser and remove session
            await browser.close();
            activeSessions.delete(sessionId);
            
            // Delete the captcha screenshot
            const screenshotPath = path.join(__dirname, `../temp/captcha_${sessionId}.png`);
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath);
            }
            
            return {
                success: true,
                needsCaptcha: false,
                data: vehicleData,
                message: 'Vehicle details fetched successfully'
            };
        }
        
    } catch (error) {
        console.error('❌ Automation Error:', error.message);
        
        // Clean up on error
        if (sessionId && activeSessions.has(sessionId)) {
            const session = activeSessions.get(sessionId);
            await session.browser.close().catch(() => {});
            activeSessions.delete(sessionId);
        }
        
        return {
            success: false,
            message: error.message || 'Automation failed',
            data: null
        };
    }
}

// Cleanup function to close abandoned sessions (call this periodically)
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

// Run cleanup every 5 minutes
setInterval(cleanupOldSessions, 5 * 60 * 1000);

module.exports = searchVehicle;