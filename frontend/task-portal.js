// frontend/task-portal.js

// --- CHATBOT STATE ---
let currentTaskState = 'idle'; 
let sessionData = {}; 
// Get the Portal User (who is logged in)
let currentUser = JSON.parse(localStorage.getItem('portalUser')) || {};

// --- HTML ELEMENTS ---
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const inputEl = document.getElementById('user-input');
const statusBar = document.getElementById('status-bar');

// --- NEW: Add listeners for new buttons ---
const editProfileBtn = document.getElementById('editProfileBtn');
const logoutBtn = document.getElementById('logoutBtn');

// --- REGEX HELPERS ---
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const regNoRegex = /([A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4})/i; 
const indianStates = [
    { code: 'AP', name: 'Andhra Pradesh' }, { code: 'AR', name: 'Arunachal Pradesh' },
    { code: 'AS', name: 'Assam' }, { code: 'BR', name: 'Bihar' },
    { code: 'CG', name: 'Chhattisgarh' }, { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' }, { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' }, { code: 'JK', name: 'Jammu and Kashmir' },
    { code: 'JH', name: 'Jharkhand' }, { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' }, { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' }, { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' }, { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' }, { code: 'OD', name: 'Odisha' },
    { code: 'PB', name: 'Punjab' }, { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' }, { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TS', name: 'Telangana' }, { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' }, { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' }, { code: 'AN', name: 'Andaman and Nicobar' },
    { code: 'CH', name: 'Chandigarh' }, { code: 'DD', name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: 'DL', name: 'Delhi' }, { code: 'LA', name: 'Ladakh' },
    { code: 'LD', name: 'Lakshadweep' }, { code: 'PY', name: 'Puducherry' }
];
const stateOptions = indianStates.map(state => 
    `<option value="${state.code}">${state.name} (${state.code})</option>`
).join('');
const stateNameMap = indianStates.reduce((acc, state) => {
    acc[state.name.toLowerCase()] = state.code;
    acc[state.code.toLowerCase()] = state.code;
    return acc;
}, {});

// --- EVENT LISTENER ---
chatForm.addEventListener('submit', handleUserInput);
// NEW: Listen for clicks on the new buttons
editProfileBtn.addEventListener('click', () => {
    if (currentTaskState !== 'idle' && currentTaskState !== 'form_pending') {
        addMessageToLog('Please wait for the current task to finish before editing your profile.', 'error');
        return;
    }
    addMessageToLog('OK, I can help you update your profile. Please fill out the form below.', 'bot');
    showProfileForm();
    currentTaskState = 'form_pending';
});
logoutBtn.addEventListener('click', handleLogout);


window.onload = async () => {
    addMessageToLog(`Hello, <b>${currentUser.name || 'user'}</b>! How can I help you today?<br><br>You can say things like:<br>• <b>get details for DL01AB1234 from Delhi</b><br>• <b>register a new car</b><br>• <b>I want to book a passport</b>`, 'bot');
    await fetchCurrentUserProfile();
}

