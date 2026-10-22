var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var notificationSchema=new Schema({
    Noid:Number,
    heading:String,
    offer:String,
    code:String,
},{collection:'notification'})

module.exports=notificationSchema;
