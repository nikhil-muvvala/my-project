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
            
            const browser = await chromium.launch({
                headless: true, 
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });
            
            const page = await context.newPage();
            const newSessionId = `search_${Date.now()}`;
            activeSessions.set(newSessionId, { browser, context, page });
            
            // --- THIS IS THE FIX ---
            await page.goto('http://localhost:5000/index.html', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            // --- END OF FIX ---
            
            console.log('✅ Page loaded successfully');
            
            await page.waitForSelector('#regNumber', { timeout: 10000 });
            await page.fill('#regNumber', regNo.toUpperCase());
            await page.selectOption('#stateSelect', state);
            console.log(`✅ Filled form with RegNo: ${regNo}, State: ${state}`);
            
            await page.waitForSelector('#captchaDisplay', { timeout: 5000 });
            await page.waitForTimeout(1000); 
            
            const captchaElement = await page.$('#captchaDisplay');
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }
            const screenshotPath = path.join(screenshotsDir, `captcha_${newSessionId}.png`);
            
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
            const session = activeSessions.get(sessionId);
            if (!session) {
                throw new Error('Session expired. Please start again.');
            }
            
            const { browser, context, page } = session;
            
            await page.fill('#captchaInput', captcha);
            console.log(`✅ Filled captcha: ${captcha}`);

            // This injects the correct answer, bypassing the replica's JS check
            await page.evaluate((captcha) => {
                window.currentCaptcha = captcha;
            }, captcha);
            
            await page.click('button[type="submit"]');
            console.log('✅ Form submitted, waiting for results...');
            
            await page.waitForSelector('#resultCard', { 
                state: 'visible',
                timeout: 15000 
            });
            console.log('✅ Results loaded');
            
            await page.waitForTimeout(1000); 
            
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
                    ownerName: getData('res_ownerName_header'),
                    fatherName: getData('res_fatherName_header'),
                    mobile: getData('res_mobile_display'),
                    email: getData('res_email_display'),
                    address: getData('res_address_display'),
                    permAddress: getData('res_permAddress_display'),
                    financer: getData('res_financer')
                };
            });
            
            console.log('✅ Vehicle data extracted');
            
            await browser.close();
            activeSessions.delete(sessionId);
            
            const screenshotPath = path.join(__dirname, 'screenshots', `captcha_${sessionId}.png`);
            if (fs.existsSync(screenshotPath)) {
                fs.unlinkSync(screenshotPath);
            }
            
            const formattedData = formatVehicleSummary(vehicleData);

            return {
                success: true,
                needsCaptcha: false,
                data: formattedData,
                message: 'Vehicle details fetched successfully'
            };
        }
        
    } catch (error) {
        console.error('❌ Automation Error:', error.message);
        
        if (sessionId && activeSessions.has(sessionId)) {
            const session = activeSessions.get(sessionId);
            await session.browser.close().catch(() => {});
            activeSessions.delete(sessionId);
        }

        if (error.message.includes('page.waitForSelector: Timeout')) {
            return {
                success: false,
                message: 'Automation failed: Invalid captcha or vehicle not found in database. Please try again.',
                data: null
            };
        }
        
        return {
            success: false,
            message: error.message || 'Automation failed',
            data: null
        };
    }
}

function formatVehicleSummary(vehicleData) {
    const safe = (value, fallback = '-') => value && value !== '-' ? value : fallback;

    return {
        registrationInfo: {
            registrationNumber: safe(vehicleData.regNo),
            registrationDate: safe(vehicleData.regDate),
            registeringAuthority: safe(vehicleData.rto),
            stateCode: safe(vehicleData.rto?.split(' ')[0]),
            vehicleClass: safe(vehicleData.class),
            makerModel: safe(vehicleData.model),
            manufactureYear: safe(vehicleData.year),
            fuelType: safe(vehicleData.fuel),
            color: safe(vehicleData.color)
        },
        vehicleSpecs: {
            engineNumber: safe(vehicleData.engine),
            chassisNumber: safe(vehicleData.chassis),
            seatingCapacity: safe(vehicleData.seating),
            financer: safe(vehicleData.financer)
        },
        ownerInfo: {
            ownerName: safe(vehicleData.ownerName),
            guardianName: safe(vehicleData.fatherName),
            contactNumber: safe(vehicleData.mobile),
            email: safe(vehicleData.email),
            currentAddress: safe(vehicleData.address),
            permanentAddress: safe(vehicleData.permAddress)
        },
        complianceStatus: {
            insuranceStatus: safe(vehicleData.insStatus),
            insuranceValidFrom: safe(vehicleData.insFrom),
            insuranceValidTill: safe(vehicleData.insUpto),
            insuranceCompany: safe(vehicleData.insCompany),
            policyNumber: safe(vehicleData.policyNo),
            fitnessValidTill: safe(vehicleData.fitnessUpto),
            fitnessStatus: safe(vehicleData.fitnessStatus),
            pucStatus: safe(vehicleData.pucStatus),
            pucValidTill: safe(vehicleData.pucUpto),
            taxPaidUpto: safe(vehicleData.taxUpto)
        },
        rawData: vehicleData
    };
}

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
setInterval(cleanupOldSessions, 5 * 60 * 1000);

module.exports = searchVehicle;