async function fetchCurrentUserProfile() {
    try {
        const token = localStorage.getItem('portalUserToken');
        const res = await fetch('/api/portal-auth/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user; 
            localStorage.setItem('portalUser', JSON.stringify({
                id: data.user._id,
                name: data.user.username,
                email: data.user.email
            })); 
            console.log('Full user profile loaded:', currentUser);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Error fetching full profile:', error);
        addMessageToLog('Could not fetch your profile details, forms may not pre-fill.', 'error');
    }
}


// --- 1. THE BRAIN: Handles all user input ---
async function handleUserInput(e) {
    e.preventDefault();
    const userInput = inputEl.value.trim();
    if (!userInput) return;

    addMessageToLog(userInput, 'user');
    inputEl.value = ''; 
    setThinking(true);

    try {
        if (currentTaskState !== 'idle') {
            await handleMidTaskInput(userInput);
        } else {
            const aiResponse = await callBrain(userInput);
            await handleNewRequest(aiResponse);
        }
    } catch (error) {
        console.error("A critical error occurred:", error);
        addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
        resetChat();
    }
    
    setThinking(false);
}

// --- 2. THE ROUTER: Now uses the AI's response ---
async function handleNewRequest(aiResponse) {
    const { task, regNo, state, eId, reply } = aiResponse;

    switch (task) {
        case 'search':
            if (!regNo || !state) {
                addMessageToLog("I can help with that, but I need the full vehicle number and the state. <br>For example: <b>'search DL01AB1234 in DL'</b>", 'bot');
                return;
            }
            sessionData = { regNo, state };
            addMessageToLog(`OK, I will search for <b>${regNo}</b> in state <b>${state}</b>. Fetching captcha...`, 'bot');
            
            const result = await callAutomation('search', { regNo, state });
            
            sessionData.sessionId = result.sessionId;
            currentTaskState = 'awaiting_search_captcha';
            addMessageToLog(`Please type the captcha code below:<br><img src="${result.captchaImageBase64}" class="captcha-image" alt="captcha">`, 'bot');
            break;

        case 'register':
            currentTaskState = 'awaiting_register_email_confirm';
            addMessageToLog(`OK, starting new vehicle registration.<br><br>Should I use your login email (<b>${currentUser.email}</b>) for the automation? <br>Type <b>yes</b> or enter a <b>different email</b>.`, 'bot');
            break;

        case 'transfer':
            currentTaskState = 'awaiting_transfer_email_confirm';
            addMessageToLog(`OK, starting ownership transfer.<br><br>Should I use your login email (<b>${currentUser.email}</b>) as the current owner? <br>Type <b>yes</b> or enter the <b>owner's email</b>.`, 'bot');
            break;

        case 'update':
            currentTaskState = 'awaiting_update_email_confirm';
            addMessageToLog(`OK, starting contact update.<br><br>Should I use your login email (<b>${currentUser.email}</b>) for the automation? <br>Type <b>yes</b> or enter a <b>different email</b>.`, 'bot');
            break;

        // --- NEW: PASSPORT CASE ---
        case 'passport_fresh':
            currentTaskState = 'awaiting_passport_password';
            addMessageToLog(`OK, starting a <b>Fresh Passport</b> application.<br>I'll use your profile details (<b>${currentUser.username}</b>, <b>${currentUser.email}</b>) to log in to the passport portal.<br><br>Please enter a <b>dummy password</b> for the automation to use (it can be anything, like "123").`, 'bot');
            break;
        // --- END NEW CASE ---

        // --- NEW: E-ID REGISTRATION CASE ---
        case 'eid_register':
            currentTaskState = 'form_pending';
            addMessageToLog(`OK, starting <b>E-ID Registration</b>.<br>I'll use your profile details to pre-fill the form. Please fill out the registration form below.`, 'bot');
            showEidRegisterForm();
            break;
        // --- END NEW CASE ---

        // --- NEW: E-ID SEARCH CASE ---
        case 'eid_search':
            const eIdToSearch = aiResponse.eId;
            if (!eIdToSearch) {
                currentTaskState = 'awaiting_eid_search_number';
                addMessageToLog(`OK, starting <b>E-ID Search</b>.<br><br>Please provide the 12-digit E-ID number you want to search for.`, 'bot');
            } else {
                // E-ID provided, search directly
                sessionData = { eId: eIdToSearch };
                addMessageToLog(`OK, searching for E-ID <b>${eIdToSearch}</b>...`, 'bot');
                handleEidSearch();
            }
            break;
        // --- END NEW CASE ---

        // --- NEW: E-ID UPDATE CASE ---
        case 'eid_update':
            const eIdToUpdate = aiResponse.eId;
            if (!eIdToUpdate) {
                currentTaskState = 'awaiting_eid_update_number';
                addMessageToLog(`OK, starting <b>E-ID Update</b>.<br><br>Please provide the 12-digit E-ID number you want to update.`, 'bot');
            } else {
                // E-ID provided, start update flow
                sessionData = { eId: eIdToUpdate };
                addMessageToLog(`OK, finding E-ID <b>${eIdToUpdate}</b>...`, 'bot');
                handleEidUpdateFind();
            }
            break;
        // --- END NEW CASE ---

        case 'unknown':
        default:
            addMessageToLog(reply || "Sorry, I'm not sure how to help with that. I can help with VAHAN services like 'search', 'register', 'transfer', or 'update', and passport applications.", 'bot');
            break;
    }
}

// --- 3. THE STATE MACHINE (This handles the multi-step conversations) ---
async function handleMidTaskInput(userInput) {
    
    switch (currentTaskState) {
        
        // --- SEARCH FLOW (Unchanged) ---
        case 'awaiting_search_captcha':
            sessionData.captcha = userInput.toUpperCase();
            addMessageToLog('OK, checking captcha and fetching details...', 'bot');
            const result = await callAutomation('search', sessionData);
            showResult(result.data, 'search');
            resetChat();
            break;
        
        // --- REGISTRATION FLOW (Unchanged) ---
        case 'awaiting_register_email_confirm': 
            if (userInput.toLowerCase() === 'yes') {
                sessionData = { email: currentUser.email };
                addMessageToLog('Got it. Sending OTP to ' + currentUser.email + '...', 'bot');
            } else if (emailRegex.test(userInput)) {
                sessionData = { email: userInput };
                addMessageToLog('Got it. Sending OTP to ' + userInput + '...', 'bot');
            } else {
                addMessageToLog("That's not a valid email. Please type <b>yes</b> or a <b>different email</b>.", 'bot');
                return; 
            }
            const regResult1 = await callAutomation('register', sessionData); 
            sessionData.sessionId = regResult1.sessionId;
            currentTaskState = 'awaiting_register_otp';
            addMessageToLog('OTP Sent. Please enter the 6-digit code.', 'bot');
            break;
            
        case 'awaiting_register_otp':
            sessionData.otp = userInput;
            addMessageToLog('Verifying OTP...', 'bot');
            const regResult2 = await callAutomation('register', sessionData);
            addMessageToLog('Login successful! Please fill out the form below to register your vehicle.', 'bot');
            showRegisterForm(); 
            currentTaskState = 'form_pending';
            break;
            
        // --- TRANSFER FLOW (Unchanged) ---
        case 'awaiting_transfer_email_confirm':
            if (userInput.toLowerCase() === 'yes') {
                sessionData = { email: currentUser.email };
                addMessageToLog('Got it. Sending OTP to ' + currentUser.email + '...', 'bot');
            } else if (emailRegex.test(userInput)) {
                sessionData = { email: userInput };
                addMessageToLog('Got it. Sending OTP to ' + userInput + '...', 'bot');
            } else {
                addMessageToLog("That's not a valid email. Please type <b>yes</b> or a <b>different email</b>.", 'bot');
                return;
            }
            const transResult1 = await callAutomation('transfer', sessionData);
            sessionData.sessionId = transResult1.sessionId;
            currentTaskState = 'awaiting_transfer_otp';
            addMessageToLog('OTP Sent. Please enter the 6-digit code.', 'bot');
            break;
            
        case 'awaiting_transfer_otp':
            sessionData.otp = userInput;
            addMessageToLog('Verifying OTP...', 'bot');
            const transResult2 = await callAutomation('transfer', sessionData);
            currentTaskState = 'awaiting_transfer_vehicle';
            addMessageToLog('Login successful! Please provide the vehicle you want to transfer in this format:<br><br><code>[Reg No], [State Code]</code> (e.g., <code>MH01XY5678, MH</code>)', 'bot');
            break;

        case 'awaiting_transfer_vehicle':
            const vehicleInfo = userInput.split(',').map(s => s.trim());
            if (vehicleInfo.length < 2) {
                addMessageToLog('<b>Error:</b> Please provide both the Registration Number and State Code, separated by a comma.', 'error');
                return;
            }
            sessionData.regNo = vehicleInfo[0].toUpperCase();
            sessionData.state = stateNameMap[vehicleInfo[1].toLowerCase()] || vehicleInfo[1].toUpperCase();
            addMessageToLog(`OK, finding <b>${sessionData.regNo}</b>... fetching search captcha.`, 'bot');
            
            const transResult3 = await callAutomation('transfer', sessionData);
            currentTaskState = 'awaiting_transfer_search_captcha';
            addMessageToLog(`Please type the search captcha code:<br><img src="${transResult3.captchaImageBase64}" class="captcha-image" alt="captcha">`, 'bot');
            break;

        case 'awaiting_transfer_search_captcha':
            sessionData.searchCaptcha = userInput.toUpperCase();
            addMessageToLog('OK, checking captcha and opening transfer form...', 'bot');
            const transResult4 = await callAutomation('transfer', sessionData);
            addMessageToLog('Vehicle found! Please fill out the new owner\'s details in the form below.', 'bot');
            showTransferForm();
            currentTaskState = 'form_pending';
            break;

        // --- UPDATE FLOW (Unchanged) ---
        case 'awaiting_update_email_confirm':
             if (userInput.toLowerCase() === 'yes') {
                sessionData = { email: currentUser.email };
                addMessageToLog('Got it. Sending OTP to ' + currentUser.email + '...', 'bot');
            } else if (emailRegex.test(userInput)) {
                sessionData = { email: userInput };
                addMessageToLog('Got it. Sending OTP to ' + userInput + '...', 'bot');
            } else {
                addMessageToLog("That's not a valid email. Please type <b>yes</b> or a <b>different email</b>.", 'bot');
                return;
            }
            const updateResult1 = await callAutomation('update', sessionData);
            sessionData.sessionId = updateResult1.sessionId;
            currentTaskState = 'awaiting_update_otp';
            addMessageToLog('OTP Sent. Please enter the 6-digit code.', 'bot');
            break;

        case 'awaiting_update_otp':
            sessionData.otp = userInput;
            addMessageToLog('Verifying OTP...', 'bot');
            const updateResult2 = await callAutomation('update', sessionData);
            currentTaskState = 'awaiting_update_vehicle';
            addMessageToLog('Login successful! Please provide the vehicle you want to update in this format:<br><br><code>[Reg No], [State Code]</code> (e.g., <code>MH01XY5678, MH</code>)', 'bot');
            break;

        case 'awaiting_update_vehicle':
            const updateVehicleInfo = userInput.split(',').map(s => s.trim());
            if (updateVehicleInfo.length < 2) {
                addMessageToLog('<b>Error:</b> Please provide both the Registration Number and State Code, separated by a comma.', 'error');
                return;
            }
            sessionData.regNo = updateVehicleInfo[0].toUpperCase();
            sessionData.state = stateNameMap[updateVehicleInfo[1].toLowerCase()] || updateVehicleInfo[1].toUpperCase();
            addMessageToLog(`OK, finding <b>${sessionData.regNo}</b>... fetching search captcha.`, 'bot');
            
            const updateResult3 = await callAutomation('update', sessionData);
            currentTaskState = 'awaiting_update_search_captcha';
            addMessageToLog(`Please type the search captcha code:<br><img src="${updateResult3.captchaImageBase64}" class="captcha-image" alt="captcha">`, 'bot');
            break;
        
        case 'awaiting_update_search_captcha':
            sessionData.searchCaptcha = userInput.toUpperCase();
            addMessageToLog('OK, checking captcha and opening update form...', 'bot');
            const updateResult4 = await callAutomation('update', sessionData);
            addMessageToLog('Vehicle found! Please fill in the new details in the form below.', 'bot');
            showUpdateForm();
            currentTaskState = 'form_pending';
            break;
        
        // --- NEW: PASSPORT FLOW ---
        case 'awaiting_passport_password':
            sessionData = {
                loginName: currentUser.username, // Use portal user's name
                loginEmail: currentUser.email, // Use portal user's email
                loginPassword: userInput // The dummy password
            };
            addMessageToLog('Got it. Logging into the passport portal automation...', 'bot');
            const passResult1 = await callAutomation('passport_fresh', sessionData);
            
            sessionData.sessionId = passResult1.sessionId;
            currentTaskState = 'form_pending';
            addMessageToLog('Login successful! Please fill out the passport application form below.', 'bot');
            showFreshPassportForm(); // Show the new form
            break;

        case 'awaiting_passport_captcha':
            sessionData.captcha = userInput.toUpperCase();
            addMessageToLog('OK, verifying captcha and submitting application...', 'bot');
            
            const passResult3 = await callAutomation('passport_fresh', {
                sessionId: sessionData.sessionId,
                step: 'submit_captcha',
                captcha: sessionData.captcha,
                // We must re-send the form data so the script can scrape the name
                givenName: sessionData.givenName 
            });

            showResult(passResult3.data, 'passport_fresh');
            resetChat();
            break;
        // --- END NEW FLOW ---

        // --- NEW: E-ID REGISTRATION FLOW ---
        case 'awaiting_eid_captcha':
            sessionData.captcha = userInput.toUpperCase();
            addMessageToLog('OK, verifying captcha and completing registration...', 'bot');
            
            const eidResult2 = await callAutomation('eid_register', {
                sessionId: sessionData.sessionId,
                step: 'submit_captcha',
                captcha: sessionData.captcha,
                // Re-send form data for result display
                name: sessionData.name
            });

            showResult(eidResult2.data, 'eid_register');
            resetChat();
            break;
        // --- END NEW E-ID FLOW ---

        // --- NEW: E-ID SEARCH FLOW ---
        case 'awaiting_eid_search_number':
            const eIdInput = userInput.trim().replace(/\s/g, ''); // Remove spaces
            if (eIdInput.length !== 12 || !/^\d+$/.test(eIdInput)) {
                addMessageToLog('<b>Error:</b> Please provide a valid 12-digit E-ID number (e.g., 123456789012).', 'error');
                return;
            }
            sessionData = { eId: eIdInput };
            addMessageToLog(`OK, searching for E-ID <b>${eIdInput}</b>...`, 'bot');
            await handleEidSearch();
            break;
        // --- END NEW E-ID SEARCH FLOW ---

        // --- NEW: E-ID UPDATE FLOW ---
        case 'awaiting_eid_update_number':
            const eIdUpdateInput = userInput.trim().replace(/\s/g, ''); // Remove spaces
            if (eIdUpdateInput.length !== 12 || !/^\d+$/.test(eIdUpdateInput)) {
                addMessageToLog('<b>Error:</b> Please provide a valid 12-digit E-ID number (e.g., 123456789012).', 'error');
                return;
            }
            sessionData = { eId: eIdUpdateInput };
            addMessageToLog(`OK, finding E-ID <b>${eIdUpdateInput}</b>...`, 'bot');
            await handleEidUpdateFind();
            break;

        case 'awaiting_eid_update_fields':
            // User will provide field updates in a form, handled separately
            break;

        case 'awaiting_eid_update_captcha':
            sessionData.captcha = userInput.toUpperCase();
            addMessageToLog('OK, verifying captcha and completing update...', 'bot');
            
            const eidUpdateResult = await callAutomation('eid_update', {
                sessionId: sessionData.sessionId,
                step: 'submit_captcha',
                captcha: sessionData.captcha,
                eId: sessionData.eId,
                name: sessionData.name,
                phone: sessionData.phone,
                address: sessionData.address
            });

            showResult(eidUpdateResult.data, 'eid_update');
            resetChat();
            break;
        // --- END NEW E-ID UPDATE FLOW ---

        case 'form_pending':
            addMessageToLog('Please fill out the form above to continue. Your text here is ignored until the form is submitted.', 'bot');
            break;

        default:
            addMessageToLog("I'm sorry, I'm a bit lost. Let's start over.", 'bot');
            resetChat();
    }
}
        
// --- 4. FORM DISPLAY & SUBMIT FUNCTIONS ---

function showRegisterForm() {
    // This form now correctly uses the logged-in user's info for pre-filling
    const formHtml = `
        <div class="chat-form-container">
            <h4>📋 New Vehicle Registration</h4>
            <p style="color: #666; font-size: 13px; margin-bottom: 20px;">
                Your automation email is <strong>${sessionData.email}</strong>.
                Your portal user <strong>${currentUser.username}</strong> is logged in.
            </p>
            <h4>Owner Details</h4>
            <div class="form-row">
                <div class="form-group"><label>Owner Name *</label><input type="text" id="reg_ownerName" value="${currentUser.username || ''}"></div>
                <div class="form-group"><label>Father/Husband Name *</label><input type="text" id="reg_fatherName" placeholder="Father's Name"></div>
            </div>
            <div class="form-group"><label>Mobile Number *</label><input type="tel" id="reg_mobile" value="${currentUser.phoneno || ''}" pattern="[0-9]{10}"></div>
            <div class="form-group"><label>Address *</label><textarea id="reg_address" rows="3" placeholder="Full Address">${currentUser.address || ''}</textarea></div>
            <h4>Vehicle Details</h4>
            <div class="form-row">
                <div class="form-group"><label>Vehicle Class *</label><input type="text" id="reg_vehicleClass" placeholder="e.g., Motor Car"></div>
                <div class="form-group"><label>Maker / Model *</label><input type="text" id="reg_model" placeholder="e.g., MARUTI SUZUKI SWIFT VXI"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Fuel Type *</label><select id="reg_fuel"><option>Petrol</option><option>Diesel</option><option>CNG</option><option>Electric</option></select></div>
                <div class="form-group"><label>Color *</label><input type="text" id="reg_color" placeholder="e.g., White"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Ex-Showroom Price (₹) *</label><input type="number" id="reg_price" placeholder="500000"></div>
                <div class="form-group"><label>Select RTO / State *</label><select id="reg_rto"><option value="">-- Select State --</option>${stateOptions}</select></div>
            </div>
            <button class="btn" onclick="handleRegisterSubmit()">Submit Registration</button>
            <div class="status-message" id="formStatusMsg"></div>
        </div>
    `;
    addMessageToLog(formHtml, 'bot');
}

async function handleRegisterSubmit() {
    setThinking(true);
    const vehicleData = {
        sessionId: sessionData.sessionId,
        email: sessionData.email,
        otp: sessionData.otp,
        ownerName: document.getElementById('reg_ownerName').value,
        fatherName: document.getElementById('reg_fatherName').value,
        mobile: document.getElementById('reg_mobile').value,
        address: document.getElementById('reg_address').value,
        vehicleClass: document.getElementById('reg_vehicleClass').value,
        model: document.getElementById('reg_model').value,
        fuel: document.getElementById('reg_fuel').value,
        color: document.getElementById('reg_color').value,
        price: document.getElementById('reg_price').value,
        rto: document.getElementById('reg_rto').value
    };
    for (let key in vehicleData) {
        if (!vehicleData[key] && key !== 'sessionId') { 
            document.getElementById('formStatusMsg').textContent = `Please fill in all fields. "${key}" is missing.`;
            document.getElementById('formStatusMsg').className = 'status-message show error';
            setThinking(false);
            return;
        }
    }
    addMessageToLog('Got it. Submitting registration...', 'bot');
    try {
        const result = await callAutomation('register', vehicleData);
        showResult(result.data, 'register');
    } catch (error) {
         addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
    } finally {
        resetChat();
        setThinking(false);
    }
}

function showTransferForm() {
    const formHtml = `
        <div class="chat-form-container">
            <h4>🔄 Transfer Ownership - Step 5: New Owner Details</h4>
            <h4>New Owner Details</h4>
            <div class="form-row">
                <div class="form-group"><label>New Owner Name *</label><input type="text" id="trans_newOwnerName" placeholder="Full Name"></div>
                <div class="form-group"><label>Father/Husband Name *</label><input type="text" id="trans_newOwnerFather" placeholder="Father's Name"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Mobile Number *</label><input type="tel" id="trans_newOwnerMobile" placeholder="9876543210" pattern="[0-9]{10}"></div>
                <div class="form-group"><label>Email (for New Owner's Login) *</label><input type="email" id="trans_newOwnerEmail" placeholder="new.owner@example.com"></div>
            </div>
            <div class="form-group"><label>Address *</label><textarea id="trans_newOwnerAddress" rows="3" placeholder="New Owner's Full Address"></textarea></div>
            <div class="form-group"><label>Sale Amount (₹) *</label><input type="number" id="trans_saleAmount" placeholder="500000"></div>
            <button class="btn" onclick="handleTransferSubmit()">Submit Transfer Application</button>
            <div class="status-message" id="formStatusMsg"></div>
        </div>
    `;
    addMessageToLog(formHtml, 'bot');
}

async function handleTransferSubmit() {
    setThinking(true);
    const transferData = {
        sessionId: sessionData.sessionId, 
        email: sessionData.email, // Added
        otp: sessionData.otp, // Added
        regNo: sessionData.regNo, // Added
        state: sessionData.state, // Added
        searchCaptcha: sessionData.searchCaptcha, // Added
        newOwnerName: document.getElementById('trans_newOwnerName').value,
        newOwnerFather: document.getElementById('trans_newOwnerFather').value,
        newOwnerMobile: document.getElementById('trans_newOwnerMobile').value,
        newOwnerEmail: document.getElementById('trans_newOwnerEmail').value,
        newOwnerAddress: document.getElementById('trans_newOwnerAddress').value,
        saleAmount: document.getElementById('trans_saleAmount').value
    };
    for (let key in transferData) {
        if (!transferData[key] && key !== 'sessionId') {
            document.getElementById('formStatusMsg').textContent = `Please fill in all fields. "${key}" is missing.`;
            document.getElementById('formStatusMsg').className = 'status-message show error';
            setThinking(false);
            return;
        }
    }
    addMessageToLog('Got it. Submitting final application...', 'bot');
    try {
        const result = await callAutomation('transfer', transferData);
        showResult(result.data, 'transfer');
    } catch (error) {
         addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
    } finally {
        resetChat();
        setThinking(false);
    }
}
        
function showUpdateForm() {
    const formHtml = `
        <div class="chat-form-container">
            <h4>✏️ Update Contacts - Step 5: New Details</h4>
            <p style="color: #666; font-size: 13px; margin-bottom: 20px;">
                Your automation login email (<strong>${sessionData.email}</strong>) will be used.
            </p>
            <div class="form-group">
                <label>New Address *</label>
                <textarea id="update_newAddress" rows="3" placeholder="New Full Address"></textarea>
            </div>
            <div class="form-group">
                <label>New Mobile Number *</label>
                <input type="tel" id="update_newMobile" placeholder="9876543210" pattern="[0-9]{10}">
            </div>
            <button class="btn" onclick="handleUpdateSubmit()">Submit Update</button>
            <div class="status-message" id="formStatusMsg"></div>
        </div>
    `;
    addMessageToLog(formHtml, 'bot');
}

async function handleUpdateSubmit() {
    setThinking(true);
    const updateData = {
        sessionId: sessionData.sessionId, 
        email: sessionData.email, // Added
        otp: sessionData.otp, // Added
        regNo: sessionData.regNo, // Added
        state: sessionData.state, // Added
        searchCaptcha: sessionData.searchCaptcha, // Added
        newAddress: document.getElementById('update_newAddress').value,
        newMobile: document.getElementById('update_newMobile').value,
    };
    for (let key in updateData) {
        if (!updateData[key] && key !== 'sessionId') {
            document.getElementById('formStatusMsg').textContent = `Please fill in all fields. "${key}" is missing.`;
            document.getElementById('formStatusMsg').className = 'status-message show error';
            setThinking(false);
            return;
        }
    }
    addMessageToLog('Got it. Submitting final update...', 'bot');
    try {
        const result = await callAutomation('update', updateData);
        showResult(result.data, 'update');
    } catch (error) {
         addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
    } finally {
        resetChat();
        setThinking(false);
    }
}

// --- NEW: PASSPORT FORM FUNCTIONS ---
function showFreshPassportForm() {
    const formHtml = `
        <div class="chat-form-container">
            <h4>🛂 Fresh Passport - Step 2: Application Details</h4>
            <p>Using <b>${currentUser.username}</b> & <b>${currentUser.email}</b>. Details from your profile are pre-filled.</p>
            
            <h4>Passport Type</h4>
            <div class="form-row">
                <div class="form-group">
                    <label>Service Type *</label>
                    <select id="pass_serviceType">
                        <option value="normal">Normal</option>
                        <option value="tatkaal">Tatkaal</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Booklet *</label>
                    <select id="pass_bookletType">
                        <option value="36">36 Pages</option>
                        <option value="60">60 Pages</option>
                    </select>
                </div>
            </div>

            <h4>Applicant Details</h4>
            <div class="form-row">
                <div class="form-group"><label>Given Name *</label><input type="text" id="pass_givenName" value="${currentUser.username || ''}"></div>
                <div class="form-group"><label>Surname</label><input type="text" id="pass_surname"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Gender *</label><select id="pass_gender"><option value="Male">Male</option><option value="Female">Female</option><option value="Transgender">Transgender</option></select></div>
                <div class="form-group"><label>Date of Birth *</label><input type="date" id="pass_dob"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Place of Birth *</label><input type="text" id="pass_placeOfBirth" placeholder="e.g., Hyderabad"></div>
                <div class="form-group"><label>Marital Status *</label><select id="pass_maritalStatus"><option value="Single">Single</option><option value="Married">Married</option></select></div>
            </div>
            <div class="form-group"><label>Employment *</label><select id="pass_employment"><option value="Private">Private</option><option value="Government">Government</option><option value="Student">Student</option></select></div>

            <h4>Family Details</h4>
            <div class="form-row">
                <div class="form-group"><label>Father's Given Name *</label><input type="text" id="pass_fatherGivenName"></div>
                <div class="form-group"><label>Mother's Given Name *</label><input type="text" id="pass_motherGivenName"></div>
            </div>
            
            <h4>Address Details</h4>
            <div class="form-group"><label>House No. & Street *</label><input type="text" id="pass_houseNo" value="${currentUser.address || ''}"></div>
            <div class="form-row">
                <div class="form-group"><label>City *</label><input type="text" id="pass_city" placeholder="e.g., Hyderabad"></div>
                <div class="form-group"><label>PIN Code *</label><input type="text" id="pass_pincode" placeholder="e.g., 500001"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>State *</label><select id="pass_state"><option value="">-- Select --</option>${stateOptions}</select></div>
                <div class="form-group"><label>Mobile *</label><input type="tel" id="pass_mobile" value="${currentUser.phoneno || ''}"></div>
            </div>

            <h4>Emergency Contact</h4>
            <div class="form-row">
                <div class="form-group"><label>EC Name *</label><input type="text" id="pass_emergencyName"></div>
                <div class="form-group"><label>EC Mobile *</label><input type="tel" id="pass_emergencyMobile"></div>
            </div>

            <button class="btn" onclick="handleFreshPassportSubmit()">Submit & Get Captcha</button>
            <div class="status-message" id="formStatusMsg"></div>
        </div>
    `;
    addMessageToLog(formHtml, 'bot');
}

async function handleFreshPassportSubmit() {
    setThinking(true);
    // 1. Gather all data from the form
    const formData = {
        // This is the login data from the previous step
        ...sessionData,
        step: 'fill_form',
        // These are the new form fields
        serviceType: document.getElementById('pass_serviceType').value,
        bookletType: document.getElementById('pass_bookletType').value,
        givenName: document.getElementById('pass_givenName').value,
        surname: document.getElementById('pass_surname').value,
        gender: document.getElementById('pass_gender').value,
        dob: document.getElementById('pass_dob').value,
        placeOfBirth: document.getElementById('pass_placeOfBirth').value,
        maritalStatus: document.getElementById('pass_maritalStatus').value,
        employment: document.getElementById('pass_employment').value,
        fatherGivenName: document.getElementById('pass_fatherGivenName').value,
        motherGivenName: document.getElementById('pass_motherGivenName').value,
        houseNo: document.getElementById('pass_houseNo').value,
        city: document.getElementById('pass_city').value,
        pincode: document.getElementById('pass_pincode').value,
        state: document.getElementById('pass_state').value,
        mobile: document.getElementById('pass_mobile').value,
        emergencyName: document.getElementById('pass_emergencyName').value,
        emergencyMobile: document.getElementById('pass_emergencyMobile').value,
        // Hard-coded values for simplicity
        nonECR: "yes", 
    };

    // Simple validation
    const requiredFields = ['givenName', 'dob', 'placeOfBirth', 'fatherGivenName', 'motherGivenName', 'houseNo', 'city', 'pincode', 'state', 'mobile', 'emergencyName', 'emergencyMobile'];
    for (let key of requiredFields) {
        if (!formData[key]) {
            document.getElementById('formStatusMsg').textContent = `Please fill in all required fields. "${key}" is missing.`;
            document.getElementById('formStatusMsg').className = 'status-message show error';
            setThinking(false);
            return;
        }
    }

    // 2. Store key data for the *final* step
    sessionData.givenName = formData.givenName; 

    addMessageToLog('Got it. Submitting form details and fetching captcha...', 'bot');
    try {
        // 3. Call automation to fill the form
        const result = await callAutomation('passport_fresh', formData);
        
        // 4. Handle captcha response
        if (result.success && result.step === 'captcha_sent') {
            sessionData.sessionId = result.sessionId; // Re-set sessionId just in case
            currentTaskState = 'awaiting_passport_captcha';
            addMessageToLog(`Form submitted! Please type the final captcha code:<br><img src="${result.captchaImageBase64}" class="captcha-image" alt="captcha">`, 'bot');
        } else {
            throw new Error(result.message || 'Failed to fill form.');
        }
    } catch (error) {
         addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
         resetChat();
    } finally {
        setThinking(false);
    }
}
// --- END NEW PASSPORT FUNCTIONS ---

// --- NEW: E-ID REGISTRATION FORM FUNCTIONS ---
function showEidRegisterForm() {
    const formHtml = `
        <div class="chat-form-container">
            <h4>🆔 E-ID Registration - Step 1: Personal Details</h4>
            <p>Using your profile details (<b>${currentUser.username}</b>, <b>${currentUser.email}</b>). Details are pre-filled.</p>
            
            <h4>Personal Information</h4>
            <div class="form-row">
                <div class="form-group"><label>Full Name *</label><input type="text" id="eid_name" value="${currentUser.username || ''}"></div>
                <div class="form-group"><label>Date of Birth *</label><input type="date" id="eid_dob"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Gender *</label><select id="eid_gender"><option value="">-- Select --</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
                <div class="form-group"><label>Phone Number *</label><input type="tel" id="eid_phone" value="${currentUser.phoneno || ''}" pattern="[0-9]{10}"></div>
            </div>
            <div class="form-group"><label>Full Address *</label><textarea id="eid_address" rows="3">${currentUser.address || ''}</textarea></div>

            <button class="btn" onclick="handleEidRegisterSubmit()">Submit & Get CAPTCHA</button>
            <div class="status-message" id="formStatusMsg"></div>
        </div>
    `;
    addMessageToLog(formHtml, 'bot');
}

async function handleEidRegisterSubmit() {
    setThinking(true);
    // 1. Gather all data from the form
    const formData = {
        step: 'fill_form',
        name: document.getElementById('eid_name').value,
        dob: document.getElementById('eid_dob').value,
        gender: document.getElementById('eid_gender').value,
        phone: document.getElementById('eid_phone').value,
        address: document.getElementById('eid_address').value
    };

    // Simple validation
    const requiredFields = ['name', 'dob', 'gender', 'phone', 'address'];
    for (let key of requiredFields) {
        if (!formData[key]) {
            document.getElementById('formStatusMsg').textContent = `Please fill in all required fields. "${key}" is missing.`;
            document.getElementById('formStatusMsg').className = 'status-message show error';
            setThinking(false);
            return;
        }
    }

    // 2. Store key data for the final step
    sessionData.name = formData.name;

    addMessageToLog('Got it. Submitting form details and fetching CAPTCHA...', 'bot');
    try {
        // 3. Call automation to fill the form
        const result = await callAutomation('eid_register', formData);
        
        // 4. Handle captcha response
        if (result.success && result.step === 'captcha_sent') {
            sessionData.sessionId = result.sessionId;
            currentTaskState = 'awaiting_eid_captcha';
            
            // Show screenshots if available
            let screenshotHtml = '';
            if (result.screenshotsBase64) {
                screenshotHtml = '<div style="margin: 10px 0;"><strong>📸 Automation Screenshots:</strong><br>';
                if (result.screenshotsBase64.beforeFill) {
                    screenshotHtml += `<details><summary>Before Filling Form</summary><img src="${result.screenshotsBase64.beforeFill}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
                }
                if (result.screenshotsBase64.afterFill) {
                    screenshotHtml += `<details><summary>After Filling Form</summary><img src="${result.screenshotsBase64.afterFill}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
                }
                if (result.screenshotsBase64.captchaPage) {
                    screenshotHtml += `<details><summary>CAPTCHA Page</summary><img src="${result.screenshotsBase64.captchaPage}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
                }
                screenshotHtml += '</div>';
            }
            
            addMessageToLog(`Form submitted! Please type the CAPTCHA code:<br>${screenshotHtml}<img src="${result.captchaImageBase64}" class="captcha-image" alt="captcha">`, 'bot');
        } else {
            // Show error screenshot if available
            let errorScreenshotHtml = '';
            if (result.screenshotBase64) {
                errorScreenshotHtml = `<br><br><strong>📸 Error Screenshot:</strong><br><img src="${result.screenshotBase64}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;">`;
            }
            throw new Error(result.message || 'Failed to fill form.' + errorScreenshotHtml);
        }
    } catch (error) {
         addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
         resetChat();
    } finally {
        setThinking(false);
    }
}
// --- END NEW E-ID REGISTRATION FUNCTIONS ---

// --- NEW: E-ID SEARCH FUNCTIONS ---
async function handleEidSearch() {
    setThinking(true);
    try {
        const result = await callAutomation('eid_search', sessionData);
        
        // Show screenshots if available
        let screenshotHtml = '';
        if (result.screenshotsBase64) {
            screenshotHtml = '<div style="margin: 10px 0;"><strong>📸 Automation Screenshots:</strong><br>';
            if (result.screenshotsBase64.beforeSearch) {
                screenshotHtml += `<details><summary>Before Search</summary><img src="${result.screenshotsBase64.beforeSearch}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
            }
            if (result.screenshotsBase64.afterSearch) {
                screenshotHtml += `<details><summary>After Search</summary><img src="${result.screenshotsBase64.afterSearch}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
            }
            screenshotHtml += '</div>';
        }
        
        if (result.success) {
            showResult(result.data, 'eid_search');
            if (screenshotHtml) {
                addMessageToLog(screenshotHtml, 'bot');
            }
        } else {
            // Show error screenshot if available
            let errorScreenshotHtml = '';
            if (result.screenshotBase64) {
                errorScreenshotHtml = `<br><br><strong>📸 Error Screenshot:</strong><br><img src="${result.screenshotBase64}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;">`;
            }
            addMessageToLog(`❌ **Search Failed:** ${result.error || result.message}${errorScreenshotHtml}`, 'error');
        }
    } catch (error) {
        addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
    } finally {
        resetChat();
        setThinking(false);
    }
}
// --- END NEW E-ID SEARCH FUNCTIONS ---

// --- NEW: E-ID UPDATE FUNCTIONS ---
async function handleEidUpdateFind() {
    setThinking(true);
    try {
        const result = await callAutomation('eid_update', {
            step: 'find_user',
            eId: sessionData.eId
        });
        
        if (result.success && result.step === 'user_found') {
            sessionData.sessionId = result.sessionId;
            currentTaskState = 'awaiting_eid_update_fields';
            addMessageToLog('✅ User found! Please fill out the update form below.', 'bot');
            showEidUpdateForm();
        } else {
            let errorScreenshotHtml = '';
            if (result.screenshotBase64) {
                errorScreenshotHtml = `<br><br><strong>📸 Error Screenshot:</strong><br><img src="${result.screenshotBase64}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;">`;
            }
            addMessageToLog(`❌ **Find Failed:** ${result.error || result.message}${errorScreenshotHtml}`, 'error');
        }
    } catch (error) {
        addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
        resetChat();
    } finally {
        setThinking(false);
    }
}

function showEidUpdateForm() {
    const formHtml = `
        <div class="chat-form-container">
            <h4>✏️ E-ID Update - Edit Your Details</h4>
            <p>You can update one or more fields below. Leave fields unchanged if you don't want to update them.</p>
            
            <h4>Update Information</h4>
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="eid_update_name" placeholder="Leave empty to keep unchanged">
            </div>
            <div class="form-group">
                <label>Phone Number</label>
                <input type="tel" id="eid_update_phone" placeholder="Leave empty to keep unchanged" pattern="[0-9]{10}">
            </div>
            <div class="form-group">
                <label>Full Address</label>
                <textarea id="eid_update_address" rows="3" placeholder="Leave empty to keep unchanged"></textarea>
            </div>

            <button class="btn" onclick="handleEidUpdateSubmit()">Submit & Get CAPTCHA</button>
            <div class="status-message" id="formStatusMsg"></div>
        </div>
    `;
    addMessageToLog(formHtml, 'bot');
}

async function handleEidUpdateSubmit() {
    setThinking(true);
    const formData = {
        sessionId: sessionData.sessionId,
        step: 'edit_fields',
        eId: sessionData.eId,
        name: document.getElementById('eid_update_name').value.trim() || undefined,
        phone: document.getElementById('eid_update_phone').value.trim() || undefined,
        address: document.getElementById('eid_update_address').value.trim() || undefined
    };

    // At least one field must be provided
    if (!formData.name && !formData.phone && !formData.address) {
        document.getElementById('formStatusMsg').textContent = 'Please provide at least one field to update.';
        document.getElementById('formStatusMsg').className = 'status-message show error';
        setThinking(false);
        return;
    }

    // Store data for final step
    sessionData.name = formData.name;
    sessionData.phone = formData.phone;
    sessionData.address = formData.address;

    addMessageToLog('Got it. Submitting updates and fetching CAPTCHA...', 'bot');
    try {
        const result = await callAutomation('eid_update', formData);
        
        if (result.success && result.step === 'captcha_sent') {
            sessionData.sessionId = result.sessionId;
            currentTaskState = 'awaiting_eid_update_captcha';
            
            // Show screenshots if available
            let screenshotHtml = '';
            if (result.screenshotsBase64) {
                screenshotHtml = '<div style="margin: 10px 0;"><strong>📸 Automation Screenshots:</strong><br>';
                if (result.screenshotsBase64.beforeEdit) {
                    screenshotHtml += `<details><summary>Before Editing</summary><img src="${result.screenshotsBase64.beforeEdit}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
                }
                if (result.screenshotsBase64.afterEdit) {
                    screenshotHtml += `<details><summary>After Editing</summary><img src="${result.screenshotsBase64.afterEdit}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
                }
                if (result.screenshotsBase64.captchaPage) {
                    screenshotHtml += `<details><summary>CAPTCHA Page</summary><img src="${result.screenshotsBase64.captchaPage}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></details>`;
                }
                screenshotHtml += '</div>';
            }
            addMessageToLog(`Updates submitted! Please type the CAPTCHA code:<br>${screenshotHtml}<img src="${result.captchaImageBase64}" class="captcha-image" alt="captcha">`, 'bot');
        } else {
            let errorScreenshotHtml = '';
            if (result.screenshotBase64) {
                errorScreenshotHtml = `<br><br><strong>📸 Error Screenshot:</strong><br><img src="${result.screenshotBase64}" style="max-width: 100%; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;">`;
            }
            throw new Error(result.message || 'Failed to submit updates.' + errorScreenshotHtml);
        }
    } catch (error) {
        addMessageToLog(`❌ **Something went wrong:** ${error.message}<br><br>Let's start over. How can I help?`, 'error');
        resetChat();
    } finally {
        setThinking(false);
    }
}
// --- END NEW E-ID UPDATE FUNCTIONS ---


// --- PROFILE EDITING FUNCTIONS ---
async function showProfileForm() {
    setThinking(true);
    try {
        const token = localStorage.getItem('portalUserToken');
        const res = await fetch('/api/portal-auth/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        
        const user = data.user;
        currentUser.name = user.username; // Update global name

        const formHtml = `
            <div class="chat-form-container">
                <h4>✏️ Edit Your Profile</h4>
                <p>Change your details below and click "Save Changes".</p>
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="profile_username" value="${user.username}">
                </div>
                <div class="form-group">
                    <label>Email (Read-only)</label>
                    <input type="email" id="profile_email" value="${user.email}" readonly>
                </div>
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="tel" id="profile_phoneno" value="${user.phoneno}">
                </div>
                <div class="form-group">
                    <label>Address</label>
                    <textarea id="profile_address" rows="3">${user.address}</textarea>
                </div>
                <button class="btn" onclick="handleProfileSubmit()">Save Changes</button>
                <div class="status-message" id="formStatusMsg"></div>
            </div>
        `;
        addMessageToLog(formHtml, 'bot');
    } catch (error) {
        addMessageToLog(`❌ Error fetching profile: ${error.message}`, 'error');
    } finally {
        setThinking(false);
    }
}

async function handleProfileSubmit() {
    setThinking(true);
    const profileData = {
        username: document.getElementById('profile_username').value,
        phoneno: document.getElementById('profile_phoneno').value,
        address: document.getElementById('profile_address').value
    };

    try {
        const token = localStorage.getItem('portalUserToken');
        const res = await fetch('/api/portal-auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(profileData)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        localStorage.setItem('portalUser', JSON.stringify(data.user));
        currentUser = data.user; 

        addMessageToLog('✅ Your profile has been updated successfully!', 'bot');
    } catch (error) {
        addMessageToLog(`❌ Error updating profile: ${error.message}`, 'error');
    } finally {
        resetChat();
        setThinking(false);
    }
}


// --- LOGOUT FUNCTION ---
function handleLogout() {
    localStorage.removeItem('portalUserToken');
    localStorage.removeItem('portalUser');
    addMessageToLog('You have been logged out. Redirecting...', 'bot');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 1500);
}


// --- 5. HELPER FUNCTIONS ---
        
// Calls your /api/brain endpoint
async function callBrain(text) {
    try {
        const response = await fetch('http://localhost:5000/api/brain/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        if (!response.ok) {
            throw new Error('AI brain is not responding.');
        }
        return await response.json();
    } catch (error) {
        console.error("Brain call failed:", error);
        return { 
            task: 'unknown', 
            reply: 'Sorry, I am having trouble understanding requests right now. Please try again.' 
        };
    }
}

// Calls your /api/automation endpoint
async function callAutomation(taskType, data) {
    const token = localStorage.getItem('portalUserToken'); 
    const response = await fetch('http://localhost:5000/api/automation/execute', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // Send portal token for security
        },
        body: JSON.stringify({ taskType, ...data })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(result.message || 'An unknown automation error occurred.');
    }
    
    return result;
}

function resetChat() {
    currentTaskState = 'idle';
    sessionData = {};
}

function addMessageToLog(message, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    msgDiv.innerHTML = message;
    chatLog.appendChild(msgDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function setThinking(isThinking) {
    if (isThinking) {
        statusBar.innerHTML = 'Bot is thinking<span class="typing-indicator"><span></span><span></span><span></span></span>';
        inputEl.disabled = true;
        chatForm.querySelector('button').disabled = true;
    } else {
        statusBar.innerHTML = '';
        inputEl.disabled = false;
        chatForm.querySelector('button').disabled = false;
        inputEl.focus();
    }
}

function showResult(data, taskType) {
    let content = '';
    let title = '✅ Task Completed Successfully!';

    if (taskType === 'search') {
        title = '✅ Vehicle Details Retrieved';
         content = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    } else if (taskType === 'register') {
        title = '✅ Vehicle Registered Successfully!';
        content = `
            <table class="result-table">
                <tr><td>Status</td><td><strong>${data.status}</strong></td></tr>
                <tr><td>New Registration No.</td><td><strong>${data.registrationNumber}</strong></td></tr>
                <tr><td>Application ID</td><td>${data.applicationId}</td></tr>
            </table>
        `;
    } else if (taskType === 'transfer') {
        title = '✅ Ownership Transferred!';
         content = `
            <table class="result-table">
                <tr><td>Status</td><td><strong>${data.status}</strong></td></tr>
                <tr><td>Application ID</td><td><strong>${data.applicationId}</strong></td></tr>
                <tr><td>New Owner</td><td>${data.newOwner}</td></tr>
            </table>
        `;
    } else if (taskType === 'update') {
        title = '✅ Contact Details Updated!';
         content = `
            <table class="result-table">
                <tr><td>Status</td><td><strong>${data.status}</strong></td></tr>
                <tr><td>Application ID</td><td><strong>${data.applicationId}</strong></td></tr>
                <tr><td>New Address</td><td>${data.newAddress}</td></tr>
            </table>
        `;
    } else if (taskType === 'passport_fresh') { // --- NEW RESULT CASE ---
        title = '✅ Passport Application Submitted!';
         content = `
            <table class="result-table">
                <tr><td>Status</td><td><strong>${data.status}</strong></td></tr>
                <tr><td>Reference Number</td><td><strong>${data.applicationId}</strong></td></tr>
                <tr><td>Applicant Name</td><td>${data.applicantName}</td></tr>
                <tr><td>Processing Time</td><td>${data.processingTime}</td></tr>
            </table>
        `;
    } else if (taskType === 'eid_register') { // --- NEW E-ID RESULT CASE ---
        title = '✅ E-ID Registered Successfully!';
         content = `
            <table class="result-table">
                <tr><td>Status</td><td><strong>${data.status}</strong></td></tr>
                <tr><td>E-ID Number</td><td><strong>${data.eId}</strong></td></tr>
                <tr><td>Name</td><td>${data.name}</td></tr>
                <tr><td>Issued Date</td><td>${data.issuedDate}</td></tr>
            </table>
        `;
    } else if (taskType === 'eid_search') { // --- NEW E-ID SEARCH RESULT CASE ---
        title = '✅ E-ID Search Completed!';
         content = `
            <table class="result-table">
                <tr><td>Status</td><td><strong>${data.status}</strong></td></tr>
                <tr><td>E-ID Number</td><td><strong>${data.eId}</strong></td></tr>
                <tr><td>Issued Date</td><td>${data.issuedDate}</td></tr>
                <tr><td>Note</td><td>${data.message || 'Personal information is masked for security.'}</td></tr>
            </table>
        `;
    } else if (taskType === 'eid_update') { // --- NEW E-ID UPDATE RESULT CASE ---
        title = '✅ E-ID Updated Successfully!';
         content = `
            <table class="result-table">
                <tr><td>Status</td><td><strong>${data.status}</strong></td></tr>
                <tr><td>E-ID Number</td><td><strong>${data.eId}</strong></td></tr>
                ${data.name ? `<tr><td>Updated Name</td><td>${data.name}</td></tr>` : ''}
                ${data.phone ? `<tr><td>Updated Phone</td><td>${data.phone}</td></tr>` : ''}
                ${data.address ? `<tr><td>Updated Address</td><td>${data.address}</td></tr>` : ''}
                <tr><td>Message</td><td>${data.message || 'E-ID information updated successfully.'}</td></tr>
            </table>
        `;
    }
    
    addMessageToLog(`<div class="result-box"><h4>${title}</h4>${content}</div>`, 'bot');
}