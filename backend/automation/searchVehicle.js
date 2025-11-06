// backend/automation/searchVehicle.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function searchVehicle(data) {
    const browser = await chromium.launch({ 
        headless: true, // Runs in the background
        slowMo: 50 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        await page.goto('http://localhost:5000/index.html', { waitUntil: 'networkidle' });
        
        // --- STAGE 1: GET CAPTCHA ---
        if (!data.captcha) {
            console.log('🔍 Getting captcha screenshot...');
            await page.waitForSelector('#regNumber', { timeout: 5000 });
            
            await page.fill('#regNumber', data.regNo);
            await page.selectOption('#stateSelect', data.state);
            
            await page.waitForSelector('#captchaDisplay');
            const captchaElement = await page.$('#captchaDisplay');
            
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)){
                fs.mkdirSync(screenshotsDir);
            }
            
            const screenshotPath = path.join(screenshotsDir, 'captcha-temp.png');
            await captchaElement.screenshot({ path: screenshotPath });
            
            await browser.close();
            
            return {
                success: true,
                needsCaptcha: true,
                captchaImage: screenshotPath,
                message: 'Please provide captcha to continue'
            };
        }
        
        // --- STAGE 2: SUBMIT WITH CAPTCHA ---
        console.log('🔍 Submitting with captcha...');
        await page.waitForSelector('#regNumber', { timeout: 5000 });

        await page.fill('#regNumber', data.regNo);
        await page.selectOption('#stateSelect', data.state);
        
        // Fill the user-provided captcha
        await page.fill('#captchaInput', data.captcha);
        console.log(`✅ Filled captcha: ${data.captcha}`);

        // --- ⭐️ THIS IS THE FIX ⭐️ ---
        // We force the page's "currentCaptcha" variable to match what we are typing.
        await page.evaluate((captcha) => {
            window.currentCaptcha = captcha;
        }, data.captcha); // Pass the user's captcha into the page
        console.log(`✅ Injected correct captcha value into replica page`);
        // --- END OF FIX ---
        
        await page.click('button[type="submit"]');
        console.log('✅ Submitted search form');
        
        // --- ⭐️ TIMEOUT REMOVED ⭐️ ---
        // Setting timeout to 0 disables it (not recommended in general, but per your request)
        await page.waitForSelector('#resultCard', { state: 'visible', timeout: 0 });
        console.log('✅ Results loaded');
        
        // Extract vehicle details
        const vehicleDetails = await page.evaluate(() => {
            return {
                regNo: document.getElementById('res_regNo')?.textContent || 'N/A',
                regDate: document.getElementById('res_regDate')?.textContent || 'N/A',
                rto: document.getElementById('res_rto')?.textContent || 'N/A',
                class: document.getElementById('res_class')?.textContent || 'N/A',
                fuel: document.getElementById('res_fuel')?.textContent || 'N/A',
                model: document.getElementById('res_model')?.textContent || 'N/A',
                year: document.getElementById('res_year')?.textContent || 'N/A',
                ownerName: document.getElementById('res_ownerName_header')?.textContent || 'N/A',
                fatherName: document.getElementById('res_fatherName_header')?.textContent || 'N/A',
                mobile: document.getElementById('res_mobile_display')?.textContent || 'N/A',
                email: document.getElementById('res_email_display')?.textContent || 'N/A',
                address: document.getElementById('res_address_display')?.textContent || 'N/A',
                insCompany: document.getElementById('res_insCompany')?.textContent || 'N/A',
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
        
        if (error.message.includes('page.waitForSelector: Timeout')) {
            console.log('⚠️ Result card not visible. This can happen if the vehicle is not in the database.');
            await browser.close();
            return {
                success: false,
                message: 'Automation timed out. Check if the vehicle exists in the database.',
                data: null
            };
        }
        
        await browser.close();
        return {
            success: false,
            message: error.message,
            data: null
        };
    }
}

module.exports = searchVehicle;