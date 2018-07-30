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
var pdt="pdt";
var jwtOptions = {}
//jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeader();
jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
jwtOptions.secretOrKey = 'ezifoodspdt';

var strategy = new JwtStrategy(jwtOptions, function(jwt_payload, next) {
  console.log('payload received', jwt_payload);
  // usually this would be a database call:
  var user =  user.findOne({id: jwt_payload.id});
  if (user) {
    next(null, user);
  } else {
    next(null, false);
  }
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

var config = require('./app/config/config');
var userSchema = require('./app/models/userSchema');
var usersSchema = require('./app/models/usersSchema');

mongoose.Promise = global.Promise;
var mongooseConnections = {
    pdt :mongoose.createConnection(config.mongodbUrl)
};

app.get("/", function(req, res) {
  res.json({message: "PDT Server is up!"});
});

var router = express.Router();

router.post("/login", function(req, res) {
    if(req.body.username && req.body.password){
      var username = req.body.username;
      var password = req.body.password;
   
    console.log(username);
    console.log(password);
    // usually this would be a database call:
    //var Users = mongooseConnections[pdt].model('staff', UserSchema);
    var Users = mongooseConnections[pdt].model('User', userSchema);
  var user;
  Users.findOne({'username':username,'password': password}, 'username email firstName lastName roles', function(err,user)
    {
        if(err)
        {
        res.status(401).json({message:"no such user found"});        
        }
        if(user==null)
        {
            res.status(401).json({message:"User" + username + " and Password doesn't exist!"});
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
  mongooseConnections[pdt] = mongoose.createConnection(config.mongodbUrl);
  mongoose.connect(config.mongodbUrl);
  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', function callback () {
    console.log("h");
  });

  app.use('/api', router);

  var port = process.env.PORT || 8091;
  app.listen(port);
console.log('Punjab d Tadka service running on port ' + port ) ; //+ ' in ' + process.env.NODE_ENV + ' mode');







