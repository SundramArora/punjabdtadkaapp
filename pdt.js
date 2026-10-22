process.env.NODE_ENV = process.env.NODE_ENV || "development";
var _ = require("lodash");
var express = require("express");
var bodyParser = require("body-parser");
var jwt = require('jsonwebtoken');
var mongoose = require('mongoose');
var passport = require("passport");
var passportJWT = require("passport-jwt");
var publicDir = require('path').join(__dirname,'/images/').replace(/\\/g, "/");
var publicDashDir = require('path').join(__dirname,'/dashboardimages/').replace(/\\/g, "/");
var randomize = require('randomatic');
var request = require('request');
var async=require('async');
var nodemailer = require('nodemailer');

var findRemoveSync = require('find-remove')
// var logger = require('E:/Github/punjabdtadkaapp/logger').Logger;
var logger = require(__dirname+'/logger').Logger;
var ExtractJwt = passportJWT.ExtractJwt;
var JwtStrategy = passportJWT.Strategy;
var crypto = require('crypto');
var base64ToImage = require('base64-to-image');
var fs = require('fs');
var pdt="pdt";
var jwtOptions = {}
var dateFormat = require('dateformat');
//jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeader();


var config = require('./app/config/config');
var userSchema = require('./app/models/userSchema');
var OTPSchema = require('./app/models/OTPSchema');
var WalletBalanceSchema = require('./app/models/WalletBalanceSchema');

var companySchema = require('./app/models/companySchema');
var branchSchema = require('./app/models/branchSchema');
var categorySchema = require('./app/models/categorySchema');
var subcategorySchema = require('./app/models/subCategorySchema');
var itemSchema = require('./app/models/itemSchema');
var itemCartSchema = require('./app/models/itemCartSchema');
var itemCartDetailsSchema = require('./app/models/itemCartDetailsSchema');
//var usersSchema = require('./app/models/usersSchema');
var dashboardSchema = require('./app/models/dashboardSchema');
var addressSchema =require('./app/models/addressSchema');
var itemOrderSchema =require('./app/models/itemOrderSchema');
var notificationSchema=require('./app/models/notificationSchema');
var RestaurantofferSchema=require('./app/models/RestaurantofferSchema');
var PaymentofferSchema=require('./app/models/PaymentofferSchema');

jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
jwtOptions.secretOrKey = config.secret;

var strategy = new JwtStrategy(jwtOptions, function(jwt_payload, next) {
  console.log('payload received', jwt_payload);
  // usually this would be a database call:
  var user =  user.findOne({id: jwt_payload.id});

  if (!user) {
    return done(null, false, {
      message: 'User not found'
    });
  }
  // Return if password is wrong
  if (!user.validPassword(password)) {
    return done(null, false, {
      message: 'Password is wrong'
    });
  }
  // If credentials are correct, return the user object
  return done(null, user);

//   if (user) {
//     next(null, user);
//   } else {
//     next(null, false);
//   }
});



passport.use(strategy);



var app = express();
app.use(passport.initialize());





// parse application/x-www-form-urlencoded
// for easier testing with Postman or plain HTML forms
app.use(bodyParser.urlencoded({
  extended: true
}));

// parse application/json
app.use(bodyParser.json())


mongoose.Promise = global.Promise;
var mongooseConnections = {
    pdt :mongoose.createConnection(config.mongodbUrl)
};

app.get("/", function(req, res) {
  res.json({message: "PDT Server is up!"});
});

var router = express.Router();

var whiteListRoutes = ['/api','login','register'];
//BEGIN ROUTING
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, X-AUTHENTICATION, X-IP, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Credentials', true);
  if (whiteListRoutes.indexOf(req.originalUrl.replace('/api/', '')) > -1) {
      next();
  }
  // else if (req.method === 'POST') {
  //     const bearerHeader = req.headers["authorization"];
  //     if (typeof bearerHeader !== 'undefined') {
  //         const bearer = bearerHeader.split(" ");
  //         const bearerToken = bearer[1];
  //         req.token = bearerToken;
  //         jwt.verify(req.token, config.sessionSecret, function(err, data) {
  //             if (err) {
  //                 res.sendStatus(403);
  //             }
  //             else {
  //                 req.body.clientId = data.clientId.toLowerCase();
  //                 req.body.sessionId = data.sessionId;
  //                 req.body.userName = data.userName;
  //                 next();
  //             }
  //         });
  //     }
  //     else res.sendStatus(403);
  // }
  // else if (req.method === 'GET') {
  //     var token = req.query.token;
  //     if (token === null) {
  //         res.sendStatus(403);
  //     }
  //     else {
  //         jwt.verify(token, config.sessionSecret, function(err, data) {
  //             if (err) {
  //                 res.sendStatus(403);
  //             }
  //             else {
  //                 req.body.clientId = data.clientId.toLowerCase();
  //                 req.body.sessionId = data.sessionId;
  //                 req.body.userName = data.userName;
  //                 next();
  //             }
  //         });
  //     }
  // }
  else {
      next();
  }
});








