var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemCartSchema = new Schema({
    "itemDetails":[
        {
            "itemId" : Number, 
            "quantityId" : Number,
            "itemName" : String,
            "quantityName" : String,
            "unitPricePaise" : Number,
            "lineTotalPaise" : Number,
            "itemQuantity":Number
    }
    ],
    "couponApplied": Number,
    "totalAmountPaid": Number,
    "taxPaid": Number,
    "OrderId":String,
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
    "currency" : String,
    "subtotalPaise" : Number,
    "totalPaise" : Number,
    "orderId" : String,
    "checkoutIdempotencyKey" : String,
    "orderStatus":String,
    "paymentMethod":String,
    "userId" : Number,
    "username":String
}
, { collection: 'itemCart' });

module.exports = itemCartSchema;