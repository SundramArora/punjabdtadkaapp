var jwt = require('jsonwebtoken');
var mongoose = require('mongoose');

module.exports = function(connection, userSchema, secret) {
  var User = connection.model('User', userSchema);

  function authenticate(req, res, next) {
    var authorization = req.headers.authorization;
    var token = req.headers['x-access-token'];

    if (!token && authorization) {
      var parts = authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    jwt.verify(token, secret, { algorithms: ['HS256'] }, function(err, decoded) {
      if (err) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
      }

      var id = decoded && (decoded.id || decoded._id);
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(401).json({ message: 'Invalid authentication token.' });
      }

      User.findById(id, 'username UserId name roles', function(userErr, user) {
        if (userErr) {
          return next(userErr);
        }
        if (!user || !user.username ||
            !Number.isSafeInteger(user.UserId) || user.UserId <= 0) {
          return res.status(401).json({ message: 'Account is not eligible for authentication.' });
        }

        req.authUser = user;
        next();
      });
    });
  }

  function requireRole(role) {
    return function(req, res, next) {
      var roles = req.authUser && req.authUser.roles;
      var authorized = Array.isArray(roles) && roles.some(function(entry) {
        return entry && entry.role === role;
      });

      if (!authorized) {
        return res.status(403).json({ message: 'Insufficient permissions.' });
      }

      next();
    };
  }

  function verifyPassword(user, password, callback) {
    function savePasswordChanges() {
      user.set('password', undefined);
      user.save(function(err) {
        callback(err, !err);
      });
    }

    function upgradeHash() {
      var needsRehash = !user.hash || !user.salt || user.passwordIterations !== 310000;
      if (needsRehash) {
        return user.setPassword(password, function(err) {
          if (err) {
            return callback(err, false);
          }
          savePasswordChanges();
        });
      }
      if (user.password !== undefined) {
        return savePasswordChanges();
      }
      callback(null, true);
    }

    if (user.hash && user.salt) {
      return user.validPassword(password, function(err, matches) {
        if (err || !matches) {
          return callback(err, false);
        }
        upgradeHash();
      });
    }

    if (user.password !== password) {
      return callback(null, false);
    }
    upgradeHash();
  }

  return {
    authenticate: authenticate,
    requireRole: requireRole,
    verifyPassword: verifyPassword
  };
};
