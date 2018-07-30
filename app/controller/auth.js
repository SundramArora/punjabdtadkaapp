
var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
const jwt = require('jsonwebtoken')
var bcrypt = require('bcryptjs');
const config = require('./config')
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../user/User');

router.post('/register', function(req, res) {
  
  var hashedPassword = bcrypt.hashSync(req.body.password, 8);
  
  User.create({
    name : req.body.name,
    email : req.body.email,
    password : hashedPassword
  },
  function (err, user) {
    if (err) return res.status(500).send("There was a problem registering the user.")
    // create a token
    var token = jwt.sign({ id: user._id }, config.secret, {
      expiresIn: 86400 // expires in 24 hours
    });
    res.status(200).send({ auth: true, token: token });
  }); 
});


router.get('/me', function(req, res) {
  var token = req.headers['x-access-token'];
  if (!token) return res.status(401).send({ auth: false, message: 'No token provided.' });
  
  jwt.verify(token, config.secret, function(err, decoded) {
    if (err) return res.status(500).send({ auth: false, message: 'Failed to authenticate token.' });
    
    res.status(200).send(decoded);
  });
});

module.exports = router;


// module.exports = (req,res,next) => {
//   const token = req.body.token || req.query.token || req.headers['x-access-token']
//   // decode token
//   if (token) {
//     // verifies secret and checks exp
//     jwt.verify(token, config.secret, function(err, decoded) {
//         if (err) {
//             return res.status(401).json({"error": true, "message": 'Unauthorized access.' });
//         }
//       req.decoded = decoded;
//       next();
//     });
//   } else {
//     // if there is no token
//     // return an error
//     return res.status(403).send({
//         "error": true,
//         "message": 'No token provided.'
//     });
//   }
// }