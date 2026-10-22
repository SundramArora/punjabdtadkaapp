var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var addressSchema = new Schema({
    AddId:Number,
    userId:Number,
    username:Number,
    street_address: String,
    city:String,
    state:String, 
    zip_postalcode:Number,
    phonenumber:Number ,
    AddressType :String,
    companyId:Number,
    branchId: Number,
    
}, { collection: 'Address' });

module.exports = addressSchema;