router.post("/register", function(req, res) {
    var User = mongooseConnections[pdt].model('User', userSchema);
   
    User.find( {UserId: {$exists: true}},{'_id':0,"UserId":1} ,function (err, Id) {
     
    if (err) {
        console.log(err) 
        } 
        else{
                    
                    var user = new User();
                    user.UserId=parseInt( parseInt(Id[0]._doc.UserId)+1);
                    user.username = req.body.username;
                    user.password = req.body.password;
                    user.name = req.body.name;
                    user.setPassword(req.body.password);
                
                    user.save(function(err) {
                        if (err)
                        {
                            if(err.message.indexOf("E11000") > -1)
                            res.status(401).json({message:"user already exist!"}); 
                            else
                            res.status(401).json({message:err.message});  
                        }
                        else 
                        {
                            var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
                            WalletBalance.findOne({walletId:{$exists:true}},{"_id":0,"walletId":1},function(err,wallId){
                                        if(err)
                                        res.status(401).json({GetData:err.message});
                                        else{

                                                       var wallet =new WalletBalance();
                                                        
                                                        wallet.walletId = parseInt(parseInt(wallId._doc.walletId)+1)
                                                        wallet.UserId =user.UserId;
                                                        wallet.orderId =0 ;
                                                        wallet.walletAmount =50;
                                                        wallet.expiryDate = new Date(Date.now()+ 1000*60*60*24*30);
                                                        wallet.alertDay ="alert to user 7 days before expiryDate";
                                                        wallet.username=user.username;
                                                        wallet.walletdate=new Date();
                                                        wallet.save(function(err) {
                                                            if (err)
                                                            {
                                                            
                                                                res.status(401).json({message:err.message});  
                                                            }
                                                            else 
                                                            {

                                                                var token;
                                                                token = user.generateJwt();
                                                                res.status(200); 
                                                                user.password = undefined;    
                                                                res.json({message: user, token: token});      
                                                        } 
                                                    });
                                        }

                            }).sort({walletId:-1}).limit(1);
                                        
                        }
                    });


            
        }
    }).sort({UserId : -1}).limit(1);
  
  });


router.post("/login", function(req, res) {
    if(req.body.username && req.body.password){
      var username = req.body.username;
      var password = req.body.password;
   
    //console.log(username);
    //console.log(password);
    // usually this would be a database call:
    //var Users = mongooseConnections[pdt].model('staff', UserSchema);
    var Users = mongooseConnections[pdt].model('User', userSchema);
  var user;
  Users.findOne({'username':username,'password': password}, 'username email name roles UserId isOtpVerified', function(err,user)
    {
        if(err)
        {
        res.status(401).json({message:"no such user found"});        
        }
        if(user==null)
        {
            res.status(401).json({message:"User " + username + " and Password doesn't match!"});
        }
    //user=user;
    else
    {
       // if(user.password === password) {
        // from now on we'll identify the user by the id and the id is the only personalized value that goes into our token
        var payload = {id: user.id};
        var token = jwt.sign(payload, jwtOptions.secretOrKey);
        res.json({message: user, token: token});
     // } else {
     //   res.status(401).json({message:"passwords did not match"});
      }

    
    });
    }
   
  });

//   var generateJwt = function() {
//     var expiry = new Date();
//     expiry.setDate(expiry.getDate() + 7);
  
//     return jwt.sign({
//       _id: this._id,
//       username: this.username,
//       //name: this.name,
//       exp: parseInt(expiry.getTime() / 1000),
//     }, config.secret); // DO NOT KEEP YOUR SECRET IN THE CODE!
//   };

//   var generatePassword = function(password){
//     this.salt = crypto.randomBytes(16).toString('hex');
//     this.hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
//   };

//   var validPassword = function(password) {
//     var hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
//     return this.hash === hash;
//   };
  
  
router.post("/saveCompany", function(req, res) {
    if(req.body.companyName ){
      var companyName = req.body.companyName;
      var description = req.body.description;            
    var address=req.body.address;
    var email=req.body.email; 
    var  pContactNo= req.body.pContactNo;
    var contactNo=req.body.contactNo;    
    var contactPerson= req.body.contactPerson;
    
    var company = mongooseConnections[pdt].model('company', companySchema);



    }
});

router.post("/saveItem", function(req, res) {
    var Item = mongooseConnections[pdt].model('Item', itemSchema);

    if(req.body.name==null)
    {
      req.body =  JSON.stringify(req.body);
    }
    if(req.body.name)
    {
        
        var item = new Item();
        item.itemId = req.body.itemId;
        item.name = req.body.name;
        item.displayName= req.body.displayName;
        item.description = req.body.description;    
        item.quantity =  req.body.quantity;
        item.landingImage = req.body.landingImage;
        item.images = req.body.images;
        item.categoryId = req.body.categoryId;
        item.subCategoryId = req.body.subCategoryId;
        item.spiceLevel = req.body.spiceLevel;

        item.save(function(err) {
            if (err)
            {                
                res.status(401).json({message:err.message});  
            }
            else 
            {
               // var token;
                //token = user.generateJwt();
                res.status(200); 
                //user.password = undefined;    
                res.json({message: item});       
            }
        });

    }
});

var getToken = function (headers) {
    if (headers && headers.authorization) {
      var parted = headers.authorization.split(' ');
      if (parted.length === 1) {
        return parted[0];
      } else {
        return null;
      }
    } else {
      return null;
    }
  };
  router.post("/OTP", function(req, res) {
    if(req.body.MobileNO )
    var MobileNO = req.body.MobileNO;
 
    var OTP = mongooseConnections[pdt].model('OTP', OTPSchema);
  

 OTP.find( {UserId: {$exists: true}},{'_id':0,"UserId":1} ,function (err, Id) {
     
  if (err) {
      console.log(err) 
      } 
      else{
          var Code=   randomize('0', 4);
          var message='Your Ezifood verification code is: ' + Code;
          var otp = new OTP();
          otp.OTP=Code;
          otp.MobileNO=MobileNO;
          otp.UserId=parseInt( parseInt(Id[0]._doc.UserId)+1);
          otp.OTP_Date=new Date();
          otp.save(function(err) {
              if (err)
              {            
                  res.status(401).json({message:err.message});  
              }
              else 
              {
                  request('http://admagister.net/api/mt/SendSMS?user=EZISCH2018&password=EZISCH2018&senderid=EZISCH&channel=trans&DCS=0&flashsms=0&number='+MobileNO+'&text='+message+'&route=14', function (error, response, body) {
                      if (!error && response.statusCode == 200) {
                        var info = JSON.parse(body)
                      }
                  })
                res.json({message: otp});       
              }
               });
    
      }
     
}).sort({UserId : -1}).limit(1);
 

});

