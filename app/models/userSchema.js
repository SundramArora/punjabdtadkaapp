var mongoose = require('mongoose');
//var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs')
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

//Create fullName virtual property
UserSchema.virtual('fullName').get(function() {
    return this.firstName + ' ' + this.middleName + ' ' + this.lastName;
});

//Use a pre-save middleware to hash the password
UserSchema.pre('save', function(next) {
    if (this.password) {
        var user = this;
        this.hashPassword(this.password, function(hash) {
            user.password = hash;
            next();
        });
    }
    else {
        next();
    }
});

//Create an instance method for hashing a password
UserSchema.methods.hashPassword = function(password, callback) {
    bcrypt.genSalt(10, function(err, salt) {
        bcrypt.hash(password, salt, null, function(err, hash) {
            callback(hash);
        });
    });

};

//Create an instance method for authenticating user
UserSchema.methods.authenticate = function(password, callback) {
	/*if (password == this.password) {
	 callback(true);
	 }
	 else {
	 callback(false);
	 }*/
    bcrypt.compare(password, this.password, function(err, res) {
        if (err != null) {
            callback(false);
        }
        else {
            callback(res);
        }
    });
};

//Check if username exists
UserSchema.statics.checkUsernameExists = function (username, callback) {
    var possibleUserName = username;
    this.findOne({
        username: possibleUserName
    }, function(err, user) {
        if (!err) {
            if (!user) {
                callback(possibleUserName);
            }
            else {
                callback('Username already exists');
            }
        }
        else {
            callback(null);
        }
    })
};

UserSchema.set('toJSON', {
    getters: true,
    virtuals: true
});
module.exports = UserSchema;



