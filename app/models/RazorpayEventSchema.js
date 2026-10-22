var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var RazorpayEventSchema = new Schema({
    eventId:{type:String, required:true, unique:true},
    eventType:{type:String, required:true},
    orderId:String,
    paymentId:String,
    status:{type:String, enum:['processing','completed','ignored','failed'], default:'processing'},
    createdAt:{type:Date, default:Date.now}
}, {collection:'razorpayEvents'});

module.exports = RazorpayEventSchema;