router.post("/VerifyOTP", function(req, res) {
  
  var Mobile = req.body.MobileNO;
  var OTPNO = req.body.OTP;

  var OTP = mongooseConnections[pdt].model('OTP', OTPSchema);
  
  var Users = mongooseConnections[pdt].model('staff', userSchema);

  OTP.findOne({'MobileNO':Mobile,'OTP': OTPNO},{"MobileNO":1,"OTP":1,"UserId":1,"OTP_Date":1}, function(err,otp)
    {
        if(err)
        {

        res.status(401).json({message:"no such user found"});        
        }
        if(otp==null)
        {
            res.status(401).json({message:"OTP " + OTPNO + "  doesn't Exist!"});
        }
   
      else
      {
                var d=new Date()
              if(otp.OTP_Date<d.setSeconds(d.getSeconds() - 600))
               {
                OTP.update({ "OTP": OTPNO,"MobileNO": Mobile }, { $set: { "Status": 'Expired' } }, function (err, updateDone) {
                          
                    if (err) res.status(401).json({message:"no such user found"});        
                     else 
                     res.status(401).json({message:"Your verification code " + OTPNO + "  Is Expired !"});
                });
               }
                else  if(otp.MobileNO==Mobile && otp.OTP==OTPNO)
                  {
                      OTP.update({ "OTP": OTPNO,"MobileNO": Mobile }, { $set: { "Status": 'verified' } }, function (err, updateDone) {
                          
                          if (err) res.status(401).json({message:"no such user found"});        
                           else 
                          // res.json({message: "Your Ezifood verification code Is verified ...!!! "});
                              {
                                  Users.findOne({'username':Mobile },{"username":1,"isOtpVerified":1,"password":1}, function(err,otp)
                                  {
                                      if(err)
                                      {
                                      res.status(401).json({message:"no such user found"});        
                                      }
                                      if(otp==null)
                                      {
                                          res.status(401).json({message:"OTP " + OTPNO + "  doesn't Exist!"});
                                      }
                                 
                                    else
                                    {
                                      Users.update({ 'username':Mobile }, { $set: { "isOtpVerified": 'true' } }, function (err, updateDone) {
                      
                                          if (err) res.status(401).json({message:"no such user found"});        
                                          else 
                                          res.json({message: "Your Ezifood verification code Is verified ...!!! "});
                                      
                                      
                                          });
                                      }
                                  });
                              }
                      });
                  }
               else {
                      res.status(401).json({message:"Your Ezifood verification code Is Not verified ...!!!"});
                   }

      }
    
    
    });
    
});
router.get("/getItems",  function(req, res) {
    //var token = getToken(req.headers);
   // if(token)
    //{
        var Item = mongooseConnections[pdt].model('Item', itemSchema);
        Item.find(function(err,items)
        {
            if(err)
            {
            res.status(401).json({message:"no such Item found"});        
            }
            else 
            { 
                res.json({message: items});
            }
        });
    //}
});

router.get("/InProcessOrder",  function(req, res) {
    var username=req.query.username
    //var token = getToken(req.headers);
   // if(token)spos
    //{
        var itemCart = mongooseConnections[pdt].model('itemCart', itemCartSchema);
        itemCart.find({"username":username},{"_id":0,"itemCartDate":1,"itemTotal":1,"NetTotal":1,"orderStatus":1,"PaymentMethod":1},function(err,Cart)
        {
            if(err)
            {
            res.status(401).json({GetData:"no such Item found"});        
            }
            else 
            { 
                
                Cart.forEach(function(orderitem){
                  orderitem._doc.Date=dateFormat(orderitem._doc.itemCartDate,"d mmm")
                  orderitem._doc.Time=dateFormat(orderitem._doc.itemCartDate,"h:MM TT")
                  orderitem._doc.orderQuanity =orderitem._doc.itemTotal
                  orderitem._doc.price =orderitem._doc.NetTotal
				  orderitem._doc.orderStatus ="InProcess";
                  orderitem._doc.paymentMethod="COD";

                  
                  delete orderitem._doc.itemTotal
                  delete orderitem._doc.NetTotal
                  delete orderitem._doc.itemCartDate
                });
             
                res.json({GetData: Cart});
            }
        });
    //}
  });
  
