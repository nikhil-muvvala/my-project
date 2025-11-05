// backend/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

const protect = async (req, res, next) => {
    let token;

    // Check if the token was sent in the headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // 1. Get token from header (e.g., "Bearer <token>")
            token = req.headers.authorization.split(' ')[1];

            // 2. Verify the token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 3. Get user from the token's ID and attach it to the request
            // We select '-otp' and '-otpExpires' to *exclude* them
            req.user = await User.findById(decoded.user.id).select('-otp -otpExpires');

            if (!req.user) {
                return res.status(401).json({ msg: 'Not authorized, user not found' });
            }

            // 4. Move on to the next function (the actual route)
            next();

        } catch (error) {
            console.error('Token verification failed:', error.message);
            return res.status(401).json({ msg: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ msg: 'Not authorized, no token' });
    }
};

module.exports = { protect };