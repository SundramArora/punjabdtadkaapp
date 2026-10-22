var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var dashboardSchema = new Schema({
    "type" : String, 
    "did" : Number, 
    "image" : String, 
	"imageval" : String, 
    "categoryId" : Number, 
    "itemId" : Number,
    "Rating":Number,
    "Name":String
}
, { collection: 'dashboard' });

module.exports = dashboardSchema;