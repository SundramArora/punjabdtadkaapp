var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var WalletTransactionSchema = new Schema({
    transactionId:{type:String, required:true, unique:true},
    idempotencyKey:{type:String, required:true, unique:true},
    userId:{type:Number, required:true, index:true},
    orderId:String,
    type:{type:String, enum:['credit','debit'], required:true},
    source:{type:String, enum:['registration_bonus','order_payment','refund','expiry'], required:true},
    amountPaise:{type:Number, required:true, min:1},
    currency:{type:String, default:'INR'},
    status:{type:String, enum:['pending','completed','failed'], default:'pending'},
    expiresAt:Date,
    createdAt:{type:Date, default:Date.now}
}, {collection:'walletTransactions'});

module.exports = WalletTransactionSchema;
