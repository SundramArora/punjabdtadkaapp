var mongoose = require('mongoose');
//var crypto = require('crypto');
//var bcrypt = require('bcrypt-nodejs')
var Schema = mongoose.Schema;

var UserSchema = new Schema({
        _id: String,
        firstName: String,
        lastName: String,
        middleName: String,
        email: {
            type: String,
            match: [/.+\@.+\..+/, "Please enter a valid email address"]
        },
        username: {
            type: String,
            unique: true
        },
        password: {
            type: String
        },
        firstLogin: {type: Number},
        roles: [{
            role: String,
            regions: [{
                region: String
            }],
            country: []
        }],
        provider: String,
        isActive: Boolean,    
    }, {collection: 'staff'}
);


module.exports = UserSchema;