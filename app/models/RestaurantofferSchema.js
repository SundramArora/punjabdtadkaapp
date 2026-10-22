var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var RestaurantofferSchema=new Schema({
    Id:Number,
    Itemid:Number,
    type:String,
    Discountper:Number,
    ValidTill:Date,
    paymentMethod:String
    
},{collection:'Restaurantoffer'})

module.exports=RestaurantofferSchema;
