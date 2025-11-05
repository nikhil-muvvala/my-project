// ===== GLOBAL VARIABLES =====
let currentCaptcha = '';
let currentUser = null;
let uploadedFiles = [];
// This will act as a temporary cache for vehicle data
let vehicleDatabase = {}; 

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    generateCaptcha();
    checkLoginStatus();
});

// ===== CAPTCHA FUNCTIONS =====
function generateCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let captcha = '';
    for (let i = 0; i < 6; i++) {
        captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    currentCaptcha = captcha;
    document.getElementById('captchaDisplay').textContent = captcha;
}

// ===== VEHICLE SEARCH (NOW USES BACKEND API) =====
async function searchVehicle(event) {
    event.preventDefault();
    showLoading(true);

    const regNumber = document.getElementById('regNumber').value.trim().toUpperCase();
    const captchaInput = document.getElementById('captchaInput').value.trim().toUpperCase();

    if (captchaInput !== currentCaptcha) {
        showLoading(false);
        alert('❌ Invalid Captcha! Please try again.');
        generateCaptcha();
        document.getElementById('captchaInput').value = '';
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/api/vehicle/${regNumber}`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.msg || 'Vehicle not found');
        }

        const vehicleData = await response.json();

        // Store in local cache for other functions to use
        vehicleDatabase[regNumber] = vehicleData;

        displayVehicleDetails(vehicleData);

        document.getElementById('captchaInput').value = '';
        generateCaptcha();
        document.getElementById('resultCard').style.display = 'block';
        document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });

        saveRecentSearch(regNumber);
        showRecentSearches();

    } catch (error) {
        console.error('Search Error:', error.message);
        alert(`❌ ${error.message}\n\nPlease make sure:\n1. Backend server is running\n2. Database is seeded with initial data\n3. Try searching for an existing vehicle`);
        generateCaptcha();
        document.getElementById('captchaInput').value = '';
    } finally {
        showLoading(false);
    }
}

function displayVehicleDetails(data) {
    // Basic Details
    document.getElementById('res_regNo').textContent = data.regNo;
    document.getElementById('res_regDate').textContent = data.regDate;
    document.getElementById('res_rto').textContent = data.rto;
    document.getElementById('res_class').textContent = data.class;
    document.getElementById('res_fuel').textContent = data.fuel;
    document.getElementById('res_model').textContent = data.model;
    document.getElementById('res_year').textContent = data.year;
    document.getElementById('res_engine').textContent = data.engine;
    document.getElementById('res_chassis').textContent = data.chassis;
    document.getElementById('res_color').textContent = data.color;
    document.getElementById('res_seating').textContent = data.seating;
    
    // Insurance Details
    document.getElementById('res_insCompany').textContent = data.insCompany;
    document.getElementById('res_policyNo').textContent = data.policyNo;
    document.getElementById('res_insFrom').textContent = data.insFrom;
    document.getElementById('res_insUpto').textContent = data.insUpto;
    document.getElementById('res_insStatus').innerHTML = 
        `<span class="status-badge status-${data.insStatus}">${data.insStatus === 'active' ? '✓ Active' : '✗ Expired'}</span>`;
    
    // Fitness & PUC Details
    document.getElementById('res_fitnessUpto').textContent = data.fitnessUpto;
    document.getElementById('res_fitnessStatus').innerHTML = 
        `<span class="status-badge status-${data.fitnessStatus}">${data.fitnessStatus === 'active' ? '✓ Valid' : '✗ Expired'}</span>`;
    document.getElementById('res_pucNo').textContent = data.pucNo;
    document.getElementById('res_pucUpto').textContent = data.pucUpto;
    document.getElementById('res_pucStatus').innerHTML = 
        `<span class="status-badge status-${data.pucStatus}">${data.pucStatus === 'active' ? '✓ Valid' : data.pucStatus === 'warning' ? '⚠ Expiring Soon' : '✗ Expired'}</span>`;
    document.getElementById('res_taxUpto').textContent = data.taxUpto;
    
    // --- THIS IS THE PART YOU WANTED ---
    // Owner Details - NEW ENHANCED DISPLAY
    document.getElementById('res_ownerName_header').textContent = data.ownerName;
    document.getElementById('res_fatherName_header').textContent = 'S/O: ' + data.fatherName;
    document.getElementById('res_mobile_display').textContent = data.mobile;
    document.getElementById('res_email_display').textContent = data.email;
    document.getElementById('res_address_display').textContent = data.address;
    document.getElementById('res_permAddress_display').textContent = data.permAddress;
    
    // Keep the old table IDs for backward compatibility
    document.getElementById('res_ownerName').textContent = data.ownerName;
    document.getElementById('res_fatherName').textContent = data.fatherName;
    document.getElementById('res_mobile').textContent = data.mobile;
    document.getElementById('res_email').textContent = data.email;
    document.getElementById('res_address').textContent = data.address;
    document.getElementById('res_permAddress').textContent = data.permAddress;
    document.getElementById('res_financer').textContent = data.financer;
    // --- END OF NEW PART ---
}

function clearSearch() {
    document.getElementById('vehicleSearchForm').reset();
    document.getElementById('captchaInput').value = '';
    document.getElementById('resultCard').style.display = 'none';
    generateCaptcha();
}

// ===== TAB SWITCHING =====
function switchTab(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
}

// ===== LOGIN/LOGOUT =====
function showLoginModal() {
    // Reset the modal to Step 1 every time
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginOTP').value = '';
    
    document.getElementById('loginModal').classList.add('show');
}

// ===== NEW LOGIN FUNCTIONS (Phase 2) =====

// Step 1: User enters email and clicks "Send OTP"
async function handleSendOTP(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const btn = document.getElementById('sendOtpBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const response = await fetch('http://localhost:5000/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.msg || 'Failed to send OTP');
        }

        // Show a success notification
        showNotification(data.msg, 'success');
        
        // This is the new, correct alert!
        alert('OTP Sent! Please check your real email inbox for the code.');


        // Hide email form, show OTP form
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'block';

    } catch (error) {
        console.error('Send OTP Error:', error);
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send OTP';
    }
}

// Step 2: User enters OTP and clicks "Login"
async function handleVerifyOTP(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value; // Get email from previous step
    const otp = document.getElementById('loginOTP').value;
    const btn = document.getElementById('verifyOtpBtn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
        const response = await fetch('http://localhost:5000/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, otp: otp })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.msg || 'Failed to verify OTP');
        }

        // --- SUCCESS! ---
        // We got a token. Save it.
        localStorage.setItem('vahanToken', data.token);
        localStorage.setItem('vahanUser', JSON.stringify(data.user));

        closeModal('loginModal');
        checkLoginStatus(); // This will read from localStorage and update the UI
        
        showNotification(`✅ Login Successful! Welcome, ${data.user.name}`, 'success');
        
        // Show dashboard
        setTimeout(() => showDashboard(), 500);

    } catch (error) {
        console.error('Verify OTP Error:', error);
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Login';
    }
}

function checkLoginStatus() {
    const token = localStorage.getItem('vahanToken');
    const user = JSON.parse(localStorage.getItem('vahanUser'));

    if (token && user) {
        currentUser = user; // Set the global user object for other functions
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'block';
        document.getElementById('dashUserName').textContent = user.name;
        
        const logoutBtn = document.getElementById('logoutBtn');
        logoutBtn.textContent = `👤 ${user.name} (Logout)`;
        return user;
    } else {
        // Not logged in
        currentUser = null;
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'none';
        return null;
    }
}

function updateLoginUI() {
    if (currentUser) {
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'block';
        document.getElementById('dashUserName').textContent = currentUser.name;
        
        const logoutBtn = document.getElementById('logoutBtn');
        logoutBtn.textContent = `👤 ${currentUser.name} (Logout)`;
        
    } else {
        document.getElementById('loginBtn').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'none';
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        localStorage.removeItem('vahanToken');
        localStorage.removeItem('vahanUser');
        localStorage.removeItem('vahanApplications');
        
        updateLoginUI();
        document.getElementById('dashboardSection').style.display = 'none';
        alert('✅ Logged out successfully!');
        
        location.reload();
    }
}

// ===== DASHBOARD =====
function showDashboard() {
    if (!checkLoginStatus()) {
        alert('⚠️ Please login to access dashboard!');
        showLoginModal();
        return;
    }
    
    document.getElementById('searchCard').style.display = 'none';
    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('servicesSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    
    switchDashTab('vehicles');
}

async function switchDashTab(tabName) {
    document.querySelectorAll('.dash-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[onclick="switchDashTab('${tabName}')"]`).classList.add('active');
    
    const content = document.getElementById('dashboardContent');
    
    if (tabName === 'vehicles') {
        content.innerHTML = '<h4>My Registered Vehicles</h4><p>Loading...</p>';
        
        try {
            // Fetch user's vehicles from backend
            const response = await fetch('http://localhost:5000/api/user/vehicles', {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            
            if (!response.ok) throw new Error('Failed to load vehicles');
            
            const data = await response.json();
            content.innerHTML = '<h4>My Registered Vehicles</h4>';
            
            if (data.vehicles.length === 0) {
                content.innerHTML += '<p>No vehicles registered yet.</p>';
            } else {
                data.vehicles.forEach(vehicle => {
                    // Store in local cache
                    vehicleDatabase[vehicle.regNo] = vehicle;
                    
                    content.innerHTML += `
                        <div class="vehicle-item">
                            <div class="number-plate" style="margin-bottom: 10px;">${vehicle.regNo}</div>
                            <h4>${vehicle.model}</h4>
                            <p><strong>Owner:</strong> ${vehicle.ownerName}</p>
                            <p><strong>Insurance:</strong> ${vehicle.insStatus === 'active' ? '✓ Valid till ' + vehicle.insUpto : '✗ Expired'}</p>
                            <p><strong>PUC:</strong> ${vehicle.pucStatus === 'active' ? '✓ Valid till ' + vehicle.pucUpto : (vehicle.pucStatus === 'warning' ? '⚠ Expiring Soon' : '✗ Expired')}</p>
                            <button class="btn btn-primary" onclick="viewVehicleDetails('${vehicle.regNo}')">View Full Details</button>
                        </div>
                    `;
                });
            }
        } catch (error) {
            content.innerHTML = '<h4>My Registered Vehicles</h4><p>Error loading vehicles. Please try again.</p>';
            console.error('Load vehicles error:', error);
        }
    } else if (tabName === 'applications') {
        // This is the old code, you can update it to show status correctly
        const applications = JSON.parse(localStorage.getItem('vahanApplications') || '[]');
        content.innerHTML = '<h4>My Applications</h4>';
        if (applications.length === 0) {
            content.innerHTML += '<p>No applications found.</p>';
        } else {
            applications.forEach((app, index) => {
                // Check application type to set status
                const isCompleted = app.type === 'New Vehicle Registration' || app.type === 'Transfer of Ownership' || app.type === 'Update Contact Details';
                const status = isCompleted ? '<span class="status-badge status-active">Completed</span>' : '<span class="status-badge status-warning">Pending</span>';

                content.innerHTML += `
                    <div class="vehicle-item">
                        <h4>Application #${app.id} - ${app.type}</h4>
                        <p><strong>Vehicle:</strong> ${app.regNo || 'N/A (New Reg)'}</p>
                        <p><strong>Date:</strong> ${app.date}</p>
                        <p><strong>Status:</strong> ${status}</p>
                        <button class="btn btn-secondary" onclick="viewReceipt(${index})">View Receipt</button>
                    </div>
                `;
            });
        }
    } else if (tabName === 'documents') {
        // ... (documents code) ...
    } else if (tabName === 'payments') {
        // ... (payments code) ...
    }
}

function viewVehicleDetails(regNo) {
    document.getElementById('regNumber').value = regNo;
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('searchCard').style.display = 'block';
    document.getElementById('servicesSection').style.display = 'block';
    
    const vehicleData = vehicleDatabase[regNo];
    if (vehicleData) {
        displayVehicleDetails(vehicleData);
        document.getElementById('resultCard').style.display = 'block';
        document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });
    }
}

