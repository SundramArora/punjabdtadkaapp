process.env.NODE_ENV = process.env.NODE_ENV || "development";

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var morgan = require('morgan');
var port = process.env.PORT || 8091;
var mongoose = require('mongoose');
var crypto = require('crypto');
var path = require('path');
var jwt = require('jsonwebtoken');
var tokenList = Object.create(null);

var config = require('./app/config/config');

var themesSchema = require('./app/models/themesSchema');

mongoose.Promise = global.Promise;

var mongooseConnections = {
    "pdt":mongoose.createConnection(config.sharedMongodbUrl)
};
var user = require('./app/models/userSchema');
var brandingAuth = require('./app/middleware/auth')(
    mongooseConnections['pdt'],
    user,
    config.secret
);
var requireBrandingAdmin = brandingAuth.requireRole('admin');
var User = mongooseConnections['pdt'].model('User', user);

app.use(morgan('dev'));
app.use(express.static(path.resolve(__dirname, 'public')));

app.use(bodyParser.urlencoded({
    extended: true,
    limit: '50mb'
}));

app.use(bodyParser.json({
    limit: '50mb'
}));
app.use(express.static(path.resolve(__dirname, 'branding')));


var Grid = require('gridfs-stream');
var gfs;
var multer = require('multer');
var logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: 5 * 1024 * 1024},
    fileFilter: function(req, file, callback) {
        callback(null, /^image\/(png|jpeg|webp)$/.test(file.mimetype));
    }
}).single('logo');

function errorHandler(err, req, res) {
    if (!res && req && typeof req.status === 'function') {
        res = req;
    }
    console.error(err);
    if (res && !res.headersSent) {
        res.status(500).json({message:'The branding request could not be completed.'});
    }
}

function replaceBrandingFile(store, filename, content, contentType, callback) {
    store.remove({filename:filename, root:'pdsbrandingFiles'}, function(removeErr) {
        if (removeErr) {
            return callback(removeErr);
        }

        var stream = store.createWriteStream({
            filename:filename,
            mode:'w',
            content_type:contentType,
            root:'pdsbrandingFiles'
        });
        stream.on('error', callback);
        stream.on('close', function() {
            callback(null);
        });
        stream.end(content);
    });
}

function copyBrandingProfile(store, profile, subdomain, response) {
    var files = [
        {source:'.css', target:'.css', type:'text/css'},
        {source:'.json', target:'.json', type:'application/json'},
        {source:'.png', target:'.png', type:'image/png'},
        {source:'bubble.png', target:'bubble.png', type:'image/png'}
    ];
    var index = 0;

    function copyNext() {
        if (index === files.length) {
            return response.send('Update complete');
        }
        var file = files[index++];
        store.readFile({filename:profile + file.source, root:'pdsbrandingFiles'}, function(readErr, data) {
            if (readErr) {
                return errorHandler(readErr, null, response);
            }
            replaceBrandingFile(store, subdomain + file.target, data, file.type, function(writeErr) {
                if (writeErr) {
                    return errorHandler(writeErr, null, response);
                }
                copyNext();
            });
        });
    }

    copyNext();
}

var router = express.Router();

// app.use(function (req, res, next) {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
//     //res.setHeader('Access-Control-Allow-Credentials', true);
//     var route = req.originalUrl.replace('/api/', '');
//     var index = route.indexOf('?');
//     route = route.substr(0, index);
//     if (whiteListRoutes.indexOf(req.originalUrl.replace('/api/', '')) > -1 || whiteListRoutes.indexOf(route) > -1) {
//         next();
//     }
    
//     else {
//         next();
//     }
// });


router.route('/uploadLogo').post(brandingAuth.authenticate, requireBrandingAdmin, function(req, res, next) {
    logoUpload(req, res, function(uploadErr) {
        if (uploadErr) {
            return res.status(400).json({message:'Logo must be a PNG, JPEG, or WebP image smaller than 5 MB.'});
        }
        if (!req.file) {
            return res.status(400).json({message:'A logo image is required in the logo field.'});
        }

        var connection = mongooseConnections.pdt;
        if (connection.readyState !== 1 || !connection.db) {
            return res.status(503).json({message:'Branding storage is unavailable.'});
        }

        var extension = {'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp'}[req.file.mimetype];
        var filename = crypto.randomBytes(16).toString('hex') + '.' + extension;
        gfs = Grid(connection.db, mongoose.mongo);
        var writestream = gfs.createWriteStream({
            filename:filename,
            mode:'w',
            content_type:req.file.mimetype,
            root:'pdsbrandingFiles'
        });
        writestream.on('error', function(err) {
            errorHandler(err, req, res);
        });
        writestream.on('close', function() {
            res.status(201).json({filename:filename});
        });
        writestream.end(req.file.buffer);
    });
});


