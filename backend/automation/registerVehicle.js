// backend/automation/registerVehicle.js
const { chromium } = require('playwright');

async function registerVehicle(data) {
    const browser = await chromium.launch({ 
        headless: true, // Run in background
        slowMo: 50 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('📋 Starting vehicle registration automation...');
        
        // Navigate to VAHAN portal
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        console.log('✅ Navigated to VAHAN portal');
        
        // Step 1: Send OTP if not provided
        if (!data.otpSent) {
            await page.click('#loginBtn');
            await page.waitForSelector('#loginModal.show', { timeout: 5000 });
            console.log('✅ Opened login modal');
            
            await page.fill('#loginEmail', data.email);
            console.log(`✅ Filled email: ${data.email}`);
            
            await page.click('#sendOtpBtn');
            console.log('✅ Clicked Send OTP');
            
            await page.waitForTimeout(2000);
            await browser.close();
            
            return {
                success: true,
                step: 'otp_sent',
                message: 'OTP sent to email. Please provide OTP to continue.',
                data: { email: data.email }
            };
        }
        
        // Step 2: Verify OTP if not yet verified
        if (!data.loggedIn) {
            await page.click('#loginBtn');
            await page.waitForSelector('#loginModal.show', { timeout: 5000 });
            await page.fill('#loginEmail', data.email);
            await page.click('#sendOtpBtn');
            await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
            
            await page.fill('#loginOTP', data.otp);
            console.log(`✅ Filled OTP: ${data.otp}`);
            
            await page.click('#verifyOtpBtn');
            console.log('✅ Clicked Login');
            
            await page.waitForSelector('#logoutBtn', { timeout: 10000 });
            console.log('✅ Login successful');
            
            await browser.close();
            
            return {
                success: true,
                step: 'logged_in',
                message: 'Login successful. Please provide vehicle details.',
                data: { email: data.email, authenticated: true }
            };
        }
        
        // Step 3: Complete registration with vehicle details
        // Login first
        await page.click('#loginBtn');
        await page.waitForSelector('#loginModal.show', { timeout: 5000 });
        await page.fill('#loginEmail', data.email);
        await page.click('#sendOtpBtn');
        await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
        await page.fill('#loginOTP', data.otp);
        await page.click('#verifyOtpBtn');
        await page.waitForSelector('#logoutBtn', { timeout: 10000 });
        
        // Navigate to registration
        await page.click('a[onclick*="services"]');
        await page.waitForTimeout(1000);
        await page.click('.service-card:has-text("New Vehicle Registration")');
        await page.waitForSelector('#newRegModal.show', { timeout: 5000 });
        console.log('✅ Opened new registration modal');
        
        // Fill form
        await page.fill('#newReg_ownerName', data.ownerName);
        await page.fill('#newReg_fatherName', data.fatherName);
        await page.fill('#newReg_mobile', data.mobile);
        if (data.regEmail) await page.fill('#newReg_email', data.regEmail);
        await page.fill('#newReg_address', data.address);
        await page.fill('#newReg_class', data.vehicleClass);
        await page.fill('#newReg_model', data.model);
        await page.selectOption('#newReg_fuel', data.fuel);
        if (data.color) await page.fill('#newReg_color', data.color);
        await page.fill('#newReg_amount', '500000');
        await page.selectOption('#newReg_rto', data.rto);
        
        const checkboxes = await page.$$('#newRegModal input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            await checkbox.check();
        }
        
        await page.click('#newRegForm button[type="submit"]');
        await page.waitForSelector('#receiptModal.show', { timeout: 15000 });
        
        // Extract result
        const receiptText = await page.textContent('#receiptContentOutput');
        const regNoMatch = receiptText.match(/Vehicle Reg\. No: ([A-Z0-9]+)/);
        const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
        
        const result = {
            applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
            registrationNumber: regNoMatch ? regNoMatch[1] : 'N/A',
            ownerName: data.ownerName,
            model: data.model,
            status: 'COMPLETED'
        };
        
        // Logout
        await page.click('#receiptModal .close-btn');
        await page.waitForTimeout(500);
        await page.click('#logoutBtn');
        await page.waitForTimeout(1000);
        console.log('✅ Logged out');
        
        await browser.close();
        
        return {
            success: true,
            step: 'completed',
            message: 'Vehicle registered successfully',
            data: result
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

module.exports = registerVehicle;