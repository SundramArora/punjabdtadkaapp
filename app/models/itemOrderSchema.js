var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemOrderSchema = new Schema({
    "itemOrderId" : Number, 
    "itemOrderDate" : Date, 
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
, { collection: 'itemOrder' });

module.exports = itemOrderSchema;