router.get("/PastOrder",  function(req, res) {
    var username=req.query.username
    //var token = getToken(req.headers);
   // if(token)
    //{
        var itemOrder = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
        itemOrder.find({"username":username},{"_id":0,"itemOrderDate":1,"itemTotal":1,"NetTotal":1,"orderStatus":1,"PaymentMethod":1},function(err,Order)
        {
            if(err)
            {
            res.status(401).json({GetData:"no such Item found"});        
            }
            else 
            { 
                Order.forEach(function(orderitem){
                  orderitem._doc.Date=dateFormat(orderitem._doc.itemOrderDate,"d mmm")
                  orderitem._doc.Time=dateFormat(orderitem._doc.itemOrderDate,"h:MM TT")
                  orderitem._doc.orderQuanity =orderitem._doc.itemTotal
                  orderitem._doc.price =orderitem._doc.NetTotal

                  delete orderitem._doc.itemTotal
                  delete orderitem._doc.NetTotal
                  delete orderitem._doc.itemOrderDate
                });
             
                res.json({GetData: Order});
            }
        });
    //}
  });
  router.get("/WalletBalance",  function(req, res) {
    var username=req.query.username
    //var token = getToken(req.headers);
   // if(token)
    //{
        
        var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
        //WalletBalance.find({"username":parseInt(username)},{"_id":0,"walletAmount":1,"orderId":1,"expiryDate":1,"alertDay":1}
         WalletBalance.aggregate([
           {
               $match:{
                "username":parseInt(username) 
               }
           },

        //    { $unwind: '$userWallets'},
            {
                $group: {
                     _id: {username:"$username",expiryDate:"$expiryDate"},
                    Amount:{$sum:"$walletAmount"},
                    orderId:{ $max:"$orderId"},
                    alertDay:{ $max:"$alertDay"},
                        }
            },
            { 
                $sort :
                   { 
                     orderId : 1 
                    }
                }
            
         ]

        ,function(err,wallet){
            if(err)
            {
            res.status(401).json({GetData:"no such Item found"});        
            }
            else 
            { 
                var  walletAmount=0;
                                    WalletBalance.aggregate([
                                        {
                                            $match:{
                                            "username":parseInt(username),"expiryDate" : { $gte : new Date() }
                                            }
                                        },
                                    //    { $unwind: '$userWallets'},
                                        {
                                            $group: {
                                                _id: {username:"$username",expiryDate:"$expiryDate"},
                                                Amount:{$sum:"$walletAmount"},
                                               
                                                    }
                                        }
                                        
                                    ]
                            
                                    ,function(err,walletamt){
                                        if(err)
                                        {
                                        res.status(401).json({GetData:"no such Item found"});        
                                        }
                                        else{
                                            if(walletamt.length>0)
                                            walletAmount  =walletamt[0].Amount
                                            wallet.forEach(function(objwallet){
                                                objwallet.username =objwallet._id.username;
                                                objwallet.expiryDate =objwallet._id.expiryDate;
                                                delete objwallet._id;
                                            })
                                                res.json({walletAmount,GetData: wallet});
                                        }
                                        
                                    });
                
           }
        });
        
    //}
  });



router.get("/getDashboard",function(req,res) {
var  dashboard = mongooseConnections[pdt].model('dashboard', dashboardSchema);
dashboard.find({},{type:1, did:1, image:1 ,categoryId:1, itemId:1,Rating:1,Name:1},function(err,items)
//dashboard.find(function(err,items)
        {
            if(err)
            {
            res.status(401).json({message:"no such Dashboard found"});        
            }
            else 
            { 
               /* for (var i=0;i<items.length;i++)
                {

                    var element = items[i];
                    if (element.imageval!='')
                    {
                    var base64Str = element.imageval ;
                    //var path ='G:/ezifoods/punjabdtadkaapp/images/';
                   // var path ='/images/';
                    var optionalObj = {'fileName': element.type + '_' + element.did + '_' + Date.now() , 'type':'webp'};
                    var imageInfo = base64ToImage(base64Str, publicDashDir ,optionalObj);                     
                    element.image = "/dashboardimages/" + imageInfo.fileName;
                    }
				} 						  
*/
                res.json({message: items});
            
			     }
        });

}) ;


router.get("/saveDashboard",function(req,res) {
var  dashboard = mongooseConnections[pdt].model('dashboard', dashboardSchema);
//dashboard.find({},{type:1, did:1, image:1 ,categoryId:1, itemid:1},function(err,items)
dashboard.find(function(err,items)
        {
            if(err)
            {
            res.status(401).json({message:"no such Dashboard found"});        
            }
            else 
            { 
                for (var i=0;i<items.length;i++)
                {

                    var element = items[i];
                    if ( element.imageval!=undefined)
                    {
                    var base64Str = element.imageval ;
                    //var path ='G:/ezifoods/punjabdtadkaapp/images/';
                   // var path ='/images/';
                    var optionalObj = {'fileName': element.type + '_' + element.did + '_' + Date.now() , 'type':'webp'};
                    var imageInfo = base64ToImage(base64Str, publicDashDir ,optionalObj);                     
                    element.image = "/dashboardimages/" + imageInfo.fileName;
                    }
				} 						  

                res.json({message: items});
            
			}
        });

} );


function getNextSequenceValue1(sequenceName){
  var sequenceDocument = db.counters.findAndModify({
  query:{_id: sequenceName },
  update: {$inc:{sequence_value:1}},
  new:true
    });
return sequenceDocument.sequence_value;
}

router.get("/UserAddress",  function(req, res) {
    var username=req.query.username
    //var token = getToken(req.headers);
   // if(token)
    //{
        var address = mongooseConnections[pdt].model('Address', addressSchema);
        address.find({"username":username},{"street_address":1,"city":1,"state":1,"zip_postalcode":1,"phonenumber":1,"AddressType":1,"AddId":1},function(err,Add)
        {
            if(err)
            {
            res.status(401).json({GetData:"no such Item found"});        
            }
            else 
            { 
                res.json({GetData: Add});
            }
        });
    //}
  });
