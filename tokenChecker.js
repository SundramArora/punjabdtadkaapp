var jwt = require('jsonwebtoken');
var config = require('./app/config/config');

module.exports = function(req, res, next) {
  var authorization = req.headers.authorization;
  var token = req.headers['x-access-token'];

  if (!token && authorization) {
    var parts = authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({error:true, message:'Authentication required.'});
  }

  jwt.verify(token, config.secret, {algorithms:['HS256']}, function(err, decoded) {
    if (err) {
      return res.status(401).json({error:true, message:'Invalid or expired token.'});
    }
    req.decoded = decoded;
    next();
  });
};
