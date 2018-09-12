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
"spiceLevel" : String, 
"deliveryRatings" : [
    {
        "userId" : String, 
        "userfullname" : String, 
        "ratingLevel" : String, 
        "orderId" : Number
    }
], 
"itemRatings" : [
    {
        "userId" :String, 
        "userfullname" : String, 
        "ratingLevel" : String
    }
], 
"sharings" : [
    {
        "facebook" : Number, 
        "whatsapp" : Number, 
        "linkedIn" : Number, 
        "twitter" : Number, 
        "Instagram" : Number
    }
], 
"likes" : [
    {
        "userId" : String, 
        "userfullname" : String, 
        "isLike" : Boolean
    }
], 
"comments" : [
    {
        "userId" : String, 
        "userfullname" : String, 
        "comment" : String, 
        "commentDate" : Date, 
        "commentLikes" : [
            {
                "userId" : String, 
                "userfullname" : String, 
                "isLike" : Boolean
            }
        ]
    }
]
}
, { collection: 'items' });

module.exports = itemSchema;