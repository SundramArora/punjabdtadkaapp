var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var OTPSchema = new Schema({

    MobileNO:String,    
    OTP_Hash:String,
    UserId:Number,
    Status:String,
    OTP_Date:Date,
    Attempts:{type:Number, default:0}
}, { collection: 'OTP' });

module.exports = OTPSchema;
