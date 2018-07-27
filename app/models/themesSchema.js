var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var themesSchema = new Schema({
    name: String,
    id: String
}, { collection: 'themes' });

module.exports = themesSchema;