// ===== SAVE APPLICATION (HELPER) =====
function saveApplication(app) {
    const applications = JSON.parse(localStorage.getItem('vahanApplications') || '[]');
    applications.push(app);
    localStorage.setItem('vahanApplications', JSON.stringify(applications));
    
    // We don't need the alert here, showApplicationReceipt is called right after
}

// ===== TRANSFER OF OWNERSHIP =====
function showTransferModal() {
    if (!checkLoginStatus()) {
        alert('⚠️ Please login to use this service!');
        showLoginModal();
        return;
    }
    
    const regNo = document.getElementById('res_regNo').textContent;
    const vehicle = vehicleDatabase[regNo]; 

    if (regNo && vehicle) {
        document.getElementById('trans_currOwner').value = vehicle.ownerName;
        document.getElementById('trans_currMobile').value = vehicle.mobile;
    } else {
         alert('⚠️ Please search for a vehicle first to transfer ownership.');
         return;
    }
    
    document.getElementById('transferModal').classList.add('show');
}

// ===== NEW VEHICLE REGISTRATION =====
function generateNumberPlate(stateCode = 'DL') {
    const rto = Math.floor(Math.random() * 20) + 1;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let series = '';
    for(let i=0; i<2; i++) {
        series += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const num = Math.floor(Math.random() * 9000) + 1000;
    
    return `${stateCode}${rto.toString().padStart(2, '0')}${series}${num}`;
}

function showNewRegModal() {
    if (!checkLoginStatus()) {
        alert('⚠️ Please login to use this service!');
        showLoginModal();
        return;
    }
    
    document.getElementById('newReg_ownerName').value = currentUser.name;
    // Try to prefill mobile if it exists on the user object
    if (currentUser.mobile) {
        document.getElementById('newReg_mobile').value = currentUser.mobile;
    }
     if (currentUser.email) {
        document.getElementById('newReg_email').value = currentUser.email;
    }
    
    document.getElementById('newRegModal').classList.add('show');
}

// ===== DUPLICATE RC =====
function showDuplicateRCModal() {
    if (!checkLoginStatus()) {
        alert('⚠️ Please login to use this service!');
        showLoginModal();
        return;
    }

    const regNo = document.getElementById('res_regNo').textContent;
    const vehicle = vehicleDatabase[regNo];
    
    if (regNo && vehicle) {
        // Check if this vehicle is in the user's list from localStorage
        const userVehicles = currentUser.vehicles || [];
        if (!userVehicles.includes(vehicle._id)) { // Assuming vehicles array stores IDs
            alert('⚠️ This vehicle is not listed under your dashboard. You can only apply for your own vehicles.');
            return;
        }
        document.getElementById('dup_regNo').value = vehicle.regNo;
        document.getElementById('dup_ownerName').value = vehicle.ownerName;
        document.getElementById('dup_chassis').value = '...'+vehicle.chassis.slice(-5);
        document.getElementById('dup_engine').value = '...'+vehicle.engine.slice(-5);
    } else {
        alert('⚠️ Please search for your vehicle first to apply for a duplicate RC.');
        return;
    }
    
    document.getElementById('duplicateRCModal').classList.add('show');
}

function submitDuplicateRC(event) {
    event.preventDefault();
    
    const application = {
        id: 'DUP' + Date.now().toString().slice(-6),
        type: 'Duplicate RC',
        regNo: document.getElementById('dup_regNo').value,
        reason: document.getElementById('dup_reason').value,
        date: new Date().toLocaleDateString('en-IN'),
        fee: '300',
        nextStep: 'Await police verification (if RC was lost/stolen). You will be notified to collect the Duplicate RC from the RTO.'
    };
    
    saveApplication(application);
    showApplicationReceipt(application);
    closeModal('duplicateRCModal');
    document.getElementById('duplicateRCForm').reset();
}

// ===== UPDATE CONTACT DETAILS =====
function showUpdateDetailsModal() {
    if (!checkLoginStatus()) {
        alert('⚠️ Please login to use this service!');
        showLoginModal();
        return;
    }

    const regNo = document.getElementById('res_regNo').textContent;
    const vehicle = vehicleDatabase[regNo];
    
    if (regNo && vehicle) {
        document.getElementById('addr_regNo').value = vehicle.regNo;
        document.getElementById('addr_ownerName').value = vehicle.ownerName;
        document.getElementById('addr_currAddress').value = vehicle.address;
        
        document.getElementById('addr_newAddress').value = vehicle.address;
        document.getElementById('addr_newMobile').value = vehicle.mobile;
        document.getElementById('addr_newEmail').value = vehicle.email;

    } else {
        alert('⚠️ Please search for your vehicle first to apply for an update.');
        return;
    }
    
    document.getElementById('updateDetailsModal').classList.add('show');
}

// ===== NEW SUBMIT FUNCTIONS (Phase 3) =====

function getAuthToken() {
    return localStorage.getItem('vahanToken');
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
    };
}


