var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var branchSchema = new Schema({
    branchId: String,
    branchName: String,
    address:String,
    email:String, 
    pContactNo:String,
    contactNo:String ,
    description:String,
    contactPerson:String ,
    companyId:String
    
}, { collection: 'branch' });

module.exports = branchSchema;