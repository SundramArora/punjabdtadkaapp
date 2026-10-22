var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemOrderDetailsSchema = new Schema({
    
    "itemOrderDetailId" : Number, 
    "itemOrderId" : Number, 
    "itemId" : Number, 
    "Amount" : Number, 
    "discountId" : Number, 
    "discountAmount" : Number    
}
, { collection: 'itemOrderDetails' });

module.exports = itemOrderDetailsSchema;