async function submitNewReg(event) {
    event.preventDefault();

    const newVehicle = {
        regNo: generateNumberPlate(document.getElementById('newReg_rto').value),
        regDate: new Date().toLocaleDateString('en-IN'),
        rto: `RTO ${document.getElementById('newReg_rto').value}`,
        class: document.getElementById('newReg_class').value,
        fuel: document.getElementById('newReg_fuel').value,
        model: document.getElementById('newReg_model').value.toUpperCase(),
        year: new Date().getFullYear().toString(),
        engine: 'ENG' + Math.floor(Math.random() * 100000),
        chassis: 'CHS' + Math.floor(Math.random() * 1000000000),
        color: document.getElementById('newReg_color').value || 'White',
        seating: '5',
        mobile: document.getElementById('newReg_mobile').value,
        address: document.getElementById('newReg_address').value,
        // Add other form fields here
        insCompany: 'NEW INDIA ASSURANCE',
        policyNo: 'POL/NEW/' + Math.floor(Math.random() * 100000),
        insFrom: new Date().toLocaleDateString('en-IN'),
        insUpto: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-IN'),
        insStatus: 'active',
        fitnessUpto: new Date(new Date().setFullYear(new Date().getFullYear() + 15)).toLocaleDateString('en-IN'),
        fitnessStatus: 'active',
        pucNo: 'N/A (New Vehicle)',
        pucUpto: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-IN'),
        pucStatus: 'active',
        taxUpto: new Date(new Date().setFullYear(new Date().getFullYear() + 15)).toLocaleDateString('en-IN'),
        financer: 'No Hypothecation'
    };

    try {
        const response = await fetch('http://localhost:5000/api/vehicle/register', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(newVehicle)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.msg || 'Registration failed');
        }

        localStorage.setItem('vahanUser', JSON.stringify(data.user));
        checkLoginStatus();
        
        const application = {
            id: 'NEW' + Date.now().toString().slice(-6),
            type: 'New Vehicle Registration',
            regNo: data.vehicle.regNo,
            model: data.vehicle.model,
            date: data.vehicle.regDate,
            fee: '1500 (plus Road Tax)',
            nextStep: `Vehicle successfully registered! Your new number is ${data.vehicle.regNo}. It has been added to your dashboard.`
        };
        
        saveApplication(application);
        showApplicationReceipt(application);
        closeModal('newRegModal');
        document.getElementById('newRegForm').reset();
        
        if(document.getElementById('dashboardSection').style.display === 'block') {
            await switchDashTab('vehicles');
        }

    } catch (error) {
        console.error('New Reg Error:', error);
        alert(`Error: ${error.message}`);
    }
}


