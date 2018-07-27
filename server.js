process.env.NODE_ENV = process.env.NODE_ENV || "development";

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var async = require('async');
var fs = require('fs');
var morgan = require('morgan');
var port = process.env.PORT || 8091;
var mongoose = require('mongoose');
const jwt = require('jsonwebtoken')
const tokenList = {}
var passport          =     require('passport')
var session           =     require('express-session')
var FacebookStrategy  =     require('passport-facebook').Strategy

var config = require('./app/config/config');

var themesSchema = require('./app/models/themesSchema');

mongoose.Promise = global.Promise;

var mongooseConnections = {
    "shared":mongoose.createConnection(config.sharedMongodbUrl)
};
var clientSchema = require('./app/models/clientSchema');
var user = require('./app/models/userSchema');

var client = mongooseConnections["shared"].model('client', clientSchema);

app.use(bodyParser.urlencoded({
    extended: true,
    limit: '50mb'
}));

app.use(bodyParser.json({
    limit: '50mb'
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/branding'));

var whiteListRoutes = ['getBrandingFiles', '/api', '/favicon.ico','checkEmail','sendChangePasswordLink','checkPasswordRequest','updatePassword', 'scanLogin'];


var Grid = require('gridfs-stream');
var gridfs = require('gridfs');
var gfs;
var path = require('path');
//var dateFormat = require('dateformat');
var ObjectId = require('mongodb').ObjectID;

var router = express.Router();

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    //res.setHeader('Access-Control-Allow-Credentials', true);
    var route = req.originalUrl.replace('/api/', '');
    var index = route.indexOf('?');
    route = route.substr(0, index);
    if (whiteListRoutes.indexOf(req.originalUrl.replace('/api/', '')) > -1 || whiteListRoutes.indexOf(route) > -1) {
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
    //                 req.body.clientId = data.clientId;
    //                 req.body.sessionId = data.sessionId;
    //                 next();
    //             }
    //         });
    //     }
    //     else res.sendStatus(403);
    // }
    // else if (req.method === 'GET') {
    //     var token = req.query.token;
    //     if (token === null || token === undefined) {
    //         res.sendStatus(403);
    //     }
    //     else {
    //         jwt.verify(token, config.sessionSecret, function(err, data) {
    //             if (err) {
    //                 res.sendStatus(403);
    //             }
    //             else {
    //                 req.body.clientId = data.clientId;
    //                 req.body.sessionId = data.sessionId;
    //                 next();
    //             }
    //         });
    //     }
    // }
    else {
        next();
    }
});


app.use(session({ secret: 'keyboardcat', key: 'sid'}));
app.use(passport.initialize());
app.use(passport.session());


var multer = require('multer');


router.route('/uploadLogo').post(function (req, res) {
    var db = mongooseConnections[req.body.clientId].db;
    gfs = Grid(db,mongoose.mongo);
    uploadImage(req, res, function (err) {
        if (err) {
            { return errorHandler(err, req, res); }
        }
        else {
            gfs.remove({ filename: req.file.filename, root: "pdsbrandingFiles" }, function (e) {
                if (e) return errorHandler(e, req, res);
                else {
                    var path = "./uploads/" + req.file.filename;
                    var writestream = gfs.createWriteStream({
                        filename: req.file.filename,
                        mode: 'w',
                        metadata: {
                            filename: req.file.filename
                        },
                        root: "pdsbrandingFiles"
                    });
                    fs.createReadStream(path).pipe(writestream);
                    writestream.on('error', function (err) {
                        errorHandler(err, req, res)
                    });
                    writestream.on('close', function (file) {
                        res.send('Upload complete');
                    });
                }
            });
        }
    })
});


router.route('/getBase64StringLogo')
    .get(function (req, res, next) {
        var db = mongooseConnections[req.body.clientId].db;
        gfs = Grid(db,mongoose.mongo);
        var readstream = gfs.createReadStream({
            filename: req.query.filename,
            root: "pdsbrandingFiles"
        });
        var bufs = [];
        readstream.on('data', function (chunk) {
            bufs.push(chunk);
        });
        readstream.on('end', function () {
            var fbuf = Buffer.concat(bufs);
            res.send(fbuf.toString('base64'));
        });
    });
router.route('/saveBranding')
    .post(function (req, res, next) {
        var branding = req.body.branding;
        var variables = req.body.variables;
        var subdomain = req.body.subdomain;
        var db = mongooseConnections['pdsBranding'].db;
        gfs = Grid(db,mongoose.mongo);
        fs.writeFile('./uploads/' + subdomain + '.css', branding, function (err) {
            if (err) errorHandler(err, req, res)
            else {
                gfs.remove({ filename: subdomain + '.css', root: "pdsbrandingFiles" }, function (e) {
                    if (e) return errorHandler(e, req, res);
                    else {
                        var pathCss = "./uploads/" + subdomain + '.css';
                        var writestream = gfs.createWriteStream({
                            filename: subdomain + '.css',
                            mode: 'w',
                            metadata: {
                                filename: subdomain + '.css'
                            },
                            root: "pdsbrandingFiles"
                        });
                        fs.createReadStream(pathCss).pipe(writestream);
                        writestream.on('error', function (err) {
                            errorHandler(err, req, res)
                        });
                    }
                });
                fs.writeFile('./uploads/' + subdomain + '.json', variables, function (e) {
                    if (e) errorHandler(e, req, res)
                    else {
                        gfs.remove({ filename: subdomain + '.json', root: "pdsbrandingFiles" }, function (e) {
                            if (e) return errorHandler(e, req, res);
                            else {
                                var pathForJson = "./uploads/" + subdomain + '.json';
                                var writestream = gfs.createWriteStream({
                                    filename: subdomain + '.json',
                                    mode: 'w',
                                    metadata: {
                                        filename: subdomain + '.json'
                                    },
                                    root: "pdsbrandingFiles"
                                });
                                fs.createReadStream(pathForJson).pipe(writestream);
                                writestream.on('error', function (err) {
                                    errorHandler(err, req, res)
                                });
                                writestream.on('close', function (file) {
                                    res.send('Upload complete');
                                });
                            }
                        });
                    }
                });
            }
        });
    });

router.route("/getBrandingThemes")
    .get(function (req, res, next) {
        var br = mongooseConnections['pdsBranding'];
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
        var clientId;
        if (req.query.cId !== null) {
            clientId = req.query.cId;
        }
        else if (req.body.clientId !== null) {
            clientId = req.body.clientId;
        }
        if (clientId === null) {
            res.sendStatus(403);
        }
        else {
            var db = mongooseConnections['pdsBranding'].db;
            gfs = Grid(db, mongoose.mongo);
            var readstream = gfs.createReadStream({
                filename: req.query.filename,
                root: "pdsbrandingFiles"
            });
            readstream.on('error', function (err) {
                res.send('file does not exist');
            });
            readstream.pipe(res);
        }
    });



router.route('/loadProfile')
    .get(function (req, res, next) {
        var profile = req.query.profile;
        var subdomain = req.query.subdomain;
        var db = mongooseConnections['pdsBranding'].db;
        gfs = Grid(db,mongoose.mongo);
        gfs.readFile({ filename: profile + '.css', root: "pdsbrandingFiles" }, function (err, data) {
            gfs.remove({ filename: subdomain + '.css', root: "pdsbrandingFiles" }, function (e) {
                gfs.writeFile({ filename: subdomain + '.css', root: "pdsbrandingFiles" }, data, function (e, result) {
                    gfs.readFile({ filename: profile + '.json', root: "pdsbrandingFiles" }, function (err, data) {
                        gfs.remove({ filename: subdomain + '.json', root: "pdsbrandingFiles" }, function (e) {
                            gfs.writeFile({ filename: subdomain + '.json', root: "pdsbrandingFiles" }, data, function (e, result) {
                                gfs.readFile({ filename: profile + '.png', root: "pdsbrandingFiles" }, function (err, data) {
                                    gfs.remove({ filename: subdomain + '.png', root: "pdsbrandingFiles" }, function (e) {
                                        gfs.writeFile({ filename: subdomain + '.png', root: "pdsbrandingFiles" }, data, function (e, result) {
                                            gfs.readFile({ filename: profile + 'bubble.png', root: "pdsbrandingFiles" }, function (err, data) {
                                                gfs.remove({ filename: subdomain + 'bubble.png', root: "pdsbrandingFiles" }, function (e) {
                                                    gfs.writeFile({ filename: subdomain + 'bubble.png', root: "pdsbrandingFiles" }, data, function (e, result) {
                                                        res.send('Update complete');
                                                    })
                                                });
                                            });
                                        })
                                    });
                                });
                            })
                        });
                    });
                })
            });
        });
    });




router.route('/loadProfiledev')
    .get(function (req, res, next) {
        var profile = req.query.profile;
        var subdomain = req.query.subdomain;
        var db = mongooseConnections['inciteDev'].db;
        gfs = Grid(db,mongoose.mongo);
        gfs.readFile({ filename: profile + '.css', root: "brandingFiles" }, function (err, data) {
            gfs.remove({ filename: subdomain + '.css', root: "brandingFiles" }, function (e) {
                gfs.writeFile({ filename: subdomain + '.css', root: "brandingFiles" }, data, function (e, result) {
                    gfs.readFile({ filename: profile + '.json', root: "brandingFiles" }, function (err, data) {
                        gfs.remove({ filename: subdomain + '.json', root: "brandingFiles" }, function (e) {
                            gfs.writeFile({ filename: subdomain + '.json', root: "brandingFiles" }, data, function (e, result) {
                                gfs.readFile({ filename: profile + '.png', root: "brandingFiles" }, function (err, data) {
                                    gfs.remove({ filename: subdomain + '.png', root: "brandingFiles" }, function (e) {
                                        gfs.writeFile({ filename: subdomain + '.png', root: "brandingFiles" }, data, function (e, result) {
                                            gfs.readFile({ filename: profile + 'bubble.png', root: "brandingFiles" }, function (err, data) {
                                                gfs.remove({ filename: subdomain + 'bubble.png', root: "brandingFiles" }, function (e) {
                                                    gfs.writeFile({ filename: subdomain + 'bubble.png', root: "brandingFiles" }, data, function (e, result) {
                                                        res.send('Update complete');
                                                    })
                                                });
                                            });
                                        })
                                    });
                                });
                            })
                        });
                    });
                })
            });
        });
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
    const postData = req.body;
    const user = {
        "email": postData.email,
        "name": postData.name
    }
    // do the database authentication here, with user name and password combination.
    const token = jwt.sign(user, config.secret, { expiresIn: config.tokenLife})
    const refreshToken = jwt.sign(user, config.refreshTokenSecret, { expiresIn: config.refreshTokenLife})
    const response = {
        "status": "Logged in",
        "token": token,
        "refreshToken": refreshToken,
    }
    tokenList[refreshToken] = response
    res.status(200).json(response);
})

router.post('/token', (req,res) => {
    // refresh the damn token
    const postData = req.body
    // if refresh token exists
    if((postData.refreshToken) && (postData.refreshToken in tokenList)) {
        const user = {
            "email": postData.email,
            "name": postData.name
        }
        const token = jwt.sign(user, config.secret, { expiresIn: config.tokenLife})
        const response = {
            "token": token,
        }
        // update the token in the list
        tokenList[postData.refreshToken].token = token
        res.status(200).json(response);        
    } else {
        res.status(404).send('Invalid request')
    }
})

router.use(require('./tokenChecker'))

router.get('/secure', (req,res) => {
    // all secured routes goes here
    res.send('I am secured...')
})



passport.use(new FacebookStrategy({
    clientID: config.facebook_api_key,
    clientSecret: config.facebook_api_secret,
    callbackURL: config.callback_url,
    enableProof : config.enableProof,
    profileFields: ['id', 'displayName', 'photos', 'email']
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

//Passport Router
router.get('/auth/facebook', passport.authenticate('facebook'));
router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { 
       successRedirect : '/', 
       failureRedirect: '/login' 
  }),
  function(req, res) {
    res.redirect('/');
  });
router.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}



if (process.env.NODE_ENV != 'development') {
    app.use(rollbar.errorHandler());
}

app.listen(port);
console.log('Punjab d Tadka service running on port ' + port + ' in ' + process.env.NODE_ENV + ' mode');
mongooseConnections["pdsBranding"] = mongoose.createConnection(config.mongodbUrl);