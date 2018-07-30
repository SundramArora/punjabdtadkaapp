var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
    _id: String,
    password: String,
    userRole: String,
    email: String,
    firstLogin: String

}, { collection: 'staff' });

module.exports = userSchema;
