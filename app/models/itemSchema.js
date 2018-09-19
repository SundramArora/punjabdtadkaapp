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
        "userId" : Number, 
        "userfullname" : String, 
        "ratingLevel" : String, 
        "orderId" : Number
    }
], 
"itemRatings" : [
    {
        "userId" :Number, 
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
        "userId" : Number, 
        "userfullname" : String, 
        "isLike" : Boolean,
        "isFavorite" : Boolean,
    }
], 
"comments" : [
    {
        "userId" : Number, 
        "userfullname" : String, 
        "comment" : String, 
        "commentDate" : Date, 
        "commentLikes" : [
            {
                "userId" : Number, 
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