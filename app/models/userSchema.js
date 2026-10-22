var mongoose = require('mongoose');
var crypto = require('crypto');
var config = require('../config/config');
var jwt = require('jsonwebtoken');
var Schema = mongoose.Schema;
var passwordIterations = 310000;

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
            type: String,
            select: false
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
        hash:String,
        passwordIterations: Number
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
    return jwt.sign({
      _id: this._id,
      email: this.email,
      name: this.name
    }, config.secret, { expiresIn: config.tokenLife, algorithm:'HS256' });
  };

  UserSchema.methods.setPassword = function(password, callback){
    var user = this;
    var salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, passwordIterations, 64, 'sha512', function(err, hash) {
      if (err) {
        return callback(err);
      }
      user.salt = salt;
      user.passwordIterations = passwordIterations;
      user.hash = hash.toString('hex');
      callback(null);
    });
  };

  UserSchema.methods.validPassword = function(password, callback) {
    var iterations = this.passwordIterations || 1000;
    if (typeof this.salt !== 'string' || typeof this.hash !== 'string' ||
        !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10000000) {
      return callback(null, false);
    }

    var storedHash;
    try {
      storedHash = Buffer.from(this.hash, 'hex');
    } catch (error) {
      return callback(null, false);
    }
    if (storedHash.length !== 64) {
      return callback(null, false);
    }

    crypto.pbkdf2(password, this.salt, iterations, 64, 'sha512', function(err, hash) {
      if (err) {
        return callback(err);
      }
      callback(null, crypto.timingSafeEqual(storedHash, hash));
    });
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