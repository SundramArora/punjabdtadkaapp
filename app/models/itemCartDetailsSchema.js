var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemCartDetailsSchema = new Schema({
    
    "itemCartDetailId" : Number, 
    "itemCartId" : Number, 
    "itemId" : Number, 
    "Amount" : Number, 
    "discountId" : Number, 
    "discountAmount" : Number    
}
, { collection: 'itemCartDetails' });

module.exports = itemCartDetailsSchema;