async function submitTransfer(event) {
    event.preventDefault();
    
    const regNo = document.getElementById('res_regNo').textContent;
    if (!regNo) return alert('No vehicle selected');

    const transferDetails = {
        newOwnerEmail: document.getElementById('trans_newEmail').value,
        newOwnerName: document.getElementById('trans_newOwner').value,
        newOwnerFather: document.getElementById('trans_newFather').value,
        newOwnerMobile: document.getElementById('trans_newMobile').value,
        newOwnerAddress: document.getElementById('trans_newAddress').value,
    };

    try {
        const response = await fetch(`http://localhost:5000/api/vehicle/transfer/${regNo}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(transferDetails)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.msg || 'Transfer failed');
        }

        localStorage.setItem('vahanUser', JSON.stringify(data.user));
        checkLoginStatus();

        const application = {
            id: 'TOW' + Date.now().toString().slice(-6),
            type: 'Transfer of Ownership',
            regNo: regNo,
            newOwner: data.vehicle.ownerName,
            date: new Date().toLocaleDateString('en-IN'),
            fee: '500',
            nextStep: 'Vehicle ownership transferred successfully. This vehicle has been removed from your dashboard.'
        };
        
        saveApplication(application);
        showApplicationReceipt(application);
        closeModal('transferModal');
        document.getElementById('transferForm').reset();
        
        if(document.getElementById('dashboardSection').style.display === 'block') {
            switchDashTab('vehicles');
        }
        document.getElementById('resultCard').style.display = 'none';

    } catch (error) {
        console.error('Transfer Error:', error);
        alert(`Error: ${error.message}`);
    }
}


async function submitUpdateDetails(event) {
    event.preventDefault();
    
    const regNo = document.getElementById('addr_regNo').value;
    if (!regNo) return alert('No vehicle selected');

    const updateDetails = {
        newAddress: document.getElementById('addr_newAddress').value,
        newMobile: document.getElementById('addr_newMobile').value,
        newEmail: document.getElementById('addr_newEmail').value,
    };

    try {
        const response = await fetch(`http://localhost:5000/api/vehicle/update/${regNo}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updateDetails)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.msg || 'Update failed');
        }

        const application = {
            id: 'COA' + Date.now().toString().slice(-6),
            type: 'Update Contact Details',
            regNo: regNo,
            newAddress: data.vehicle.address,
            newMobile: data.vehicle.mobile,
            date: new Date().toLocaleDateString('en-IN'),
            fee: '200',
            nextStep: 'Your contact details have been successfully updated in our records.'
        };
        
        saveApplication(application);
        showApplicationReceipt(application);
        closeModal('updateDetailsModal');
        document.getElementById('updateDetailsForm').reset();
        
        // Refresh the search result card to show new data
        displayVehicleDetails(data.vehicle);

    } catch (error) {
        console.error('Update Details Error:', error);
        alert(`Error: ${error.message}`);
    }
}