router.post("/SaveUserAddress",  function(req, res) {
    var Address = mongooseConnections[pdt].model('Address', addressSchema);
    
    Address.findOne({},{_id:0,AddId:1}, function(err,Id){
       if(err)
       res.status(401).json({message:err.message})
        else{
                               
                            var add = new Address()
                            add.AddId= Id !=null?parseInt(parseInt(Id.AddId)+1):1;
                            add.username=req.body.username;
                            add.street_address=req.body.street_address  ;
                            add.city=req.body.city  ;
                            add.state=req.body.state  ;
                            add.zip_postalcode=req.body.zip_postalcode;
                            add.phonenumber=req.body.phonenumber;
                            add.AddressType=req.body.AddressType;
                            
                            
                            //var token = getToken(req.headers);
                        // if(token)
                            //{
                                
                                add.save(function(err) {
                                    if (err)
                                    {                
                                        res.status(401).json({message:err.message});  
                                    }
                                    else 
                                    {
                                    // var token;
                                        //token = user.generateJwt();
                                        res.status(200); 
                                        //user.password = undefined;    
                                        res.json({message: add});       
                                    }
                                });
                            //}

   }
    }).sort({AddId:-1}).limit(1);
    
  });
  router.get("/GetUpdateUserAddress",  function(req, res) {
    var AddId=req.query.AddId;
    var username=req.query.username
    //var token = getToken(req.headers);
   // if(token)
    //{
        var address = mongooseConnections[pdt].model('Address', addressSchema);
        address.find({"username":username,"AddId":AddId},{"street_address":1,"city":1,"state":1,"zip_postalcode":1,"phonenumber":1,"AddressType":1,"AddId":1},function(err,Add)
        {
            if(err)
            {
                 res.status(401).json({GetData:error});
                throw    error+'\n API Name :- GetUpdateUserAddress';     
            }
            else 
            { 
                       

                res.status(200).json({GetData:Add[0]});

            }
        });

});

  router.post("/UpdateUserAddress",  function(req, res) {
      var username=req.query.username;
      var AddId=req.query.AddId;
    var Address = mongooseConnections[pdt].model('Address', addressSchema);
                var add = new Address()
                add.username=req.body.username;
                add.street_address=req.body.street_address  ;
                add.city=req.body.city  ;
                add.state=req.body.state  ;
                add.zip_postalcode=req.body.zip_postalcode;
                add.phonenumber=req.body.phonenumber;
                add.AddressType=req.body.AddressType;
    
        Address.update({ "username": username,"AddId":AddId}, { $set: { street_address:add.street_address, city:add.city,state:add.state,zip_postalcode:add.zip_postalcode,phonenumber:add.phonenumber,AddressType:add.AddressType} }, function (err, updateDone) {
                          
        if (err) 
        res.status(401).json({message:"no such user found"});        
         else 
         res.status(200).json({UpdateData:add});
    });
  });
  router.get("/notification",  function(req, res) {
   // var Noid=req.query.Noid
    //var token = getToken(req.headers);
   // if(token)
    //{
        var notification = mongooseConnections[pdt].model('notification', notificationSchema);
        notification.find({},{"Noid":1,"_id":0,"heading":1,"offer":1,"code":1},function(err,noti)//{"Noid":Noid},
        {
            if(err)
            {
            res.status(401).json({GetData:"no such Item found"});        
            }
            else 
            { 
                res.json({GetData: noti});
            }
        });
    //}
  });
  router.get("/Restaurantoffer",  function(req, res) {
    // var Noid=req.query.Noid
     //var token = getToken(req.headers);
    // if(token)
     //{
         var Restaurantoffer = mongooseConnections[pdt].model('Restaurantoffer', RestaurantofferSchema);
         Restaurantoffer.aggregate([
             {
                 $lookup:
                 {
                     from:"items",
                     foreignField:"itemId",
                     localField:"Itemid",
                     as:"Item_Detaill"
                 }
             },
             {
                 $project:
                 {
                    "Id":1,"Itemid":1,"ImgUrl":1,"displayName":1,"Discountper":1,"ValidTill":1,"paymentMethod":1,"type":1,
                    Item_Detaill:{"displayName":1,"landingImage":1}
                 }
             }
            

         ]
  //  Restaurantoffer.find({},{"Id":1,"Itemid":1,"Discountper":1,"ValidTill":1,"paymentMethod":1}
       ,function(err,Restaurantoff)
         {
             if(err)
             {
             res.status(401).json({GetData:"no such Item found"});        
             }
             else 
             { 
                Restaurantoff.forEach(function(itemObj){
                if ( itemObj.Item_Detaill[0].landingImage !=undefined)
                {
                 var base64Str = itemObj.Item_Detaill[0].landingImage ;
                 var optionalObj = {'fileName': itemObj.type.replace(/ /g, "_") + '_' + itemObj.Id + '_' + Date.now() , 'type':'webp'};
                 var imageInfo = base64ToImage(base64Str,publicDashDir,optionalObj);                     
                 itemObj.ImgUrl = '/dashboardimages/' + imageInfo.fileName;
                 itemObj.displayName = itemObj.Item_Detaill[0].displayName;
                  
                 delete itemObj.Item_Detaill;
                }
             })
                 res.json({GetData: Restaurantoff});
             }
         });
     //}
   });
   router.get("/Paymentoffer",  function(req, res) {
    // var Noid=req.query.Noid
     //var token = getToken(req.headers);
    // if(token)
     //{
         var Paymentoffer = mongooseConnections[pdt].model('Paymentoffer', PaymentofferSchema);
         
         Paymentoffer.find({},{"Id":1,"Discountper":1,"ValidTill":1,"Amount":1}
       ,function(err,Restaurantoff)
         {
             if(err)
             {
             res.status(401).json({GetData:"no such Item found"});        
             }
             else 
             { 
                res.json({GetData: Restaurantoff});
             }
         });
     //}
   });
  
