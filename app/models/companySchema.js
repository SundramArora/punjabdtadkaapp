var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var companySchema = new Schema({
    companyName: String,
    address:String,
    email:String, 
    pContactNo:String,
    contactNo:String ,
    description:String,
    contactPerson:String 
}, { collection: 'company' });

module.exports = companySchema;