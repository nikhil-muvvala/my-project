// backend/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const sendEmail = require('../utils/sendEmail');

// @route   POST /api/auth/send-otp
// @desc    Send OTP to user's email
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ msg: 'Please enter an email' });
    }

    try {
        // Find user or create a new one
        let user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            user = new User({ email: email.toLowerCase(), name: email.split('@')[0] });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Set OTP and expiry (10 minutes)
        user.otp = otp;
        user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save();

        // Send the email
        const subject = 'Your VAHAN Portal OTP';
        const text = `Your One-Time Password (OTP) is: ${otp}\n\nIt will expire in 10 minutes.`;
        
        await sendEmail(user.email, subject, text);

        res.status(200).json({ msg: 'OTP sent to your email. Please check the Ethereal preview link in your server console.' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and return JWT
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ msg: 'Please provide email and OTP' });
    }

    try {
        const user = await User.findOne({ 
            email: email.toLowerCase(),
            otp: otp,
            otpExpires: { $gt: Date.now() } // Check if OTP is valid and not expired
        });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid OTP or OTP has expired' });
        }

        // OTP is correct. Clear it from the database.
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // Create JWT payload
        const payload = {
            user: {
                id: user.id, // This is the user's MongoDB ID
                email: user.email,
                name: user.name,
                vehicles: user.vehicles
            }
        };

        // Sign the JWT
        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' }, // Token expires in 1 hour
            (err, token) => {
                if (err) throw err;
                // Send the token back to the frontend
                res.json({ token, user: payload.user });
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;