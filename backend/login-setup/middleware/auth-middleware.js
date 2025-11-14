// backend/login-setup/middleware/auth-middleware.js
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided. Please login to continue",
    });
  }

  //decode this token
  try {
    // --- THIS IS THE FIX ---
    // Use JWT_SECRET to match your main .env file
    const decodedTokenInfo = jwt.verify(token, process.env.JWT_SECRET);
    // --- END OF FIX ---
    
    // Attach the user payload to req.user
    req.user = decodedTokenInfo.user;
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Token is invalid or expired.",
    });
  }
};

module.exports = authMiddleware;