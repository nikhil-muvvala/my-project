// frontend/task-portal-auth.js
// This script runs BEFORE task-portal.js to protect the page.

(function() {
    const token = localStorage.getItem('portalUserToken'); // Use the new token
    if (!token) {
        // No token found, user is not logged in
        alert('You must be logged in to access this page. Redirecting to login...');
        window.location.href = '/login.html';
    }
})();