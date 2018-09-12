var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var dashboardSchema = new Schema({
    "type" : String, 
    "did" : Number, 
    "image" : String, 
    "categoryId" : Number, 
    "itemId" : Number
}
, { collection: 'dashboard' });

module.exports = dashboardSchema;