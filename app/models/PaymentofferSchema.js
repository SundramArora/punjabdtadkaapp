var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var PaymentofferSchema=new Schema({
    Id:Number,
    Amount:Number,
    Discountper:Number,
    ValidTill:String
    
},{collection:'Paymentoffer'})

module.exports=PaymentofferSchema;
