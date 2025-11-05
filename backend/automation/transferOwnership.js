// automation/transferOwnership.js
const { chromium } = require('playwright');

async function transferOwnership(data) {
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 100 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🔄 Starting ownership transfer automation...');
        
        // Navigate to VAHAN portal
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        console.log('✅ Navigated to VAHAN portal');
        
        // Login process
        await page.click('#loginBtn');
        await page.waitForSelector('#loginModal.show', { timeout: 5000 });
        await page.fill('#loginEmail', data.email);
        await page.click('#sendOtpBtn');
        await page.waitForSelector('#otpForm', { state: 'visible', timeout: 10000 });
        await page.fill('#loginOTP', data.otp);
        await page.click('#verifyOtpBtn');
        await page.waitForSelector('#logoutBtn', { timeout: 10000 });
        console.log('✅ Login successful');
        
        // Search for vehicle first
        await page.fill('#regNumber', data.regNo);
        await page.selectOption('#stateSelect', data.regNo.substring(0, 2));
        
        const captchaText = await page.textContent('#captchaDisplay');
        await page.fill('#captchaInput', captchaText);
        await page.click('button[type="submit"]');
        await page.waitForSelector('#resultCard', { timeout: 10000 });
        console.log('✅ Vehicle found');
        
        // Scroll to result card and click Transfer Ownership button
        await page.evaluate(() => {
            document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });
        });
        await page.waitForTimeout(1000);
        
        await page.click('button[onclick="showTransferModal()"]');
        await page.waitForSelector('#transferModal.show', { timeout: 5000 });
        console.log('✅ Opened transfer modal');
        
        // Fill new owner details
        await page.fill('#trans_newOwner', data.newOwnerName);
        await page.fill('#trans_newFather', data.newOwnerFather);
        await page.fill('#trans_newMobile', data.newOwnerMobile);
        await page.fill('#trans_newEmail', data.newOwnerEmail);
        await page.fill('#trans_newAddress', data.newOwnerAddress);
        await page.fill('#trans_amount', '500000'); // Default sale amount
        
        // Set today's date for transfer date
        const today = new Date().toISOString().split('T')[0];
        await page.fill('#trans_date', today);
        console.log('✅ Filled new owner details');
        
        // Check all required document checkboxes
        const checkboxes = await page.$$('#transferModal input[type="checkbox"]');
        for (const checkbox of checkboxes) {
            await checkbox.check();
        }
        console.log('✅ Checked all required documents');
        
        // Submit form
        await page.click('#transferForm button[type="submit"]');
        console.log('✅ Submitted transfer form');
        
        // Wait for receipt modal
        await page.waitForSelector('#receiptModal.show', { timeout: 15000 });
        console.log('✅ Receipt modal appeared');
        
        // Extract transfer details
        const receiptText = await page.textContent('#receiptContentOutput');
        const appIdMatch = receiptText.match(/Application ID: ([A-Z0-9]+)/);
        const newOwnerMatch = receiptText.match(/New Owner: ([A-Z\s]+)/);
        
        const result = {
            applicationId: appIdMatch ? appIdMatch[1] : 'N/A',
            vehicleRegNo: data.regNo,
            newOwner: newOwnerMatch ? newOwnerMatch[1].trim() : data.newOwnerName,
            status: 'COMPLETED'
        };
        
        console.log('✅ Extracted transfer details:', result);
        
        // Take screenshot
        await page.screenshot({ path: 'automation/screenshots/transfer-receipt.png', fullPage: true });
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
            message: 'Ownership transferred successfully',
            data: result
        };
        
    } catch (error) {
        console.error('❌ Automation error:', error.message);
        await page.screenshot({ path: 'automation/screenshots/transfer-error.png', fullPage: true });
        await browser.close();
        
        return {
            success: false,
            message: error.message,
            data: null
        };
    }
}

module.exports = transferOwnership;