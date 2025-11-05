// automation/registerVehicle.js
const { chromium } = require('playwright');

async function registerVehicle(data) {
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 100 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('📋 Starting vehicle registration automation...');
        
        // Navigate to VAHAN portal
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        console.log('✅ Navigated to VAHAN portal');
        
        // Click Login button
        await page.click('#loginBtn');
        await page.waitForSelector('#loginModal.show', { timeout: 5000 });
        console.log('✅ Opened login modal');
        
        // Enter email
        await page.fill('#loginEmail', data.email);
        console.log(`✅ Filled email: ${data.email}`);
        
        // Click Send OTP
        await page.click('#sendOtpBtn');
        console.log('✅ Clicked Send OTP');
        
        // Wait for OTP form to appear
        await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
        console.log('✅ OTP form visible');
        
        // Enter OTP
        await page.fill('#loginOTP', data.otp);
        console.log(`✅ Filled OTP: ${data.otp}`);
        
        // Click Login
        await page.click('#verifyOtpBtn');
        console.log('✅ Clicked Login');
        
        // Wait for login to complete
        await page.waitForSelector('#logoutBtn', { timeout: 10000 });
        console.log('✅ Login successful');
        
        // Navigate to services section
        await page.click('a[onclick*="services"]');
        await page.waitForTimeout(1000);
        console.log('✅ Navigated to services section');
        
        // Click New Vehicle Registration service card
        await page.click('.service-card:has-text("New Vehicle Registration")');
        await page.waitForSelector('#newRegModal.show', { timeout: 5000 });
        console.log('✅ Opened new registration modal');
        
        // Fill owner details
        await page.fill('#newReg_ownerName', data.ownerName);
        await page.fill('#newReg_fatherName', data.fatherName);
        await page.fill('#newReg_mobile', data.mobile);
        if (data.email) await page.fill('#newReg_email', data.email);
        await page.fill('#newReg_address', data.address);
        console.log('✅ Filled owner details');
        
        // Fill vehicle details
        await page.fill('#newReg_class', data.class);
        await page.fill('#newReg_model', data.model);
        await page.selectOption('#newReg_fuel', data.fuel);
        if (data.color) await page.fill('#newReg_color', data.color);
        await page.fill('#newReg_amount', '500000'); // Default amount
        await page.selectOption('#newReg_rto', data.rto);
        console.log('✅ Filled vehicle details');
        
        // Check all required document checkboxes
        const checkboxes = await page.$$('#newRegModal input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            await checkbox.check();
        }
        console.log('✅ Checked all required documents');
        
        // Submit form
        await page.click('#newRegForm button[type="submit"]');
        console.log('✅ Submitted registration form');
        
        // Wait for receipt modal
        await page.waitForSelector('#receiptModal.show', { timeout: 15000 });
        console.log('✅ Receipt modal appeared');
        
        // Extract registration details
        const receiptText = await page.textContent('#receiptContentOutput');
        const regNoMatch = receiptText.match(/Vehicle Reg\. No: ([A-Z0-9]+)/);
        const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
        
        const result = {
            applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
            registrationNumber: regNoMatch ? regNoMatch[1] : 'N/A',
            status: 'COMPLETED'
        };
        
        console.log('✅ Extracted registration details:', result);
        
        // Take screenshot
        await page.screenshot({ path: 'automation/screenshots/register-receipt.png', fullPage: true });
        console.log('✅ Screenshot saved');
        
        // Close receipt modal
        await page.click('#receiptModal .close-btn');
        await page.waitForTimeout(1000);
        
        // Logout
        await page.click('#logoutBtn');
        await page.waitForTimeout(1000);
        console.log('✅ Logged out');
        
        await browser.close();
        
        return {
            success: true,
            message: 'Vehicle registered successfully',
            data: result
        };
        
    } catch (error) {
        console.error('❌ Automation error:', error.message);
        await page.screenshot({ path: 'automation/screenshots/register-error.png', fullPage: true });
        await browser.close();
        
        return {
            success: false,
            message: error.message,
            data: null
        };
    }
}

module.exports = registerVehicle;