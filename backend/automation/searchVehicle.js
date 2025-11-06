// backend/automation/searchVehicle.js
const { chromium } = require('playwright');
const path = require('path');

async function searchVehicle(data) {
    const browser = await chromium.launch({ 
        headless: true, // Run in background
        slowMo: 50 
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
        
        // Get captcha text and take screenshot if no captcha provided
        if (!data.captcha) {
            const captchaText = await page.textContent('#captchaDisplay');
            console.log(`✅ Retrieved captcha: ${captchaText}`);
            
            // Take captcha screenshot
            const captchaElement = await page.$('#captchaDisplay');
            const screenshotPath = path.join(__dirname, 'screenshots', 'captcha-temp.png');
            await captchaElement.screenshot({ path: screenshotPath });
            console.log('✅ Captcha screenshot saved');
            
            await browser.close();
            
            return {
                success: true,
                needsCaptcha: true,
                captchaImage: screenshotPath,
                message: 'Please provide captcha to continue'
            };
        }
        
        // Fill captcha
        await page.fill('#captchaInput', data.captcha);
        console.log('✅ Filled captcha');
        
        // Submit search form
        await page.click('button[type="submit"]');
        console.log('✅ Submitted search form');
        
        // Wait for results
        await page.waitForSelector('#resultCard', { timeout: 10000 });
        console.log('✅ Results loaded');
        
        // Extract vehicle details as JSON
        const vehicleDetails = await page.evaluate(() => {
            return {
                regNo: document.getElementById('res_regNo')?.textContent || 'N/A',
                regDate: document.getElementById('res_regDate')?.textContent || 'N/A',
                rto: document.getElementById('res_rto')?.textContent || 'N/A',
                class: document.getElementById('res_class')?.textContent || 'N/A',
                fuel: document.getElementById('res_fuel')?.textContent || 'N/A',
                model: document.getElementById('res_model')?.textContent || 'N/A',
                year: document.getElementById('res_year')?.textContent || 'N/A',
                engine: document.getElementById('res_engine')?.textContent || 'N/A',
                chassis: document.getElementById('res_chassis')?.textContent || 'N/A',
                color: document.getElementById('res_color')?.textContent || 'N/A',
                seating: document.getElementById('res_seating')?.textContent || 'N/A',
                ownerName: document.getElementById('res_ownerName')?.textContent || 'N/A',
                fatherName: document.getElementById('res_fatherName')?.textContent || 'N/A',
                mobile: document.getElementById('res_mobile')?.textContent || 'N/A',
                email: document.getElementById('res_email')?.textContent || 'N/A',
                address: document.getElementById('res_address')?.textContent || 'N/A',
                insCompany: document.getElementById('res_insCompany')?.textContent || 'N/A',
                insStatus: document.getElementById('res_insStatus')?.textContent || 'N/A',
                insUpto: document.getElementById('res_insUpto')?.textContent || 'N/A'
            };
        });
        
        console.log('✅ Extracted vehicle details');
        
        await browser.close();
        
        return {
            success: true,
            needsCaptcha: false,
            message: 'Vehicle details retrieved successfully',
            data: vehicleDetails
        };
        
    } catch (error) {
        console.error('❌ Automation error:', error.message);
        await browser.close();
        
        return {
            success: false,
            message: error.message,
            data: null
        };
    }
}

module.exports = searchVehicle;