// ===== DOCUMENT UPLOAD =====
function showUploadModal() {
    if (!checkLoginStatus()) {
        alert('⚠️ Please login to upload documents!');
        showLoginModal();
        return;
    }
    uploadedFiles = [];
    document.getElementById('uploadedFiles').innerHTML = '';
    document.getElementById('uploadModal').classList.add('show');
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        alert('❌ File size must be less than 5MB!');
        return;
    }
    
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
        alert('❌ Only PDF, JPG, and PNG files are allowed!');
        return;
    }
    
    uploadedFiles.push(file);
    displayUploadedFiles();
}

function displayUploadedFiles() {
    const container = document.getElementById('uploadedFiles');
    container.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        container.innerHTML += `
            <div class="file-item">
                <span>📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)</span>
                <button onclick="removeFile(${index})">Remove</button>
            </div>
        `;
    });
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    displayUploadedFiles();
}

function saveDocuments() {
    if (uploadedFiles.length === 0) {
        alert('⚠️ Please select at least one file to upload!');
        return;
    }
    
    const docType = document.getElementById('docType').value;
    const documents = JSON.parse(localStorage.getItem('vahanDocuments') || '[]');
    
    uploadedFiles.forEach(file => {
        documents.push({
            type: docType,
            name: file.name,
            size: file.size,
            date: new Date().toLocaleDateString('en-IN')
        });
    });
    
    localStorage.setItem('vahanDocuments', JSON.stringify(documents));
    
    closeModal('uploadModal');
    alert(`✅ ${uploadedFiles.length} document(s) uploaded successfully!`);
    uploadedFiles = [];
}

