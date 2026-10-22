var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemCartSchema = new Schema({
    "itemDetails":[
        {
            "itemId" : Number, 
            "Amount" : Number, 
            "discountApplied" : Number, 
            "discountAmount" : Number,
            "itemQuantity":Number   
    }
    ],
    "couponApplied": Number,
    "totalAmountPaid": Number,
    "taxPaid": Number,
    "OrderId":Number,
    "itemCartId" : Number, 
    "itemCartDate" : Date, 
    "itemTotal" : Number, 
    "discountId" : Number,
    "couponTotal" : Number, 
    "wallterId" : Number, 
    "taxes" : [
        {
            "taxId" : Number, 
            "taxName" : String, 
            "percentage" : String, 
            "Amount" : Number
        }
    ], 
    "taxesTotal" : Number, 
    "NetTotal" : Number, 
    "orderStatus":String,
    "paymentMethod":String,
    "userId" : Number,
    "username":Number
}
, { collection: 'itemCart' });

module.exports = itemCartSchema;