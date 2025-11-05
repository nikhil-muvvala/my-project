// models/vehicleModel.js

const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
    // This is the link to the owner
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    regNo: { type: String, required: true, unique: true, uppercase: true },
    regDate: { type: String, required: true },
    rto: { type: String, required: true },
    class: { type: String },
    fuel: { type: String },
    model: { type: String },
    year: { type: String },
    engine: { type: String },
    chassis: { type: String },
    color: { type: String },
    seating: { type: String },
    insCompany: { type: String },
    policyNo: { type: String },
    insFrom: { type: String },
    insUpto: { type: String },
    insStatus: { type: String },
    fitnessUpto: { type: String },
    fitnessStatus: { type: String },
    pucNo: { type: String },
    pucUpto: { type: String },
    pucStatus: { type: String },
    taxUpto: { type: String },
    ownerName: { type: String }, // We store this here for quick search
    fatherName: { type: String },
    mobile: { type: String },
    email: { type: String },
    address: { type: String },
    permAddress: { type: String },
    financer: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);