router.route('/getBase64StringLogo')
    .get(function (req, res, next) {
        var filename = req.query.filename;
        if (typeof filename !== 'string' || !/^[A-Za-z0-9_-]{1,128}\.(png|jpe?g|webp)$/.test(filename)) {
            return res.status(400).json({message:'Invalid logo filename.'});
        }
        var connection = mongooseConnections.pdt;
        if (connection.readyState !== 1 || !connection.db) {
            return res.status(503).json({message:'Branding storage is unavailable.'});
        }
        gfs = Grid(connection.db, mongoose.mongo);
        var readstream = gfs.createReadStream({
            filename: filename,
            root: "pdsbrandingFiles"
        });
        var bufs = [];
        readstream.on('error', function(err) {
            if (!res.headersSent) {
                res.status(404).json({message:'Logo was not found.'});
            }
        });
        readstream.on('data', function (chunk) {
            bufs.push(chunk);
        });
        readstream.on('end', function () {
            var fbuf = Buffer.concat(bufs);
            res.send(fbuf.toString('base64'));
        });
    });
router.route('/saveBranding')
    .post(brandingAuth.authenticate, requireBrandingAdmin, function (req, res, next) {
        var branding = req.body.branding;
        var variables = req.body.variables;
        var subdomain = req.body.subdomain;
        if (typeof subdomain !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(subdomain)) {
            return res.status(400).json({ message: 'Invalid subdomain.' });
        }
        if (typeof branding !== 'string' || typeof variables !== 'string') {
            return res.status(400).json({ message: 'Branding CSS and variables are required.' });
        }
        if (Buffer.byteLength(branding, 'utf8') > 1024 * 1024 ||
            Buffer.byteLength(variables, 'utf8') > 1024 * 1024) {
            return res.status(413).json({message:'Branding data must be smaller than 1 MB per file.'});
        }

        var serializedVariables;
        try {
            serializedVariables = JSON.stringify(JSON.parse(variables));
        } catch (parseErr) {
            return res.status(400).json({message:'Branding variables must be valid JSON.'});
        }

        var connection = mongooseConnections.pdt;
        if (connection.readyState !== 1 || !connection.db) {
            return res.status(503).json({message:'Branding storage is unavailable.'});
        }
        var store = Grid(connection.db, mongoose.mongo);
        replaceBrandingFile(store, subdomain + '.css', branding, 'text/css', function(cssErr) {
            if (cssErr) {
                return errorHandler(cssErr, req, res);
            }
            replaceBrandingFile(store, subdomain + '.json', serializedVariables, 'application/json', function(jsonErr) {
                if (jsonErr) {
                    return errorHandler(jsonErr, req, res);
                }
                res.send('Upload complete');
            });
        });
    });

router.route("/getBrandingThemes")
    .get(function (req, res, next) {
        var br = mongooseConnections['pdt'];
        var themes = br.model('themes', themesSchema);

        themes.find({}, function(err, themes) {
            if (err) {
                errorHandler(err, res, res);
            }
            else {
                res.send(themes);
            }
        });
    });


router.route("/getBrandingFiles")
    .get(function (req, res, next) {
        var filename = req.query.filename;
        if (typeof filename !== 'string' || !/^[A-Za-z0-9_-]{1,128}\.(css|json|png|jpe?g|webp)$/.test(filename)) {
            return res.status(400).json({message:'Invalid branding filename.'});
        }
        var connection = mongooseConnections.pdt;
        if (connection.readyState !== 1 || !connection.db) {
            return res.status(503).json({message:'Branding storage is unavailable.'});
        }
        gfs = Grid(connection.db, mongoose.mongo);
        var readstream = gfs.createReadStream({
            filename:filename,
            root:"pdsbrandingFiles"
        });
        readstream.on('error', function() {
            if (!res.headersSent) {
                res.status(404).json({message:'Branding file was not found.'});
            }
        });
        readstream.pipe(res);
    });



router.route('/loadProfile')
    .get(brandingAuth.authenticate, requireBrandingAdmin, function (req, res, next) {
        var profile = req.query.profile;
        var subdomain = req.query.subdomain;
        if (typeof profile !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(profile) ||
            typeof subdomain !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(subdomain)) {
            return res.status(400).json({ message: 'Invalid profile or subdomain.' });
        }
        var connection = mongooseConnections.pdt;
        if (connection.readyState !== 1 || !connection.db) {
            return res.status(503).json({message:'Branding storage is unavailable.'});
        }
        copyBrandingProfile(Grid(connection.db, mongoose.mongo), profile, subdomain, res);
    });




router.route('/loadProfiledev')
    .get(brandingAuth.authenticate, requireBrandingAdmin, function(req, res) {
        return res.status(501).json({message:'Development branding profiles are not configured.'});
    });