// ===== RC / RECEIPT MODAL FUNCTIONS =====
function showRCModal() {
    const regNo = document.getElementById('res_regNo').textContent;
    if (!vehicleDatabase[regNo]) {
        alert('❌ No vehicle data found!');
        return;
    }
    
    const vehicle = vehicleDatabase[regNo];
    
    const content = `
        <div class="number-plate">${vehicle.regNo}</div>
        <table class="info-table">
            <tr><td>Registration Date</td><td>${vehicle.regDate}</td></tr>
            <tr><td>Registering Authority</td><td>${vehicle.rto}</td></tr>
        </table>

        <h4 style="margin-top: 20px;">Vehicle Details</h4>
        <table class="info-table">
            <tr><td>Vehicle Class</td><td>${vehicle.class}</td></tr>
            <tr><td>Maker/Model</td><td>${vehicle.model}</td></tr>
            <tr><td>Manufacturing Year</td><td>${vehicle.year}</td></tr>
            <tr><td>Fuel Type</td><td>${vehicle.fuel}</td></tr>
            <tr><td>Color</td><td>${vehicle.color}</td></tr>
            <tr><td>Engine Number</td><td>${vehicle.engine}</td></tr>
            <tr><td>Chassis Number</td><td>${vehicle.chassis}</td></tr>
        </table>

        <h4 style="margin-top: 20px;">Owner Details</h4>
        <table class="info-table">
            <tr><td>Owner Name</td><td>${vehicle.ownerName}</td></tr>
            <tr><td>Father/Husband</td><td>${vehicle.fatherName}</td></tr>
            <tr><td>Address</td><td>${vehicle.address}</td></tr>
        </table>

        <h4 style="margin-top: 20px;">Validity</h4>
        <table class="info-table">
            <tr><td>Insurance Valid Upto</td><td>${vehicle.insUpto}</td></tr>
            <tr><td>Fitness Valid Upto</td><td>${vehicle.fitnessUpto}</td></tr>
            <tr><td>PUC Valid Upto</td><td>${vehicle.pucUpto}</td></tr>
        </table>
        
        <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #666;">
            This is a computer generated document. Generated on: ${new Date().toLocaleString('en-IN')}
        </p>
    `;
    
    document.getElementById('rcContentOutput').innerHTML = content;
    document.getElementById('rcModal').classList.add('show');
}

