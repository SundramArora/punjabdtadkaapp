var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var categorySchema = new Schema({
    name: String,
    description: String,
    isActive:Boolean,
    orderNo:Number,
    openDate: Date
}, { collection: 'category' });

module.exports = categorySchema;