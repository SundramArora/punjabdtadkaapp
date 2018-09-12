var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemCartSchema = new Schema({
    "itemCartId" : String, 
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
    "userId" : Number
}
, { collection: 'itemCart' });

module.exports = itemCartSchema;