function showApplicationReceipt(application) {
    const receipt = `
═══════════════════════════════════════════════════════
        APPLICATION RECEIPT
        VAHAN 4.0 - National Vehicle Register
        Ministry of Road Transport & Highways
═══════════════════════════════════════════════════════

Application Type: ${application.type}
Application ID: ${application.id}
Date: ${application.date}
Time: ${new Date().toLocaleTimeString('en-IN')}

APPLICANT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${currentUser.name}
${currentUser.mobile ? 'Mobile: ' + currentUser.mobile : ''}

APPLICATION DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vehicle Reg. No: ${application.regNo}
${application.newOwner ? 'New Owner: ' + application.newOwner : ''}
${application.model ? 'Vehicle Model: ' + application.model : ''}
${application.reason ? 'Reason: ' + application.reason : ''}
${application.newAddress ? 'New Address: ' + application.newAddress.substring(0, 30) + '...' : ''}
${application.newMobile ? 'New Mobile: ' + application.newMobile : ''}

STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current Status: ${application.type === 'New Vehicle Registration' || application.type === 'Transfer of Ownership' || application.type === 'Update Contact Details' ? 'COMPLETED' : 'PENDING VERIFICATION'}

PAYMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Application Fee: ₹${application.fee}
Transaction ID: TXN${Date.now()}
Payment Status: SUCCESS

NEXT STEPS (IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${application.nextStep}

═══════════════════════════════════════════════════════
Please keep this receipt for future reference.
═══════════════════════════════════════════════════════
    `;
    
    document.getElementById('receiptContentOutput').textContent = receipt;
    document.getElementById('receiptModal').classList.add('show');
}

function viewReceipt(index) {
    const applications = JSON.parse(localStorage.getItem('vahanApplications') || '[]');
    if (applications[index]) {
        showApplicationReceipt(applications[index]);
    }
}

// ===== PRINT FUNCTION =====
function printDetails() {
    window.print();
}

// ===== MODAL FUNCTIONS =====
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    const form = document.getElementById(modalId)?.querySelector('form');
    if(form) {
        form.reset();
    }
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}

// ===== NAVIGATION FUNCTIONS =====
function showSection(section) {
    if (section === 'home' || section === 'search') {
        document.getElementById('searchCard').style.display = 'block';
        document.getElementById('servicesSection').style.display = 'block';
        document.getElementById('dashboardSection').style.display = 'none';
    } else if (section === 'services') {
        document.getElementById('searchCard').style.display = 'none';
        document.getElementById('resultCard').style.display = 'none';
        document.getElementById('servicesSection').style.display = 'block';
        document.getElementById('dashboardSection').style.display = 'none';
    }
}

// ===== SERVICE INFO =====
function showServiceInfo(serviceName) {
    if (!checkLoginStatus()) {
        alert('⚠️ Please login to access e-Services!');
        showLoginModal();
        return;
    }
    alert(`📋 ${serviceName}\n\nThis service is available for registered users.\nPlease visit your dashboard to apply.`);
}

// ===== LANGUAGE TOGGLE =====
function toggleLanguage() {
    alert('🌐 Language Switch\n\nHindi version will be available soon!\nहिंदी संस्करण जल्द ही उपलब्ध होगा!');
}

