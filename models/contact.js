const mongoose = require('mongoose');
const { schema } = require('./User');
const {Schema, model} = mongoose;

const contactSchema = new Schema({
    name: String,
    email: String,
    query: String,
});

const ContactModel = model('Contact',contactSchema);
module.exports = ContactModel;



