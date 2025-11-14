// frontend/task-portal.js

// --- CHATBOT STATE ---
let currentTaskState = 'idle'; 
let sessionData = {}; 
// Get the Portal User (who is logged in) - This is just the basic info
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

// --- NEW: Fetch full user profile on load ---
window.onload = async () => {
    addMessageToLog(`Hello, <b>${currentUser.name || 'user'}</b>! How can I help you today?<br><br>You can say things like:<br>• <b>get details for DL01AB1234 from Delhi</b><br>• <b>register a new car</b><br>• <b>I want to transfer ownership</b>`, 'bot');
    // Go get the user's full details (like address/phone) to pre-fill forms
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
            // Update the global currentUser object with full details
            currentUser = data.user; 
            localStorage.setItem('portalUser', JSON.stringify({
                id: data.user._id,
                name: data.user.username,
                email: data.user.email
            })); // Keep the simple one in storage
            console.log('Full user profile loaded:', currentUser);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Error fetching full profile:', error);
        addMessageToLog('Could not fetch your profile details, forms may not pre-fill.', 'error');
    }
}
// --- END NEW FUNCTION ---


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
    const { task, regNo, state, reply } = aiResponse;

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
            // --- MODIFIED: Ask for email confirmation ---
            currentTaskState = 'awaiting_register_email_confirm';
            addMessageToLog(`OK, starting new vehicle registration.<br><br>Should I use your login email (<b>${currentUser.email}</b>) for the automation? <br>Type <b>yes</b> or enter a <b>different email</b>.`, 'bot');
            break;

        case 'transfer':
            // --- MODIFIED: Ask for email confirmation ---
            currentTaskState = 'awaiting_transfer_email_confirm';
            addMessageToLog(`OK, starting ownership transfer.<br><br>Should I use your login email (<b>${currentUser.email}</b>) as the current owner? <br>Type <b>yes</b> or enter the <b>owner's email</b>.`, 'bot');
            break;

        case 'update':
            // --- MODIFIED: Ask for email confirmation ---
            currentTaskState = 'awaiting_update_email_confirm';
            addMessageToLog(`OK, starting contact update.<br><br>Should I use your login email (<b>${currentUser.email}</b>) for the automation? <br>Type <b>yes</b> or enter a <b>different email</b>.`, 'bot');
            break;

        case 'unknown':
        default:
            addMessageToLog(reply || "Sorry, I'm not sure how to help with that. I can help with VAHAN services like 'search', 'register', 'transfer', or 'update'.", 'bot');
            break;
    }
}

// --- 3. THE STATE MACHINE (This handles the multi-step conversations) ---
async function handleMidTaskInput(userInput) {
    
    switch (currentTaskState) {
        
        // --- SEARCH FLOW ---
        case 'awaiting_search_captcha':
            sessionData.captcha = userInput.toUpperCase();
            addMessageToLog('OK, checking captcha and fetching details...', 'bot');
            const result = await callAutomation('search', sessionData);
            showResult(result.data, 'search');
            resetChat();
            break;
        
        // --- REGISTRATION FLOW ---
        case 'awaiting_register_email_confirm': // NEW STEP
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
            
        // --- TRANSFER FLOW ---
        case 'awaiting_transfer_email_confirm': // NEW STEP
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

        // --- UPDATE FLOW ---
        case 'awaiting_update_email_confirm': // NEW STEP
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
    // --- MODIFIED: Pre-fills with full currentUser profile data ---
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
    // --- BUG FIX: Added email and otp to the payload ---
    const vehicleData = {
        sessionId: sessionData.sessionId,
        email: sessionData.email,
        otp: sessionData.otp,
        // --- End of Bug Fix ---
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
    // --- BUG FIX: Added email, otp, regNo, state, and searchCaptcha to the payload ---
    const transferData = {
        sessionId: sessionData.sessionId,
        email: sessionData.email,
        otp: sessionData.otp,
        regNo: sessionData.regNo,
        state: sessionData.state,
        searchCaptcha: sessionData.searchCaptcha,
        // --- End of Bug Fix ---
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
    // --- BUG FIX: Added email, otp, regNo, state, and searchCaptcha to the payload ---
    const updateData = {
        sessionId: sessionData.sessionId,
        email: sessionData.email,
        otp: sessionData.otp,
        regNo: sessionData.regNo,
        state: sessionData.state,
        searchCaptcha: sessionData.searchCaptcha,
        // --- End of Bug Fix ---
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

// --- NEW: PROFILE EDITING FUNCTIONS ---
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


// --- NEW: LOGOUT FUNCTION ---
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
    }
    
    addMessageToLog(`<div class="result-box"><h4>${title}</h4>${content}</div>`, 'bot');
}