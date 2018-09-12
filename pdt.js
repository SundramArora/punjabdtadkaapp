process.env.NODE_ENV = process.env.NODE_ENV || "development";
var _ = require("lodash");
var express = require("express");
var bodyParser = require("body-parser");
var jwt = require('jsonwebtoken');
var mongoose = require('mongoose');
var passport = require("passport");
var passportJWT = require("passport-jwt");

var ExtractJwt = passportJWT.ExtractJwt;
var JwtStrategy = passportJWT.Strategy;
var crypto = require('crypto');
var pdt="pdt";
var jwtOptions = {}
//jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeader();


var config = require('./app/config/config');
var userSchema = require('./app/models/userSchema');
var companySchema = require('./app/models/companySchema');
var branchSchema = require('./app/models/branchSchema');
var categorySchema = require('./app/models/categorySchema');
var subcategorySchema = require('./app/models/subCategorySchema');
var itemSchema = require('./app/models/itemSchema');
var itemCartSchema = require('./app/models/itemCartSchema');
var itemCartDetailsSchema = require('./app/models/itemCartDetailsSchema');
//var usersSchema = require('./app/models/usersSchema');
var dashboardSchema = require('./app/models/dashboardSchema');

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
    var user = new User();
   
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
            var token;
            token = user.generateJwt();
            res.status(200); 
            user.password = undefined;    
            res.json({message: user, token: token});       
        }
    });
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
  Users.findOne({'username':username,'password': password}, 'username email name roles', function(err,user)
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

router.get("/getDashboard",function(req,res) {
var  dashboard = mongooseConnections[pdt].model('dashboard', dashboardSchema);
dashboard.find(function(err,items)
        {
            if(err)
            {
            res.status(401).json({message:"no such Dashboard found"});        
            }
            else 
            { 
                res.json({message: items});
            }
        });

} );

function getNextSequenceValue(sequenceName){
  var sequenceDocument = db.counters.findAndModify({
  query:{_id: sequenceName },
  update: {$inc:{sequence_value:1}},
  new:true
    });
return sequenceDocument.sequence_value;
}

router.post("/addToCart", function(req, res) {
  var ItemCart = mongooseConnections[pdt].model('ItemCart', itemCartSchema);

  // if(req.body.name==null)
  // {
  //   req.body =  JSON.stringify(req.body);
  // }
  // if(req.body.name)
  // {
      
      var item = new ItemCart();
      item.itemCartId = getNextSequenceValue("itemCartId");
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

  //}
});


  mongooseConnections[pdt] = mongoose.createConnection(config.mongodbUrl);
  mongoose.connect(config.mongodbUrl);
  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', function callback () {
    console.log("Database Thums Up!");
  });

  app.use('/api', router);

  var port = process.env.PORT || 8091;
  app.listen(port);
console.log('Punjab d Tadka service running on port ' + port ) ; //+ ' in ' + process.env.NODE_ENV + ' mode');







