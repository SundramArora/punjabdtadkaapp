var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var WalletBalanceSchema = new Schema({

    walletId : Number, 
    UserId : Number, 
    orderId : Number, 
    walletAmount : Number, 
    expiryDate :Date , 
    alertDay : String,
    username:Number,
    walletdate:Date
}, { collection: 'userWallets' });

module.exports = WalletBalanceSchema;
