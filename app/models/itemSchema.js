var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var itemSchema = new Schema({

"itemId" : Number, 
"name" : String, 
"displayName" : String, 
"description" : String, 
"isNonVeg": Boolean,
"quantity" : [
    {
        "qtId" : Number, 
        "name" : String, 
        "display" : String, 
        "bestFor" :String, 
        "description" : String, 
        "amount" : Number
    }
], 
"landingImage" : String, 
"images" : [
    {
        "image" : String
    }
], 
"categoryId" : Number, 
"subCategoryId" : Number, 
"spiceLevel" : Number, 
"deliveryRatings" : [
    {
        "username" : Number, 
        "userfullname" : String, 
        "ratingLevel" : String, 
        "orderId" : Number
    }
], 
"itemRatings" : [
    {
        "username" :Number, 
        "userfullname" : String, 
        "ratingLevel" : String
    }
], 
"sharings" : [
    {
        "facebook" : Number, 
        "whatsapp" : Number, 
        "linkedIn" : Number, 
        "twitter"  : Number, 
        "Instagram" : Number
    }
], 
"likes" : [
    {
        "username" : Number, 
        "userfullname" : String, 
        "isLike" : Boolean,
        "isFavorite" : Boolean,
    }
], 
"comments" : [
    {
        "username" : Number, 
        "userfullname" : String, 
        "comment" : String, 
        "commentDate" : Date, 
        "commentLikes" : [
            {
                "username" : Number, 
                "userfullname" : String, 
                "isLike" : Boolean
            }
        ]
    }
],
"companyId" : Number, 
"branchId" : Number,
}
, { collection: 'items' });

module.exports = itemSchema;