//
// router.route('/loadProfile')
//     .post(function (req, res, next) {
//         var profile = req.body.profile;
//         var subdomain = req.body.subdomain;
//         var db = mongooseConnections['pdsBranding'].db;
//         gfs = Grid(db,mongoose.mongo);
//         gfs.readFile({ filename: profile + '.css', root: "pdsbrandingFiles" }, function (err, data) {
//             gfs.remove({ filename: subdomain + '.css', root: "pdsbrandingFiles" }, function (e) {
//                 gfs.writeFile({ filename: subdomain + '.css', root: "pdsbrandingFiles" }, data, function (e, result) {
//                     gfs.readFile({ filename: profile + '.json', root: "pdsbrandingFiles" }, function (err, data) {
//                         gfs.remove({ filename: subdomain + '.json', root: "pdsbrandingFiles" }, function (e) {
//                             gfs.writeFile({ filename: subdomain + '.json', root: "pdsbrandingFiles" }, data, function (e, result) {
//                                 gfs.readFile({ filename: profile + '.png', root: "pdsbrandingFiles" }, function (err, data) {
//                                     gfs.remove({ filename: subdomain + '.png', root: "pdsbrandingFiles" }, function (e) {
//                                         gfs.writeFile({ filename: subdomain + '.png', root: "pdsbrandingFiles" }, data, function (e, result) {
//                                             gfs.readFile({ filename: profile + 'bubble.png', root: "pdsbrandingFiles" }, function (err, data) {
//                                                 gfs.remove({ filename: subdomain + 'bubble.png', root: "pdsbrandingFiles" }, function (e) {
//                                                     gfs.writeFile({ filename: subdomain + 'bubble.png', root: "pdsbrandingFiles" }, data, function (e, result) {
//                                                         res.send('Update complete');
//                                                     })
//                                                 });
//                                             });
//                                         })
//                                     });
//                                 });
//                             })
//                         });
//                     });
//                 })
//             });
//         });
//     });

app.use('/api', router);



router.get('/', (req,res) => {
    res.send('Ok');
})

router.post('/login', (req,res) => {
    var postData = req.body || {};
    if (typeof postData.username !== 'string' || !postData.username.trim() ||
        typeof postData.password !== 'string' || !postData.password) {
        return res.status(400).json({message:'Username and password are required.'});
    }

    User.findOne(
        {username:postData.username},
        'username email name roles UserId isOtpVerified hash salt passwordIterations +password',
        function(err, account) {
            if (err) {
                return res.status(500).json({message:'Unable to authenticate user.'});
            }
            if (!account) {
                return res.status(401).json({message:'Invalid username or password.'});
            }

            brandingAuth.verifyPassword(account, postData.password, function(verifyErr, valid) {
                if (verifyErr) {
                    return res.status(500).json({message:'Unable to authenticate user.'});
                }
                if (!valid) {
                    return res.status(401).json({message:'Invalid username or password.'});
                }

                var token = account.generateJwt();
                var refreshToken = jwt.sign(
                    {_id:account._id.toString()},
                    config.refreshTokenSecret,
                    {expiresIn:config.refreshTokenLife, algorithm:'HS256'}
                );
                tokenList[refreshToken] = account._id.toString();
                account.set('password', undefined);
                account.set('salt', undefined);
                account.set('hash', undefined);
                account.set('passwordIterations', undefined);
                res.status(200).json({status:'Logged in', token:token, refreshToken:refreshToken, user:account});
            });
        }
    );
});

router.post('/token', function(req, res) {
    var refreshToken = req.body && req.body.refreshToken;
    if (!refreshToken || !Object.prototype.hasOwnProperty.call(tokenList, refreshToken)) {
        return res.status(401).send('Invalid refresh token.');
    }

    jwt.verify(refreshToken, config.refreshTokenSecret, {algorithms:['HS256']}, function(err, decoded) {
        var userId = decoded && (decoded.id || decoded._id);
        if (err || !userId || tokenList[refreshToken] !== userId) {
            delete tokenList[refreshToken];
            return res.status(401).send('Invalid refresh token.');
        }

        User.findById(userId, function(userErr, account) {
            if (userErr) {
                return res.status(500).json({message:'Unable to refresh session.'});
            }
            if (!account) {
                delete tokenList[refreshToken];
                return res.status(401).send('Invalid refresh token.');
            }
            res.status(200).json({token:account.generateJwt()});
        });
    });
});

router.use(require('./tokenChecker'));

router.get('/secure', (req,res) => {
    res.send('I am secured...')
})

  router.get('/me', function(req, res) {
    res.status(200).send(req.decoded);
  });

app.listen(port);
console.log('Punjab d Tadka service running on port ' + port + ' in ' + process.env.NODE_ENV + ' mode');
mongooseConnections.pdt.on('error', function(err) {
    console.error('Branding database connection error:', err);
});
mongooseConnections.pdt.once('open', function() {
    console.log('Branding database connection established.');
});
