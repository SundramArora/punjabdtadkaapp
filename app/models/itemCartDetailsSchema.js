var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemCartDetailsSchema = new Schema({
    
    "itemCartDetailId" : Number, 
    "itemCartId" : Number, 
    "itemId" : Number, 
    "Amount" : Number, 
    "discountApplied" : Number, 
    "discountAmount" : Number,
    "itemQuantity":Number   
}
, { collection: 'itemCartDetails' });

module.exports = itemCartDetailsSchema;

