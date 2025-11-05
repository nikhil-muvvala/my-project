// automation/searchVehicle.js
const { chromium } = require('playwright');

async function searchVehicle(data) {
    const browser = await chromium.launch({ 
        headless: false, // Set to true in production
        slowMo: 100 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🔍 Starting vehicle search automation...');
        
        // Navigate to VAHAN portal
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        console.log('✅ Navigated to VAHAN portal');
        
        // Fill registration number
        await page.fill('#regNumber', data.regNo);
        console.log(`✅ Filled registration number: ${data.regNo}`);
        
        // Select state
        await page.selectOption('#stateSelect', data.state);
        console.log(`✅ Selected state: ${data.state}`);
        
        // Get captcha text
        const captchaText = await page.textContent('#captchaDisplay');
        console.log(`✅ Retrieved captcha: ${captchaText}`);
        
        // Fill captcha
        await page.fill('#captchaInput', captchaText);
        console.log('✅ Filled captcha');
        
        // Submit search form
        await page.click('button[type="submit"]');
        console.log('✅ Submitted search form');
        
        // Wait for results
        await page.waitForSelector('#resultCard', { timeout: 10000 });
        console.log('✅ Results loaded');
        
        // Extract vehicle details
        const vehicleDetails = await page.evaluate(() => {
            return {
                regNo: document.getElementById('res_regNo')?.textContent || 'N/A',
                regDate: document.getElementById('res_regDate')?.textContent || 'N/A',
                rto: document.getElementById('res_rto')?.textContent || 'N/A',
                model: document.getElementById('res_model')?.textContent || 'N/A',
                ownerName: document.getElementById('res_ownerName')?.textContent || 'N/A',
                mobile: document.getElementById('res_mobile')?.textContent || 'N/A',
                insStatus: document.getElementById('res_insStatus')?.textContent || 'N/A'
            };
        });
        
        console.log('✅ Extracted vehicle details:', vehicleDetails);
        
        // Take screenshot
        await page.screenshot({ path: 'automation/screenshots/search-result.png', fullPage: true });
        console.log('✅ Screenshot saved');
        
        await browser.close();
        
        return {
            success: true,
            message: 'Vehicle details retrieved successfully',
            data: vehicleDetails
        };
        
    } catch (error) {
        console.error('❌ Automation error:', error.message);
        await page.screenshot({ path: 'automation/screenshots/search-error.png', fullPage: true });
        await browser.close();
        
        return {
            success: false,
            message: error.message,
            data: null
        };
    }
}

module.exports = searchVehicle;