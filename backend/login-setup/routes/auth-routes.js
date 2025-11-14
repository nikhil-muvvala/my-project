// backend/login-setup/routes/auth-routes.js
const express = require("express");
const {
  registerUser,
  loginUser,
  getProfile,    // Added
  updateProfile  // Added
} = require("../controllers/auth-controller"); // MODIFIED: Path
const router = express.Router();
const authMiddleware = require("../middleware/auth-middleware"); // MODIFIED: Path

//all routes are related to authentication & authorization
router.post("/register", registerUser);
router.post("/login", loginUser);

// NEW: Profile routes
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);

module.exports = router;