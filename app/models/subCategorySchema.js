var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var subcategorySchema = new Schema({
    name: String,
    description: String,
    isActive:Boolean,
    orderNo:Number,
    openDate: Date,
    categoryId:String
}, { collection: 'subcategory' });

module.exports = subcategorySchema;