router.post("/addToCart", function(req, res) {
    try{
  var ItemCart = mongooseConnections[pdt].model('ItemCart', itemCartSchema);
  var itemCartDetails = mongooseConnections[pdt].model('itemCartDetails', itemCartDetailsSchema);
  
  // if(req.body.name==null)
  // {
  //   req.body =  JSON.stringify(req.body);
  // }
  // if(req.body.name)
  // {
          
     ItemCart.find( {itemCartId: {$exists: true}},{'_id':0,"itemCartId":1} ,function (err, CartId) {
       
        if (err) {
            console.log(err) 
            } 
            else{
                var item = new ItemCart();
               // var a  = JSON.stringify(ItemCart())
                item.itemCartId= parseInt( parseInt(CartId[0]._doc.itemCartId)+1);
                item.couponApplied=req.body.couponApplied;
                item.totalAmountPaid=req.body.totalAmountPaid;
                item.taxPaid=req.body.taxPaid;
                item.userId=req.body.userId;
                item.username=req.body.username;
                item.time=req.body.time;
                item.date=req.body.date;
                item.OrderId=parseInt( parseInt(CartId[0]._doc.itemCartId)+1);
                item.itemCartDate =new Date();
                item.taxesTotal = req.body.taxesTotal, 
                item.NetTotal = req.body.NetTotal
                item.itemTotal=req.body.itemTotal

                item.save(function(err) {
                    if (err)
                    {                
                        res.status(401).json({message:err.message});  
                    }
                    else 
                    {
                        itemCartDetails.find( {itemCartDetailId: {$exists: true}},{'_id':0,"itemCartDetailId":1} ,function (err, CartDetailId) {
       
                            if (err) {
                                console.log(err) 
                                } 
                                else{

                                   
                                    var count=0;
                                    var i=0;
                                                                     
                                    async.forEach(req.body.itemDetails.values,function(itemObj,callback){
                                        itemObj.itemCartDetailId=1+count+parseInt(CartDetailId[0]._doc.itemCartDetailId);
                                        itemObj.itemCartId=item.itemCartId;
                                        count++;
                                        var itemCartDetail = new itemCartDetails(itemObj);
                                        itemCartDetail.itemId=itemObj.itemId;
                                        itemCartDetail.itemQuantity=itemObj.itemQuantity;
                                        itemCartDetail.discountApplied=itemObj.discountApplied;
                                        itemCartDetail.Amount=itemObj.Amount;
                                        itemCartDetail.discountAmount=itemObj.discountAmount;
                                        // itemCartDetail.values = [];  
                                        //    var  value = {
                                        //         "itemId":itemObj.itemId,
                                        //         "itemQuantity":itemObj.itemQuantity,
                                        //         "discountApplied":itemObj.discountApplied
                                        //     }
                                        //itemCartDetail.values.push(values);
                                        item.itemDetails.push(itemCartDetail);
                                       
                                        
                                        itemCartDetail.save(function(err,result){
                                            if (err)
                                                    {                
                                                            res.status(401).json({message:err.message});  
                                                    }
                                                    else{
                                                       
                                                        i++;
                                                       
                                                        if(count==i){
                                                            
                                                            res.json({GetData: item});
                                                        }
                                                        else{
                                                            callback();
                                                        }
                                                            
                                                    }

                                        })


                                    });
                                }      
                               
                            }).sort({itemCartDetailId : -1}).limit(1);
                        
                    }
                });
          
            }
           
    }).sort({itemCartId : -1}).limit(1);
     
  }
  catch(error) {
    console.error(error);
}
});



     
router.get("/GetItemsCategoryById",  function(req, res) {
   // var token = getToken(req.headers);
    var cat=req.query.CatId
    var userId=req.query.UserId
   // if(token)
  //  {
      
        var items = mongooseConnections[pdt].model('items', itemSchema);
        items.find({"categoryId":cat},//,"likes.userId":userId
        {'_id':0,'itemId':1,'name':1,'itemRatings.ratingLevel':1,'landingImage':1,"likes.isLike":1,"likes.isFavorite":1,"likes.userfullname":1,"spiceLevel":1,"description":1,"quantity.display":1,"quantity.amount":1,"isNonVeg":1,"images.image":1,"companyId":1,"branchId":1},
        function(err, item)
         {
            
          if(err)
            {
                logger.error('Methode : GetItemsCategoryById And Showing Error : - '+err);
            res.status(401).json({GetData:"no such user found"});
            }
            else
            {
              var i=0;
              var LikeCount=0;
              var result = findRemoveSync(publicDir, {age: {seconds: 86400}, extensions: ['.webp','.png','.jpg','.JPG','.gif'], limit: 10})//
              item.forEach(function(itemObj){
                var totalrating=0;
                var ratings=itemObj._doc.itemRatings;
               
                 ratings.forEach(function(rat){
                  totalrating=totalrating+rat.ratingLevel;
                 })
                 itemObj._doc.avgRating=totalrating/ratings.length;
               

                 itemObj._doc.likes.forEach(function(lik){
                   if(lik.isLike)
                  LikeCount=LikeCount+1;
                 });

                 itemObj._doc.LikeCount=LikeCount;
                 itemObj._doc.CategoryImageUrl=itemObj.images[0]._doc.image;
                 itemObj._doc.isLike=itemObj.likes[0]._doc.isLike;
                 itemObj._doc.isFavorite=itemObj.likes[0]._doc.isFavorite; 
                 itemObj._doc.UserName=itemObj.likes[0]._doc.userfullname; 
                 
                 if ( itemObj.landingImage!=undefined)
                     {
                      var base64Str = itemObj.landingImage ;
                      var optionalObj = {'fileName': itemObj.name.replace(/ /g, "_") + '_' + Date.now() , 'type':'webp'};
                      var imageInfo = base64ToImage(base64Str,publicDir,optionalObj);                     
                      itemObj._doc.landingImage = '/images/' + imageInfo.fileName;
                     }
                
                 delete itemObj._doc.itemRatings;
                 delete itemObj._doc.likes;
                 delete itemObj._doc.images;
                     
                  
              })
              
              res.json({GetData: item});
            }
        });
   // }
});

