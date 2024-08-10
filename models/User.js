const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema({
    username: { type: String, required: true, min: 4, unique: true },
    password: { type: String, required: true, minlength: 4 },
    email: { type: String, required: true, unique: true },
    interestType: { type: String, required: true },
    verified: {type: Boolean, default: false},
    icon: { type: String },
}, { timestamps: true,

 });

const UserModel = model('User', UserSchema);
module.exports = UserModel;
