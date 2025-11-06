// backend/automation/transferOwnership.js
const { chromium } = require('playwright');

async function transferOwnership(data) {
    const browser = await chromium.launch({ 
        headless: true,
        slowMo: 50 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🔄 Starting ownership transfer automation...');
        
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        
        // Step 1: Send OTP
        if (!data.otpSent) {
            await page.click('#loginBtn');
            await page.waitForSelector('#loginModal.show', { timeout: 5000 });
            await page.fill('#loginEmail', data.email);
            await page.click('#sendOtpBtn');
            await page.waitForTimeout(2000);
            await browser.close();
            
            return {
                success: true,
                step: 'otp_sent',
                message: 'OTP sent. Please provide OTP.',
                data: { email: data.email }
            };
        }
        
        // Step 2: Verify OTP
        if (!data.loggedIn) {
            await page.click('#loginBtn');
            await page.waitForSelector('#loginModal.show', { timeout: 5000 });
            await page.fill('#loginEmail', data.email);
            await page.click('#sendOtpBtn');
            await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
            await page.fill('#loginOTP', data.otp);
            await page.click('#verifyOtpBtn');
            await page.waitForSelector('#logoutBtn', { timeout: 10000 });
            await browser.close();
            
            return {
                success: true,
                step: 'logged_in',
                message: 'Login successful. Please provide transfer details.',
                data: { email: data.email, authenticated: true }
            };
        }
        
        // Step 3: Complete transfer
        await page.click('#loginBtn');
        await page.waitForSelector('#loginModal.show', { timeout: 5000 });
        await page.fill('#loginEmail', data.email);
        await page.click('#sendOtpBtn');
        await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
        await page.fill('#loginOTP', data.otp);
        await page.click('#verifyOtpBtn');
        await page.waitForSelector('#logoutBtn', { timeout: 10000 });
        
        // Search vehicle
        await page.fill('#regNumber', data.regNo);
        await page.selectOption('#stateSelect', data.regNo.substring(0, 2));
        const captchaText = await page.textContent('#captchaDisplay');
        await page.fill('#captchaInput', captchaText);
        await page.click('button[type="submit"]');
        await page.waitForSelector('#resultCard', { timeout: 10000 });
        
        await page.evaluate(() => {
            document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });
        });
        await page.waitForTimeout(1000);
        
        await page.click('button[onclick="showTransferModal()"]');
        await page.waitForSelector('#transferModal.show', { timeout: 5000 });
        
        // Fill transfer details
        await page.fill('#trans_newOwner', data.newOwnerName);
        await page.fill('#trans_newFather', data.newOwnerFather);
        await page.fill('#trans_newMobile', data.newOwnerMobile);
        await page.fill('#trans_newEmail', data.newOwnerEmail);
        await page.fill('#trans_newAddress', data.newOwnerAddress);
        await page.fill('#trans_amount', '500000');
        const today = new Date().toISOString().split('T')[0];
        await page.fill('#trans_date', today);
        
        const checkboxes = await page.$$('#transferModal input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            await checkbox.check();
        }
        
        await page.click('#transferForm button[type="submit"]');
        await page.waitForSelector('#receiptModal.show', { timeout: 15000 });
        
        const receiptText = await page.textContent('#receiptContentOutput');
        const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
        
        const result = {
            applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
            vehicleRegNo: data.regNo,
            newOwner: data.newOwnerName,
            status: 'COMPLETED'
        };
        
        await page.click('#receiptModal .close-btn');
        await page.waitForTimeout(500);
        await page.click('#logoutBtn');
        await page.waitForTimeout(1000);
        
        await browser.close();
        
        return {
            success: true,
            step: 'completed',
            message: 'Ownership transferred successfully',
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

module.exports = transferOwnership;