var mongoose = require('mongoose');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs')
//var config = require('./app/config/config');
var jwt = require('jsonwebtoken');
var Schema = mongoose.Schema;

var UserSchema = new Schema({
        //_id: String,
        UserId:Number,
        name: String,        
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
        isOtpVerified:{
            type:Boolean,
            default:false
        },
        provider: String,
        isActive: Boolean,   
        salt: String,
        hash:String 
    }, {collection: 'staff'}
);


// //Use a pre-save middleware to hash the password
// UserSchema.pre('save', function(next) {
//     if (this.password) {
//         var user = this;
//         this.hashPassword(this.password, function(hash) {
//             user.password = hash;
//             next();
//         });
//     }
//     else {
//         next();
//     }
// });

// //Create an instance method for hashing a password
// UserSchema.methods.hashPassword = function(password, callback) {
//     bcrypt.genSalt(10, function(err, salt) {
//         bcrypt.hash(password, salt, null, function(err, hash) {
//             callback(hash);
//         });
//     });

// };

// //Create an instance method for authenticating user
// UserSchema.methods.authenticate = function(password, callback) {
// 	/*if (password == this.password) {
// 	 callback(true);
// 	 }
// 	 else {
// 	 callback(false);
// 	 }*/
//     bcrypt.compare(password, this.password, function(err, res) {
//         if (err != null) {
//             callback(false);
//         }
//         else {
//             callback(res);
//         }
//     });
// };
UserSchema.methods.generateJwt = function() {
    var expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
  
    return jwt.sign({
      _id: this._id,
      email: this.email,
      name: this.name,
      exp: parseInt(expiry.getTime() / 1000),
    }, "punjabdtadka"); // DO NOT KEEP YOUR SECRET IN THE CODE!
  };

  UserSchema.methods.setPassword = function(password){
    this.salt = crypto.randomBytes(16).toString('hex');
    this.hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
  };

  UserSchema.methods.validPassword = function(password) {
    var hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.hash === hash;
  };

//   UserSchema.virtual('fullName').get(function() {
// //    return this.firstName + ' ' + this.middleName + ' ' + this.lastName;
// return this.firstName +  ' ' + this.lastName;
// });

  UserSchema.set('toJSON', {
    getters: true,
    virtuals: true
});
module.exports = UserSchema;