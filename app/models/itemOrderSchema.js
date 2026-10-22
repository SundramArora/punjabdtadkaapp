var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var orderLineSchema = new Schema({
    itemId:Number,
    quantityId:Number,
    itemName:String,
    quantityName:String,
    quantity:Number,
    unitPricePaise:Number,
    lineTotalPaise:Number
}, {_id:false});

var paymentSchema = new Schema({
    method:String,
    amountPaise:Number,
    status:String,
    providerOrderId:String,
    providerPaymentId:String,
    paidAt:Date
}, {_id:false});

var refundSchema = new Schema({
    idempotencyKey:String,
    method:String,
    amountPaise:Number,
    status:String,
    providerRefundId:String,
    createdAt:Date,
    approvedBy:String
}, {_id:false});

var itemOrderSchema = new Schema({
    "itemOrderId" : Number, 
    "items" : [orderLineSchema],
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
    "currency":String,
    "subtotalPaise":Number,
    "discountPaise":Number,
    "taxableAmountPaise":Number,
    "taxPaise":Number,
    "deliveryFeePaise":Number,
    "totalPaise":Number,
    "walletPaidPaise":Number,
    "onlinePaidPaise":Number,
    "codDuePaise":Number,
    "paymentStatus":String,
    "refundStatus":String,
    "idempotencyKey":String,
    "requestHash":String,
    "razorpayOrderId":String,
    "razorpayPaymentId":String,
    "cancelledAt":Date,
    "payments":[paymentSchema],
    "refunds":[refundSchema],
    "orderStatus":String,
    "paymentMethod":String,
    "userId" : Number,
    "username":String
}
, { collection: 'itemOrder', timestamps:true });

itemOrderSchema.index({idempotencyKey:1}, {unique:true, sparse:true});
itemOrderSchema.index({razorpayOrderId:1}, {unique:true, sparse:true});

module.exports = itemOrderSchema;