// ===== CONSOLE LOG FOR DEMO =====
console.log('🚗 VAHAN Portal Demo');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ script.js loaded');
console.log('Demo Vehicle Numbers (from DB):');
console.log('• DL01AB1234');
console.log('• MH01XY5678');
console.log('• KA03PQ9876');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Login with any email to get an OTP');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');


// ===== NOTIFICATION SYSTEM =====
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '10000';
    notification.style.minWidth = '300px';
    notification.style.animation = 'slideInRight 0.3s ease';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== STATISTICS TRACKER =====
function updateVisitorCount() {
    let count = parseInt(localStorage.getItem('vahanVisitors') || '1234567');
    count++;
    localStorage.setItem('vahanVisitors', count.toString());
    
    const footerText = document.querySelector('.header-top-content span:last-child');
    if (footerText) {
        const lastUpdated = footerText.textContent.split('|')[0];
        footerText.textContent = `${lastUpdated} | Visitors: ${count.toLocaleString('en-IN')}`;
    }
}
updateVisitorCount();

// ===== RECENT SEARCHES =====
function saveRecentSearch(regNo) {
    let recent = JSON.parse(localStorage.getItem('vahanRecentSearches') || '[]');
    recent = recent.filter(r => r !== regNo);
    recent.unshift(regNo);
    recent = recent.slice(0, 5);
    localStorage.setItem('vahanRecentSearches', JSON.stringify(recent));
}

function showRecentSearches() {
    const recent = JSON.parse(localStorage.getItem('vahanRecentSearches') || '[]');
    if (recent.length > 0) {
        let html = '<div style="margin-top: 10px;"><small style="color: #666;">Recent Searches: ';
        recent.forEach(regNo => {
            html += `<a href="#" onclick="quickSearch('${regNo}')" style="color: #1a237e; margin-right: 10px;">${regNo}</a>`;
        });
        html += '</small></div>';
        
        const searchCard = document.getElementById('searchCard');
        const existingRecent = document.getElementById('recentSearches');
        if(existingRecent) existingRecent.remove(); 

        if (searchCard) {
            const div = document.createElement('div');
            div.id = 'recentSearches';
            div.innerHTML = html;
            searchCard.appendChild(div);
        }
    }
}

function quickSearch(regNo) {
    document.getElementById('regNumber').value = regNo;
    document.getElementById('stateSelect').value = regNo.substring(0, 2);
    // Manually trigger the search form submission
    document.getElementById('vehicleSearchForm').dispatchEvent(new Event('submit', { cancelable: true }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
setTimeout(showRecentSearches, 500);

// ===== RESPONSIVE MENU TOGGLE =====
function createMobileMenu() {
    const navbar = document.querySelector('.navbar');
    const navUl = navbar.querySelector('ul');
    let toggle = document.getElementById('menuToggle');
    
    if (window.innerWidth <= 768) {
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.id = 'menuToggle';
            toggle.innerHTML = '☰ Menu';
            toggle.style.cssText = 'display: block; width: 100%; padding: 12px; background: #1a237e; color: white; border: none; cursor: pointer; font-size: 16px;';
            toggle.onclick = function() {
                navUl.style.display = navUl.style.display === 'none' ? 'flex' : 'none';
            };
            navbar.insertBefore(toggle, navUl);
            navUl.style.display = 'none';
        }
    } else {
        if (toggle) {
            toggle.remove();
        }
        navUl.style.display = 'flex';
    }
}
window.addEventListener('resize', createMobileMenu);
createMobileMenu();

// ===== LOADING ANIMATION =====
function showLoading(show = true) {
    let loader = document.getElementById('pageLoader');
    
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'pageLoader';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(26, 35, 126, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            color: white;
            font-size: 20px;
            flex-direction: column;
            gap: 20px;
        `;
        loader.innerHTML = `
            <div style="border: 5px solid rgba(255,255,255,0.3); border-top: 5px solid white; border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite;"></div>
            <div>Loading Vehicle Details...</div>
        `;
        
        if (!document.getElementById('spinAnimation')) {
            const style = document.createElement('style');
            style.id = 'spinAnimation';
            style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
        
        document.body.appendChild(loader);
    } else if (!show && loader) {
        loader.remove();
    }
}