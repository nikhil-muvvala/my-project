// backend/login-setup/models/user.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phoneno: {
      type: String, // MODIFIED: Changed to String for flexibility
      required : true,
    },
    gender: {
        type :String,
        required : true,
    },
    address: {
        type:String,
        required : true,
    }
  },
  { timestamps: true }
);

// --- THIS IS THE FIX ---
// We are registering this model as "PortalUser" to avoid conflicts
module.exports = mongoose.model("PortalUser", UserSchema);
// --- END OF FIX ---