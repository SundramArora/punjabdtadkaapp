var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var OTPSchema = new Schema({

    MobileNO:String,    
    OTP:Number,
    UserId:Number,
    Status:String,
    OTP_Date:Date
}, { collection: 'OTP' });

module.exports = OTPSchema;