router.get("/GetItemById",  function(req, res) {
    // var token = getToken(req.headers);
     var Itemid=req.query.Itemid
     var userId=req.query.UserId
    // if(token)
   //  {
       
         var items = mongooseConnections[pdt].model('items', itemSchema);
         items.findOne({"itemId": Itemid ,"likes.userId":userId},
         {'_id':0,'name':1,'itemRatings.ratingLevel':1,'landingImage':1,"likes.isLike":1,"likes.isFavorite":1,"likes.userfullname":1,"spiceLevel":1,"description":1,"quantity.display":1,"quantity.amount":1,"isNonVeg":1,"images.image":1,"companyId":1,"branchId":1,"comments":1},
         function(err, itemObj)
          {
             
           if(err)
             {

                logger.error('Methode : GetItemById And Showing Error : - '+err);
             res.status(401).json({GetData:"no such user found"});
             }
             else
             {
                //logger.info("Test Message");
                
               var i=0;
               var LikeCount=0;

               var result = findRemoveSync(publicDir, {age: {seconds: 86400}, extensions: ['.webp','.png','.jpg','.JPG','.gif'], limit: 10})
              // item.forEach(function(itemObj){
                 var totalrating=0;
                 var ratings=itemObj._doc.itemRatings;
                
                  ratings.forEach(function(rat){
                   totalrating=totalrating+rat.ratingLevel;
                  })
                  itemObj._doc.avgRating=totalrating/ratings.length;
                
 
                  itemObj._doc.likes.forEach(function(lik){
                    if(lik.isLike)
                   LikeCount=LikeCount+1;
                  });
 
                  itemObj._doc.LikeCount=LikeCount;
                  itemObj._doc.CategoryImageUrl=itemObj.images[0]._doc.image;
                  itemObj._doc.isLike=itemObj.likes[0]._doc.isLike;
                  itemObj._doc.isFavorite=itemObj.likes[0]._doc.isFavorite; 
                  itemObj._doc.UserName=itemObj.likes[0]._doc.userfullname; 
                  
                  if (  itemObj.landingImage!=undefined)
                      {
                      var base64Str = itemObj.landingImage ;
                      var optionalObj = {'fileName': itemObj.name.replace(/ /g, "_") + '_' + Date.now() , 'type':'webp'};
                      var imageInfo = base64ToImage(base64Str,publicDir,optionalObj);                     
                      itemObj._doc.landingImage = '/images/' + imageInfo.fileName;
                      }
                 
                  delete itemObj._doc.itemRatings;
                  delete itemObj._doc.likes;
                  delete itemObj._doc.images;
                      
                   
              // })
               
               res.json({GetData: itemObj});
             }
         });
    // }
 });

 router.post('/AddToFavourite',function(req,res){
   
   var username=req.body.username
   var itemId=req.body.itemId
   var userfullname=req.body.userfullname
   var isLike=req.body.isLike
   var isFavorite=req.body.isFavorite

   var Itemschema=mongooseConnections[pdt].model('items',itemSchema);
        
            Itemschema.findOne({"itemId":itemId},{likes:1},function(error,FavoriteItem){

                if (error){
                    res.status(401).json(error);
                    throw error;
                    }
                    else {

                                    var likelength=FavoriteItem.likes.length==0?1:FavoriteItem.likes.length
                                    var forsave=0;
                                  
                           // Itemschema.findOne({"likes.username":{"$in" : [username]}},{"_id":1,"likes.username":username,"likes.userfullname":userfullname,"likes.isLike":isLike,"likes.isFavorite":isFavorite},function(error,FavoriteItem1){
                        Itemschema.findOne(  {"likes.username":username,"itemId":itemId},{"likes._id":1,"likes.username":1,"itemId":1,"likes.userfullname":1,"likes.isLike":1,"likes.isFavorite":1},function(error,FavoriteItem1){
                                          
                            if (error){
                                                res.status(401).json(error);
                                                throw error;
                                                }
                                                else if (FavoriteItem1 !=null){
                                                   var likeArray=[];
                                                    
                                                // var result = FavoriteItem1.likes.filter(function(e, i) {
                                                // return FavoriteItem1.likes[i].username == username
                                                // });

                                                   FavoriteItem1.likes.forEach(function(obj,i) {
                                                    if(  obj.username == username)
                                                        {
                                                         
                                                        }
                                                        else{
                                                            likeArray.push(obj);
                                                        }

                                                    });
 
                                                    
                                                 //   likeArray.likes[parseInt(likeArray.length)] = [];  
                                                    //  var  values 
                                                    likeArray[parseInt(likeArray.length)]= {
                                                                    "username" : username ,
                                                                    "userfullname" : userfullname,
                                                                    "isLike" : isLike,
                                                                    "isFavorite" :isFavorite
            
                                                        }
                                                Itemschema.updateMany({"likes.username":username,"itemId":itemId},{$set:{likes:likeArray}},{upsert:false,multi:false} ,function(error){
                                                        if (error){
                                                            res.status(401).json(error);
                                                            throw error;
                                                            }
                                                            else {
        
                                                                
                                                                res.status(200).json({GetData:{
                                                                    "username" : username ,
                                                                    "userfullname" : userfullname,
                                                                    "isLike" : isLike,
                                                                    "isFavorite" :isFavorite
            
                                                        }});
        
                                                            }
                                                       }
                                                    )

                                                  

                                                } 
                                                else if (FavoriteItem1 ==null){
                                             
                                                        FavoriteItem.likes[parseInt(likelength)] = [];  
                                                        //  var  values 
                                                            FavoriteItem.likes[parseInt(likelength)]= {
                                                                        "username" : username ,
                                                                        "userfullname" : userfullname,
                                                                        "isLike" : isLike,
                                                                        "isFavorite" :isFavorite
                
                                                            }
                                                        // FavoriteItem.likes[parseInt(likelength)].push(values);
                                                            FavoriteItem.save(function(error){
                                                                if (error){
                                                                    res.status(401).json(error);
                                                                    throw error;
                                                                    }
                                                                    else {
                
                                                                        
                                                                        res.status(200).json({GetData:FavoriteItem.likes[parseInt(likelength)]});
                
                                                                    }
                                                        })
                
                                     
                                      
                                                    
                                                }
                                        });
                                    
                        
                                }     
                                       
            });
                        
    
    });
   
    router.post('/AddToComments',function(req,res){
   
        var username=req.body.username
        var itemId=req.body.itemId
        var userfullname=req.body.userfullname
        var comment=req.body.comment
        var commentDate=new Date();
        
     
        var Itemschema=mongooseConnections[pdt].model('items',itemSchema);
             
                 Itemschema.findOne({"itemId":itemId},{comments:1},function(error,commentsItem){
     
                     if (error){
                         res.status(401).json(error);
                         throw error;
                         }
                         else {
                                    
                                var commentslength=commentsItem.comments.length==0?1:commentsItem.comments.length
                                Itemschema.findOne(  {"comments.username":username,"itemId":itemId},{"comments._id":1,"comments.username":1,"itemId":1,"comments.userfullname":1,"comments.comment":1,"comments.commentDate":1},function(error,commentsItem1){
                                               
                                 if (error){
                                                     res.status(401).json(error);
                                                     throw error;
                                                     }
                                                     else if (commentsItem1 !=null){
                                                        var commentArray=[];
                                                         
                                                    
                                                        commentsItem1.comments.forEach(function(obj,i) {
                                                         if(  obj.username == username)
                                                             {
                                                              
                                                             }
                                                             else{
                                                                commentArray.push(obj);
                                                             }
     
                                                         });
      
                                                 
                                                         commentArray[parseInt(commentArray.length)]= {
                                                                         "username" : username ,
                                                                         "userfullname" : userfullname,
                                                                         "comment" : comment,
                                                                         "commentDate" :commentDate
                 
                                                             }
                                                     Itemschema.updateMany({"comments.username":username,"itemId":itemId},{$set:{comments:commentArray}},{upsert:false,multi:false} ,function(error){
                                                             if (error){
                                                                 res.status(401).json(error);
                                                                 throw error;
                                                                 }
                                                                 else {
             
                                                                     
                                                                     res.status(200).json({GetData:{
                                                                         "username" : username ,
                                                                         "userfullname" : userfullname,
                                                                         "comment" : comment,
                                                                         "commentDate" :commentDate
                 
                                                             }});
             
                                                                 }
                                                            }
                                                         )
     
                                                       
     
                                                     } 
                                                     else if (commentsItem1 ==null){
                                                  
                                                        commentsItem.comments[parseInt(commentslength)] = [];  
                                                             commentsItem.comments[parseInt(commentslength)]= {
                                                                             "username" : username ,
                                                                             "userfullname" : userfullname,
                                                                             "comment" : comment,
                                                                             "commentDate" :commentDate
                     
                                                                 }
                                                         
                                                                 commentsItem.save(function(error){
                                                                     if (error){
                                                                         res.status(401).json(error);
                                                                         throw error;
                                                                         }
                                                                         else {
                     
                                                                             
                                                                             res.status(200).json({GetData:commentsItem.comments[parseInt(commentslength)]});
                     
                                                                         }
                                                             })
                     
                                          
                                           
                                                         
                                                     }
                                             });
                                         
                             
                                     }     
                                            
                 });
                             
         
         });
    router.post('/SendEmail',function(req,res){
    var userName=req.body.username;
    var Message=req.body.message;
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
        user: 'EPS.ezimax@gmail.com',
        pass: 'Ezimax@123'
        }
    });
    
    var mailOptions = {
        from: 'EPS.ezimax@gmail.com',
        to:   'ezifoodapp@gmail.com', //Ezi4949!@
        subject: userName,
        text:  Message,
        status:"Send Email to: ezifoodapp@gmail.com"
    };
    
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            res.status(401).json({GetData:error});
            throw    error+'\n API Name :- SendEmail';
            
        
        } else {
        console.log('Email sent: ' + info.response);
        res.status(200).json({GetData:mailOptions})
        }
    });
    });

