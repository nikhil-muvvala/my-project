// backend/login-setup/controllers/auth-controller.js
const User = require("../models/user"); 
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

//register controller
const registerUser = async (req, res) => {
  try {
    const { username, email, password, phoneno, gender, address } = req.body;

    const checkExistingUser = await User.findOne({ email });
    if (checkExistingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists. Please try another email.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newlyCreatedUser = new User({
      username,
      email,
      password: hashedPassword,
      phoneno,
      gender,
      address
    });
    await newlyCreatedUser.save();

    const payload = {
        user: {
            id: newlyCreatedUser._id,
            name: newlyCreatedUser.username,
            email: newlyCreatedUser.email
        }
    };

    // --- THIS IS THE FIX ---
    // Use JWT_SECRET to match your main .env file
    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET, 
      { expiresIn: "1d" }
    );
    // --- END OF FIX ---

    res.status(201).json({
      success: true,
      message: "User registered successfully!",
      accessToken,
      user: payload.user
    });

  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Some error occurred! Please try again",
    });
  }
};


//login controller
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
     if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Please enter email and password.",
        });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: `User doesn't exists`,
      });
    }
    
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials!",
      });
    }

    const payload = {
        user: {
            id: user._id,
            email: user.email,
            name: user.username
        }
    };

    // --- THIS IS THE FIX ---
    // Use JWT_SECRET to match your main .env file
    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET, 
      { expiresIn: "1d" }
    );
    // --- END OF FIX ---

    res.status(200).json({
      success: true,
      message: "Logged in successful",
      accessToken,
      user: payload.user
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Some error occured! Please try again",
    });
  }
};

// --- "EDIT PROFILE" FUNCTIONS ---
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.json({ success: true, user });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { username, phoneno, address } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.username = username || user.username;
        user.phoneno = phoneno || user.phoneno;
        user.address = address || user.address;
        await user.save();
        
        const updatedUserPayload = {
            id: user._id,
            email: user.email,
            name: user.username
        };

        res.json({ 
            success: true, 
            message: "Profile updated successfully!",
            user: updatedUserPayload 
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// (changePassword function)
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({ success: false, message: "User not found" });
    }
    const isPasswordMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: "Old password is not correct! Please try again.",
      });
    }
    const salt = await bcrypt.genSalt(10);
    const newHashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = newHashedPassword;
    await user.save();
    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Some error occured! Please try again",
    });
  }
};

module.exports = { registerUser, loginUser, changePassword, getProfile, updateProfile };