/////////////////////////////////////// Start When Url is Not Match ////////////////////////////////////////////////////////////
// app.get('*',function(req,res){
//     res.status(401).json({GetData:"Url is Not Match ...!!!!"});
//     throw "Url is Not Match ...!!!!";
    
// });
// app.post('*',function(req,res){
//     res.status(401).json({GetData:"Url is Not Match ...!!!!"});
//     throw "Url is Not Match ...!!!!";
// });

router.use('', function (req, res, next) {
    // if (parseurl.original(req).pathname !== req.baseUrl) return next(); // skip this for strictness
    // res.send('hi');
   
         res.status(401).json({GetData:"Url is Not Match ...!!!!"});
        var error = new Error("Url is Not Match ...!!!!");
        logger.error(error);
  });
/////////////////////////////////////// End When Url is Not Match ////////////////////////////////////////////////////////////

//uncaughtException
/////////////////////////////////////// Start For Error Handling ////////////////////////////////////////////////////////
process.on("uncaughtException",function(error){
    logger.error(error);
    // res.status(401).json({GetData:error});
    //       throw    error+'\n API Name :- GetUpdateUserAddress';
});
process.on("exit",function(error){
    logger.error(error);
    // res.status(401).json({GetData:error});
    //       throw    error+'\n API Name :- GetUpdateUserAddress';
});
process.on("beforeExit",function(error){
    logger.error(error);
    // res.status(401).json({GetData:error});
    //       throw    error+'\n API Name :- GetUpdateUserAddress';
});
process.on("Signal Events",function(error){
    logger.error(error);
    // res.status(401).json({GetData:error});
    //       throw    error+'\n API Name :- GetUpdateUserAddress';
});

/////////////////////////////////////// End For Error Handling ////////////////////////////////////////////////////////////



  mongooseConnections[pdt] = mongoose.createConnection(config.mongodbUrl);
  mongoose.connect(config.mongodbUrl, { useNewUrlParser: true });
  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', function callback () {
    console.log("Database Thums Up!");
  });

  app.use('/api', router);
  app.use('/images',express.static(publicDir));
  app.use('/dashboardimages',express.static(publicDashDir));
  var port = process.env.PORT || 8091;
  app.listen(port);
console.log('Punjab d Tadka service running on port ' + port ) ; //+ ' in ' + process.env.NODE_ENV + ' mode');







