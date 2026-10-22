process.env.NODE_ENV = process.env.NODE_ENV || "development";
var _ = require("lodash");
var express = require("express");
var bodyParser = require("body-parser");
var mongoose = require('mongoose');
var publicDir = require('path').join(__dirname,'/images/').replace(/\\/g, "/");
var publicDashDir = require('path').join(__dirname,'/dashboardimages/').replace(/\\/g, "/");
var request = require('request');
var nodemailer = require('nodemailer');
var pricing = require('./app/services/pricing');
var checkout = require('./app/services/checkout');
var razorpay = require('./app/services/razorpay');
var orderState = require('./app/services/order-state');

var findRemoveSync = require('find-remove')
// var logger = require('E:/Github/punjabdtadkaapp/logger').Logger;
var logger = require(__dirname+'/logger').Logger;
var crypto = require('crypto');
var base64ToImage = require('base64-to-image');
var fs = require('fs');
var pdt="pdt";
var dateFormat = require('dateformat');


var config = require('./app/config/config');
var userSchema = require('./app/models/userSchema');
var OTPSchema = require('./app/models/OTPSchema');
var WalletBalanceSchema = require('./app/models/WalletBalanceSchema');
var WalletTransactionSchema = require('./app/models/WalletTransactionSchema');
var RazorpayEventSchema = require('./app/models/RazorpayEventSchema');

var companySchema = require('./app/models/companySchema');
var branchSchema = require('./app/models/branchSchema');
var categorySchema = require('./app/models/categorySchema');
var subcategorySchema = require('./app/models/subCategorySchema');
var itemSchema = require('./app/models/itemSchema');
var itemCartSchema = require('./app/models/itemCartSchema');
//var usersSchema = require('./app/models/usersSchema');
var dashboardSchema = require('./app/models/dashboardSchema');
var addressSchema =require('./app/models/addressSchema');
var itemOrderSchema =require('./app/models/itemOrderSchema');
var notificationSchema=require('./app/models/notificationSchema');
var RestaurantofferSchema=require('./app/models/RestaurantofferSchema');
var PaymentofferSchema=require('./app/models/PaymentofferSchema');

var app = express();





// parse application/x-www-form-urlencoded
// for easier testing with Postman or plain HTML forms
app.use(bodyParser.urlencoded({
  extended: true
}));

// parse application/json
app.use(bodyParser.json({
  verify:function(req, res, buffer) {
    if (req.originalUrl === '/api/payments/razorpay/webhook') {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));


mongoose.Promise = global.Promise;
var mongooseConnections = {
    pdt :mongoose.createConnection(config.mongodbUrl)
};
var authentication = require('./app/middleware/auth')(
  mongooseConnections[pdt],
  userSchema,
  config.secret
);
var requireAuthenticatedUser = authentication.authenticate;
var requireAdmin = authentication.requireRole('admin');

function orderLinesFromBody(body) {
  if (Array.isArray(body && body.items)) {
    return body.items;
  }
  if (Array.isArray(body && body.lines)) {
    return body.lines;
  }
  if (body && body.itemDetails && Array.isArray(body.itemDetails.values)) {
    return body.itemDetails.values;
  }
  return null;
}

function buildQuote(lines, callback, couponCode) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return callback(new pricing.PricingError('At least one item is required.'));
  }

  var itemIds = [];
  for (var i = 0; i < lines.length; i++) {
    var id = Number(lines[i] && lines[i].itemId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return callback(new pricing.PricingError('Every item must have a valid itemId.'));
    }
    itemIds.push(id);
  }

  var Item = mongooseConnections[pdt].model('Item', itemSchema);
  Item.find({itemId:{$in:itemIds}}).lean().exec(function(err, menuItems) {
    if (err) {
      return callback(err);
    }
    try {
      callback(null, pricing.quoteOrder(lines, menuItems, couponCode));
    } catch (quoteErr) {
      callback(quoteErr);
    }
  });
}

function buildQuoteFromRequest(req, callback) {
  var cartId = req.body && req.body.cartId;
  if (!cartId) {
    var requestBody = req.body || {};
    return buildQuote(
      orderLinesFromBody(requestBody),
      callback,
      requestBody.couponCode || requestBody.couponApplied
    );
  }
  if (!mongoose.Types.ObjectId.isValid(cartId)) {
    return callback(new pricing.PricingError('A valid cartId is required.'));
  }

  var ItemCart = mongooseConnections[pdt].model('ItemCart', itemCartSchema);
  ItemCart.findOne({_id:cartId, userId:req.authUser.UserId}, function(err, cart) {
    if (err) {
      return callback(err);
    }
    if (!cart) {
      return callback(new pricing.PricingError('Cart was not found.'));
    }
    return buildQuote(cart.itemDetails, callback, cart.couponApplied);
  });
}

function moneyFromPaise(amountPaise) {
  return (amountPaise / 100).toFixed(2);
}

function recordExpiredWalletCredits(userId) {
  var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
  var WalletTransaction = mongooseConnections[pdt].model('WalletTransaction', WalletTransactionSchema);
  return WalletBalance.find({
    UserId:userId,
    expiryDate:{$lt:new Date()}
  }).lean().exec().then(function(lots) {
    return lots.reduce(function(promise, lot) {
      var amountPaise = Number.isSafeInteger(lot.walletAmountPaise)
        ? lot.walletAmountPaise
        : Math.round(Number(lot.walletAmount || 0) * 100);
      if (amountPaise <= 0) {
        return promise;
      }
      var key = 'wallet-expiry:' + lot._id.toString();
      return promise.then(function() {
        return WalletTransaction.updateOne(
          {idempotencyKey:key},
          {$setOnInsert:{
            transactionId:key,
            idempotencyKey:key,
            userId:userId,
            type:'debit',
            source:'expiry',
            amountPaise:amountPaise,
            currency:'INR',
            status:'completed',
            expiresAt:lot.expiryDate
          }},
          {upsert:true}
        ).exec().catch(function(err) {
          if (isDuplicateKeyError(err)) {
            return;
          }
          throw err;
        });
      });
    }, Promise.resolve());
  });
}

function getAvailableWalletPaise(userId, session) {
  var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
  var query = WalletBalance.find({
    UserId:userId,
    $or:[{expiryDate:null}, {expiryDate:{$gte:new Date()}}]
  });
  if (session) {
    query = query.session(session);
  }
  var expiryLedger = session ? Promise.resolve() : recordExpiredWalletCredits(userId);
  return expiryLedger.then(function() { return query.lean().exec(); }).then(function(lots) {
    return lots.reduce(function(total, lot) {
      var amount = Number.isSafeInteger(lot.walletAmountPaise)
        ? lot.walletAmountPaise
        : Math.round(Number(lot.walletAmount || 0) * 100);
      var nextTotal = total + Math.max(0, amount);
      if (!Number.isSafeInteger(nextTotal)) {
        throw new Error('Wallet balance is outside the supported range.');
      }
      return nextTotal;
    }, 0);
  });
}

function runMongoTransaction(work) {
  var connection = mongooseConnections[pdt];
  if (connection.readyState !== 1) {
    return Promise.reject(new Error('Database connection is unavailable.'));
  }

  return connection.startSession().then(function(session) {
    var transactionStarted = false;
    var operation = Promise.resolve().then(function() {
      session.startTransaction();
      transactionStarted = true;
      return work(session);
    }).then(function(result) {
      return session.commitTransaction().then(function() {
        return result;
      });
    }).catch(function(err) {
      if (!transactionStarted) {
        throw err;
      }
      return session.abortTransaction().catch(function(abortErr) {
        console.error('Unable to abort MongoDB transaction:', abortErr);
      }).then(function() {
        throw err;
      });
    });
    return operation.finally(function() {
      session.endSession();
    });
  });
}

function debitWallet(userId, amountPaise, session, orderId, idempotencyKey) {
  if (!amountPaise) {
    return Promise.resolve();
  }
  var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
  var WalletTransaction = mongooseConnections[pdt].model('WalletTransaction', WalletTransactionSchema);

  return getAvailableWalletPaise(userId, session).then(function(balance) {
    if (balance < amountPaise) {
      throw new Error('Insufficient wallet balance.');
    }
    return WalletBalance.find({
      UserId:userId,
      $or:[{expiryDate:null}, {expiryDate:{$gte:new Date()}}]
    }).sort({expiryDate:1, _id:1}).session(session).lean().exec();
  }).then(function(lots) {
    var remaining = amountPaise;
    var updates = [];
    lots.forEach(function(lot) {
      if (remaining <= 0) {
        return;
      }
      var currentPaise = Number.isSafeInteger(lot.walletAmountPaise)
        ? lot.walletAmountPaise
        : Math.round(Number(lot.walletAmount || 0) * 100);
      if (currentPaise <= 0) {
        return;
      }
      var debit = Math.min(currentPaise, remaining);
      var afterDebit = currentPaise - debit;
      var filter = {_id:lot._id, UserId:userId};
      if (Number.isSafeInteger(lot.walletAmountPaise)) {
        filter.walletAmountPaise = lot.walletAmountPaise;
      } else {
        filter.walletAmountPaise = {$exists:false};
        filter.walletAmount = lot.walletAmount;
      }
      updates.push(function() {
        return WalletBalance.updateOne(filter, {
          $set:{
            walletAmountPaise:afterDebit,
            walletAmount:afterDebit / 100
          }
        }).session(session).then(function(result) {
          if (!result.nModified) {
            throw new Error('Wallet balance changed during checkout.');
          }
        });
      });
      remaining -= debit;
    });
    return updates.reduce(function(promise, update) {
      return promise.then(update);
    }, Promise.resolve()).then(function() {
      if (remaining !== 0) {
        throw new Error('Wallet balance changed during checkout.');
      }
      return WalletTransaction.create([{
        transactionId:idempotencyKey,
        idempotencyKey:idempotencyKey,
        userId:userId,
        orderId:orderId,
        type:'debit',
        source:'order_payment',
        amountPaise:amountPaise,
        currency:'INR',
        status:'completed'
      }], {session:session});
    });
  });
}

function creditWallet(userId, amountPaise, session, orderId, idempotencyKey, source) {
  if (!amountPaise) {
    return Promise.resolve();
  }
  var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
  var WalletTransaction = mongooseConnections[pdt].model('WalletTransaction', WalletTransactionSchema);
  return WalletBalance.create([{
    UserId:userId,
    orderId:0,
    walletAmount:amountPaise / 100,
    walletAmountPaise:amountPaise,
    expiryDate:null,
    username:'',
    walletdate:new Date()
  }], {session:session}).then(function() {
    return WalletTransaction.create([{
      transactionId:idempotencyKey,
      idempotencyKey:idempotencyKey,
      userId:userId,
      orderId:orderId,
      type:'credit',
      source:source,
      amountPaise:amountPaise,
      currency:'INR',
      status:'completed'
    }], {session:session});
  });
}

function isDuplicateKeyError(err) {
  return err && (err.code === 11000 || err.code === 11001);
}

var idSequenceSchema = new mongoose.Schema({
  _id:String,
  value:Number
}, {collection:'idSequences', versionKey:false});

function allocateNextNumericId(Model, field, sequenceName) {
  var filter = {};
  filter[field] = {$exists:true};
  var sort = {};
  sort[field] = -1;

  return Model.findOne(filter).sort(sort).select(field).lean().exec().then(function(lastRecord) {
    var currentMaximum = lastRecord ? Number(lastRecord[field]) : 0;
    if (!Number.isSafeInteger(currentMaximum) || currentMaximum < 0) {
      throw new Error('The existing ' + field + ' sequence is invalid.');
    }

    var Sequence = mongooseConnections[pdt].model('IdSequence', idSequenceSchema);
    return Sequence.findOneAndUpdate(
      {_id:sequenceName},
      {$max:{value:currentMaximum}},
      {new:true}
    ).exec().then(function(sequence) {
      if (sequence) return sequence;
      return Sequence.findOneAndUpdate(
        {_id:sequenceName},
        {$setOnInsert:{value:currentMaximum}},
        {new:true, upsert:true}
      ).exec().catch(function(err) {
        if (!isDuplicateKeyError(err)) {
          throw err;
        }
        return Sequence.findOne({_id:sequenceName}).exec();
      });
    }).then(function() {
      return Sequence.findOneAndUpdate(
        {_id:sequenceName},
        {$inc:{value:1}},
        {new:true}
      ).exec();
    }).then(function(sequence) {
      if (!sequence || !Number.isSafeInteger(sequence.value) || sequence.value <= 0) {
        throw new Error('Unable to allocate the next ' + field + '.');
      }
      return sequence.value;
    });
  });
}

  function transactionSupportError(err) {
    return err && (err.code === 20 || err.code === 303 ||
      /transaction numbers are only allowed|does not support transactions/i.test(err.message || ''));
  }

  function paymentConfigurationPresent() {
    return Boolean(config.razorpayKeyId && config.razorpayKeySecret);
  }

  function orderRequestFingerprint(body) {
    var cartId = body && body.cartId;
    var fingerprintData;
    if (cartId) {
      fingerprintData = {cartId:cartId};
    } else {
      var lines = orderLinesFromBody(body || []);
      if (!lines) {
        return null;
      }
      fingerprintData = {
        items:lines.map(function(line) {
          return {
            itemId:line && line.itemId,
            quantityId:line && (line.quantityId !== undefined ? line.quantityId : line.qtId),
            quantity:line && (line.quantity !== undefined ? line.quantity : line.itemQuantity)
          };
        })
      };
    }
    fingerprintData.paymentMethod = body && body.paymentMethod;
    fingerprintData.couponCode = body && (body.couponCode || body.couponApplied) || null;
    return crypto.createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');
  }

  function checkoutResponse(order, balancePaise) {
    var response = {
      orderId:order._id.toString(),
      orderStatus:order.orderStatus,
      paymentStatus:order.paymentStatus,
      currency:order.currency,
      items:order.items,
      subtotalPaise:order.subtotalPaise,
      discountPaise:order.discountPaise,
      taxableAmountPaise:order.taxableAmountPaise,
      taxPaise:order.taxPaise,
      deliveryFeePaise:order.deliveryFeePaise,
      totalPaise:order.totalPaise,
      walletPaidPaise:order.walletPaidPaise,
      onlinePaidPaise:order.onlinePaidPaise,
      codDuePaise:order.codDuePaise,
      walletBalancePaise:balancePaise
    };
    if (order.razorpayOrderId) {
      response.razorpay = {
        keyId:config.razorpayKeyId,
        orderId:order.razorpayOrderId,
        amount:order.onlinePaidPaise,
        currency:order.currency
      };
    }
    return response;
  }

  function summarizeRefundStatus(order) {
    var paidAmount = (order.walletPaidPaise || 0) + (order.onlinePaidPaise || 0);
    (order.payments || []).forEach(function(payment) {
      if (payment.method === 'cod' && payment.status === 'paid') {
        paidAmount += payment.amountPaise || 0;
      }
    });
    var refundedAmount = 0;
    var pendingAmount = 0;
    (order.refunds || []).forEach(function(refund) {
      if (refund.status === 'completed' || refund.status === 'processed') {
        refundedAmount += refund.amountPaise || 0;
      } else if (refund.status !== 'failed') {
        pendingAmount += refund.amountPaise || 0;
      }
    });
    if (!paidAmount || (!refundedAmount && !pendingAmount)) {
      return 'none';
    }
    if (refundedAmount >= paidAmount) {
      return 'completed';
    }
    if (pendingAmount) {
      return refundedAmount ? 'partial' : 'pending';
    }
    return 'partial';
  }

app.get("/", function(req, res) {
  res.json({message: "PDT Server is up!"});
});

var router = express.Router();

//BEGIN ROUTING
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Access-Token, Origin, X-Requested-With, X-AUTHENTICATION, X-IP, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

router.post("/register", function(req, res) {
  if (!req.body || typeof req.body.username !== 'string' || !req.body.username.trim() ||
      req.body.username.length > 100 || typeof req.body.password !== 'string' ||
      !req.body.password || req.body.password.length > 1024) {
    return res.status(400).json({message:"A valid username and password are required."});
  }

  var User = mongooseConnections[pdt].model('User', userSchema);
  var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
  var WalletTransaction = mongooseConnections[pdt].model('WalletTransaction', WalletTransactionSchema);
  var user = new User({
    username:req.body.username,
    name:req.body.name
  });
  var wallet;
  var userSaved = false;
  var walletSaved = false;

  function setPassword() {
    return new Promise(function(resolve, reject) {
      user.setPassword(req.body.password, function(err) {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  function rollbackRegistration() {
    var cleanupTasks = [];
    if (walletSaved) {
      cleanupTasks.push(WalletBalance.deleteOne({_id:wallet._id}).exec());
    }
    if (userSaved) {
      cleanupTasks.push(User.deleteOne({_id:user._id}).exec());
    }
    return Promise.all(cleanupTasks);
  }

  allocateNextNumericId(User, 'UserId', 'user')
    .then(function(userId) {
      user.UserId = userId;
      return setPassword();
    })
    .then(function() {
      return user.save();
    })
    .then(function() {
      userSaved = true;
      return allocateNextNumericId(WalletBalance, 'walletId', 'wallet');
    })
    .then(function(walletId) {
      wallet = new WalletBalance({
        walletId:walletId,
        UserId:user.UserId,
        orderId:0,
        walletAmount:50,
        walletAmountPaise:5000,
        expiryDate:new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        alertDay:'alert to user 7 days before expiryDate',
        username:user.username,
        walletdate:new Date()
      });
      return wallet.save();
    })
    .then(function() {
      walletSaved = true;
      var bonusTransaction = new WalletTransaction({
        transactionId:'registration-bonus:' + user.UserId,
        idempotencyKey:'registration-bonus:' + user.UserId,
        userId:user.UserId,
        type:'credit',
        source:'registration_bonus',
        amountPaise:5000,
        currency:'INR',
        status:'completed',
        expiresAt:wallet.expiryDate
      });
      return bonusTransaction.save();
    })
    .then(function() {
      var token = user.generateJwt();
      user.set('password', undefined);
      user.set('salt', undefined);
      user.set('hash', undefined);
      user.set('passwordIterations', undefined);
      return res.status(201).json({message:user, token:token});
    })
    .catch(function(err) {
      var duplicateUsername = !userSaved && isDuplicateKeyError(err);
      if (!duplicateUsername) {
        logger.error('User registration failed: ' + err.message);
      }
      rollbackRegistration().catch(function(cleanupErr) {
        logger.error('Failed to roll back incomplete registration: ' + cleanupErr.message);
      }).then(function() {
        if (res.headersSent) return;
        if (duplicateUsername) {
          return res.status(409).json({message:"User already exists."});
        }
        return res.status(500).json({message:"Unable to register user."});
      });
    });
});


router.post("/login", function(req, res) {
  if (!req.body || typeof req.body.username !== 'string' || !req.body.username.trim() ||
      req.body.username.length > 100 || typeof req.body.password !== 'string' ||
      !req.body.password || req.body.password.length > 1024) {
    return res.status(400).json({message:"A valid username and password are required."});
  }

  var username = req.body.username;
  var password = req.body.password;
  var Users = mongooseConnections[pdt].model('User', userSchema);

  Users.findOne(
    {'username': username},
    'username email name roles UserId isOtpVerified hash salt passwordIterations +password',
    function(err, user) {
      if (err) {
        return res.status(500).json({message:"Unable to authenticate user."});
      }
      if (!user) {
        return res.status(401).json({message:"Invalid username or password."});
      }

      authentication.verifyPassword(user, password, function(verifyErr, passwordMatches) {
        if (verifyErr) {
          return res.status(500).json({message:"Unable to authenticate user."});
        }
        if (!passwordMatches) {
          return res.status(401).json({message:"Invalid username or password."});
        }

        user.set('salt', undefined);
        user.set('hash', undefined);
        user.set('passwordIterations', undefined);
        res.json({message: user, token: user.generateJwt()});
      });
    }
  );
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
  
  
router.post("/saveCompany", requireAuthenticatedUser, requireAdmin, function(req, res) {
  if (!req.body || typeof req.body.companyName !== 'string' || !req.body.companyName.trim()) {
    return res.status(400).json({message:"Company name is required."});
  }

  var Company = mongooseConnections[pdt].model('company', companySchema);
  var company = new Company({
    companyId: new mongoose.Types.ObjectId().toString(),
    companyName: req.body.companyName.trim(),
    description: req.body.description,
    address: req.body.address,
    email: req.body.email,
    pContactNo: req.body.pContactNo,
    contactNo: req.body.contactNo,
    contactPerson: req.body.contactPerson
  });

  company.save(function(err) {
    if (err) {
      return res.status(500).json({message:"Unable to save company."});
    }
    res.status(201).json({message:company});
  });
});

router.post("/saveItem", requireAuthenticatedUser, requireAdmin, function(req, res) {
    var Item = mongooseConnections[pdt].model('Item', itemSchema);
    if (!req.body || typeof req.body.name !== 'string' || !req.body.name.trim() ||
        !Array.isArray(req.body.quantity) || req.body.quantity.length === 0) {
      return res.status(400).json({message:'A name and at least one quantity option are required.'});
    }

    var item = new Item({
      itemId:req.body.itemId,
      name:req.body.name.trim(),
      displayName:req.body.displayName,
      description:req.body.description,
      quantity:req.body.quantity,
      landingImage:req.body.landingImage,
      images:req.body.images,
      categoryId:req.body.categoryId,
      subCategoryId:req.body.subCategoryId,
      spiceLevel:req.body.spiceLevel,
      isAvailable:req.body.isAvailable !== false
    });
    item.save(function(err) {
      if (err) {
        logger.error('Menu item save failed: ' + err.message);
        return res.status(500).json({message:'Unable to save menu item.'});
      }
      res.status(201).json({message:item});
    });
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
  if (!req.body || typeof req.body.MobileNO !== 'string' || !/^\+?[0-9]{7,15}$/.test(req.body.MobileNO)) {
    return res.status(400).json({message:"A valid mobile number is required."});
  }
  if (!config.smsGatewayUrl || !config.smsGatewayUser || !config.smsGatewayPassword) {
    return res.status(503).json({message:"SMS verification is not configured."});
  }

  var smsUrl;
  try {
    smsUrl = new URL(config.smsGatewayUrl);
  } catch (error) {
    return res.status(503).json({message:"SMS verification gateway is not configured correctly."});
  }
  if (smsUrl.protocol !== 'https:') {
    return res.status(503).json({message:"SMS verification requires an HTTPS gateway."});
  }

  var MobileNO = req.body.MobileNO;
  var OTP = mongooseConnections[pdt].model('OTP', OTPSchema);
  var windowStart = new Date(Date.now() - 15 * 60 * 1000);
  OTP.countDocuments({MobileNO:MobileNO, OTP_Date:{$gte:windowStart}}, function(err, recentCount) {
    if (err) {
      return res.status(500).json({message:"Unable to issue verification code."});
    }
    if (recentCount >= 3) {
      return res.status(429).json({message:"Too many verification requests. Try again later."});
    }

    OTP.findOne({MobileNO:MobileNO, Status:'pending'}).sort({OTP_Date:-1}).exec(function(findErr, previousOtp) {
      if (findErr) {
        return res.status(500).json({message:"Unable to issue verification code."});
      }
      if (previousOtp && previousOtp.OTP_Date &&
          previousOtp.OTP_Date > new Date(Date.now() - 60 * 1000)) {
        return res.status(429).json({message:"Please wait before requesting another verification code."});
      }

      OTP.findOne({UserId:{$exists:true}}, {_id:0, UserId:1}).sort({UserId:-1}).exec(function(idErr, lastOtp) {
        if (idErr) {
          return res.status(500).json({message:"Unable to issue verification code."});
        }

        var Code = String(crypto.randomInt(100000, 1000000));
        var otp = new OTP({
          OTP_Hash:crypto.createHmac('sha256', config.secret).update(MobileNO + ':' + Code).digest('hex'),
          MobileNO:MobileNO,
          UserId:lastOtp ? parseInt(lastOtp.UserId, 10) + 1 : 1,
          OTP_Date:new Date(),
          Status:'pending',
          Attempts:0
        });

        otp.save(function(saveErr) {
          if (saveErr) {
            return res.status(500).json({message:"Unable to issue verification code."});
          }

          smsUrl.searchParams.set('user', config.smsGatewayUser);
          smsUrl.searchParams.set('password', config.smsGatewayPassword);
          smsUrl.searchParams.set('MobileNO', MobileNO);
          smsUrl.searchParams.set('text', 'Your Ezifood verification code is: ' + Code);
          smsUrl.searchParams.set('route', '14');
          request.get({url:smsUrl.toString(), timeout:10000}, function(smsErr, response) {
            if (smsErr || !response || response.statusCode < 200 || response.statusCode >= 300) {
              OTP.updateOne({_id:otp._id}, {$set:{Status:'delivery-failed'}}, function(updateErr) {
                if (updateErr) {
                  return res.status(500).json({message:"Unable to record verification delivery failure."});
                }
                return res.status(502).json({message:"Unable to deliver verification code."});
              });
              return;
            }

            res.json({message:"Verification code sent."});
          });
        });
      });
    });
  });
});
router.post("/VerifyOTP", function(req, res) {
  var submittedCode = req.body && String(req.body.OTP);
  if (!req.body || typeof req.body.MobileNO !== 'string' ||
      !/^\+?[0-9]{7,15}$/.test(req.body.MobileNO) ||
      !/^[0-9]{6}$/.test(submittedCode || '')) {
    return res.status(400).json({message:"A valid mobile number and verification code are required."});
  }

  var Mobile = req.body.MobileNO;
  var OTP = mongooseConnections[pdt].model('OTP', OTPSchema);
  var Users = mongooseConnections[pdt].model('staff', userSchema);
  OTP.findOne({MobileNO:Mobile, Status:'pending'}, null, {sort:{OTP_Date:-1}}, function(err, otp) {
    if (err) {
      return res.status(500).json({message:"Unable to verify the code."});
    }
    if (!otp || !otp.OTP_Date || otp.Attempts >= 5) {
      return res.status(401).json({message:"Invalid or expired verification code."});
    }
    if (otp.OTP_Date < new Date(Date.now() - 10 * 60 * 1000)) {
      OTP.updateOne({_id:otp._id, Status:'pending'}, {$set:{Status:'expired'}}, function(expireErr) {
        if (expireErr) {
          return res.status(500).json({message:"Unable to verify the code."});
        }
        return res.status(401).json({message:"Invalid or expired verification code."});
      });
      return;
    }

    var suppliedHash = crypto.createHmac('sha256', config.secret)
      .update(Mobile + ':' + submittedCode)
      .digest();
    var savedHash;
    try {
      savedHash = Buffer.from(otp.OTP_Hash, 'hex');
    } catch (hashErr) {
      return res.status(401).json({message:"Invalid or expired verification code."});
    }

    if (!otp.OTP_Hash || savedHash.length !== suppliedHash.length ||
        !crypto.timingSafeEqual(savedHash, suppliedHash)) {
      OTP.updateOne(
        {_id:otp._id, Status:'pending', Attempts:{$lt:5}},
        {$inc:{Attempts:1}},
        function(attemptErr) {
          if (attemptErr) {
            return res.status(500).json({message:"Unable to verify the code."});
          }
          return res.status(401).json({message:"Invalid or expired verification code."});
        }
      );
      return;
    }

    Users.findOne({username:Mobile}, {_id:1}, function(userErr, account) {
      if (userErr) {
        return res.status(500).json({message:"Unable to verify the code."});
      }
      if (!account) {
        return res.status(401).json({message:"Invalid or expired verification code."});
      }

      OTP.updateOne(
        {_id:otp._id, Status:'pending', OTP_Hash:otp.OTP_Hash},
        {$set:{Status:'verified'}, $unset:{OTP_Hash:1}},
        function(updateErr, updateResult) {
          if (updateErr) {
            return res.status(500).json({message:"Unable to verify the code."});
          }
          if (!updateResult.nModified) {
            return res.status(401).json({message:"Invalid or expired verification code."});
          }

          Users.updateOne({username:Mobile}, {$set:{isOtpVerified:true}}, function(accountErr) {
            if (accountErr) {
              return res.status(500).json({message:"Unable to update account verification."});
            }
            return res.json({message:"Phone number verified."});
          });
        }
      );
    });
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

router.get("/InProcessOrder", requireAuthenticatedUser, function(req, res) {
  var userId=req.authUser.UserId;
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.find({
    userId:userId,
    orderStatus:{$in:['pending','confirmed','preparing','out_for_delivery','cancellation_pending']}
  }).sort({itemOrderDate:-1}).lean().exec(function(err, orders) {
    if (err) {
      return res.status(500).json({message:'Unable to retrieve in-process orders.'});
    }
    orders.forEach(function(order) {
      order.orderId = order._id.toString();
      order.Date = order.itemOrderDate ? dateFormat(order.itemOrderDate, 'd mmm') : '';
      order.Time = order.itemOrderDate ? dateFormat(order.itemOrderDate, 'h:MM TT') : '';
      order.orderQuanity = order.itemTotal;
      order.price = order.NetTotal;
      delete order._id;
      delete order.itemTotal;
      delete order.NetTotal;
      delete order.itemOrderDate;
      delete order.idempotencyKey;
      delete order.requestHash;
      delete order.razorpayOrderId;
      delete order.razorpayPaymentId;
    });
    res.json({GetData:orders});
  });
  });
  
router.get("/PastOrder", requireAuthenticatedUser, function(req, res) {
  var userId=req.authUser.UserId;
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.find({
    userId:userId,
    orderStatus:{$in:['completed','cancelled','payment_failed','gateway_failed','wallet_checkout_failed']}
  }).sort({itemOrderDate:-1}).lean().exec(function(err, orders) {
    if (err) {
      return res.status(500).json({message:'Unable to retrieve past orders.'});
    }
    orders.forEach(function(order) {
      order.orderId = order._id.toString();
      order.Date = order.itemOrderDate ? dateFormat(order.itemOrderDate, 'd mmm') : '';
      order.Time = order.itemOrderDate ? dateFormat(order.itemOrderDate, 'h:MM TT') : '';
      order.orderQuanity = order.itemTotal;
      order.price = order.NetTotal;
      delete order._id;
      delete order.itemTotal;
      delete order.NetTotal;
      delete order.itemOrderDate;
      delete order.idempotencyKey;
      delete order.requestHash;
      delete order.razorpayOrderId;
      delete order.razorpayPaymentId;
    });
    res.json({GetData:orders});
  });
  });
  router.get("/WalletBalance", requireAuthenticatedUser, function(req, res) {
    var userId=req.authUser.UserId;
    var WalletBalance = mongooseConnections[pdt].model('userWallets', WalletBalanceSchema);
    recordExpiredWalletCredits(userId).then(function() {
      return WalletBalance.find({UserId:userId}).lean().exec();
    }).then(function(lots) {
      var now = new Date();
      var grouped = Object.create(null);
      var activeBalancePaise = 0;
      lots.forEach(function(lot) {
        var amountPaise = Number.isSafeInteger(lot.walletAmountPaise)
          ? lot.walletAmountPaise
          : Math.round(Number(lot.walletAmount || 0) * 100);
        var isActive = !lot.expiryDate || lot.expiryDate >= now;
        var expiryKey = lot.expiryDate ? lot.expiryDate.toISOString() : 'never';
        if (!grouped[expiryKey]) {
          grouped[expiryKey] = {
            username:req.authUser.username,
            expiryDate:lot.expiryDate || null,
            Amount:0,
            AmountPaise:0,
            orderId:lot.orderId || 0,
            alertDay:lot.alertDay
          };
        }
        grouped[expiryKey].AmountPaise += amountPaise;
        grouped[expiryKey].Amount = grouped[expiryKey].AmountPaise / 100;
        if (isActive) {
          activeBalancePaise += amountPaise;
        }
      });
      res.json({
        walletAmount:activeBalancePaise / 100,
        walletAmountPaise:activeBalancePaise,
        GetData:Object.keys(grouped).map(function(key) { return grouped[key]; })
      });
    }).catch(function(err) {
      logger.error('Wallet balance lookup failed: ' + err.message);
      if (!res.headersSent) {
        res.status(500).json({message:'Unable to retrieve wallet balance.'});
      }
    });
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


router.get("/saveDashboard",requireAuthenticatedUser,requireAdmin,function(req,res) {
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

router.get("/UserAddress", requireAuthenticatedUser, function(req, res) {
        var userId=req.authUser.UserId;
        var address = mongooseConnections[pdt].model('Address', addressSchema);
        address.find({"userId":userId},{"street_address":1,"city":1,"state":1,"zip_postalcode":1,"phonenumber":1,"AddressType":1,"AddId":1},function(err,Add)
        {
            if(err)
            {
            return res.status(500).json({message:"Unable to retrieve addresses."});
            }
            else 
            { 
                res.json({GetData: Add});
            }
        });
  });
router.post("/SaveUserAddress", requireAuthenticatedUser, function(req, res) {
    var Address = mongooseConnections[pdt].model('Address', addressSchema);
    
    Address.findOne({},{_id:0,AddId:1}, function(err,Id){
       if(err)
       res.status(401).json({message:err.message})
        else{
                               
                            var add = new Address()
                            add.AddId= Id !=null?parseInt(parseInt(Id.AddId)+1):1;
                            add.username=req.authUser.username;
                            add.userId=req.authUser.UserId;
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
  router.get("/GetUpdateUserAddress", requireAuthenticatedUser, function(req, res) {
    var AddId=req.query.AddId;
    var userId=req.authUser.UserId;
        var address = mongooseConnections[pdt].model('Address', addressSchema);
        address.find({"userId":userId,"AddId":AddId},{"street_address":1,"city":1,"state":1,"zip_postalcode":1,"phonenumber":1,"AddressType":1,"AddId":1},function(err,Add)
        {
            if(err)
            {
                 return res.status(500).json({message:"Unable to retrieve address."});
            }
            else 
            { 
                if (!Add.length) {
                    return res.status(404).json({message:"Address not found."});
                }
                res.status(200).json({GetData:Add[0]});
            }
        });
});

  router.post("/UpdateUserAddress", requireAuthenticatedUser, function(req, res) {
      var userId=req.authUser.UserId;
      var AddId=req.query.AddId;
    var Address = mongooseConnections[pdt].model('Address', addressSchema);
                var add = new Address()
                add.username=req.authUser.username;
                add.userId=req.authUser.UserId;
                add.street_address=req.body.street_address  ;
                add.city=req.body.city  ;
                add.state=req.body.state  ;
                add.zip_postalcode=req.body.zip_postalcode;
                add.phonenumber=req.body.phonenumber;
                add.AddressType=req.body.AddressType;
    
        Address.updateOne({ "userId": userId,"AddId":AddId}, { $set: { street_address:add.street_address, city:add.city,state:add.state,zip_postalcode:add.zip_postalcode,phonenumber:add.phonenumber,AddressType:add.AddressType} }, function (err, updateDone) {
                          
        if (err) {
          return res.status(500).json({message:"Unable to update address."});
        }
        if (!updateDone.nModified) {
          return res.status(404).json({message:"Address not found."});
        }
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
                var itemDetail = itemObj.Item_Detaill && itemObj.Item_Detaill[0];
                if (!itemDetail) {
                  delete itemObj.Item_Detaill;
                  return;
                }
                if (itemDetail.landingImage !=undefined)
                {
                 var base64Str = itemDetail.landingImage ;
                 var optionalObj = {'fileName': String(itemObj.type || 'offer').replace(/ /g, "_") + '_' + itemObj.Id + '_' + Date.now() , 'type':'webp'};
                 var imageInfo = base64ToImage(base64Str,publicDashDir,optionalObj);                     
                 itemObj.ImgUrl = '/dashboardimages/' + imageInfo.fileName;
                 itemObj.displayName = itemDetail.displayName;
                }
                delete itemObj.Item_Detaill;
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
  
router.post("/checkout/quote", requireAuthenticatedUser, function(req, res) {
  buildQuoteFromRequest(req, function(err, quote) {
    if (err) {
      if (err instanceof pricing.PricingError) {
        return res.status(400).json({message:err.message});
      }
      logger.error('Checkout quote failed: ' + err.message);
      return res.status(500).json({message:'Unable to calculate the order quote.'});
    }

    getAvailableWalletPaise(req.authUser.UserId).then(function(walletBalancePaise) {
      res.json({
        currency:quote.currency,
        items:quote.items,
        subtotalPaise:quote.subtotalPaise,
        subtotal:moneyFromPaise(quote.subtotalPaise),
        discounts:[],
        discountPaise:0,
        taxableAmountPaise:quote.taxableAmountPaise,
        taxBreakdown:[],
        taxPaise:0,
        deliveryFeePaise:0,
        deliveryFee:'0.00',
        totalPaise:quote.totalPaise,
        payable:moneyFromPaise(quote.totalPaise),
        walletBalancePaise:walletBalancePaise,
        walletBalance:moneyFromPaise(walletBalancePaise)
      });
    }).catch(function(balanceErr) {
      logger.error('Wallet balance lookup failed: ' + balanceErr.message);
      res.status(500).json({message:'Unable to retrieve wallet balance.'});
    });
  });
});

router.post("/checkout", requireAuthenticatedUser, function(req, res) {
  var idempotencyKey = req.headers['idempotency-key'];
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
    return res.status(400).json({message:'A valid Idempotency-Key header is required.'});
  }

  var userId = req.authUser.UserId;
  var scopedKey = String(userId) + ':' + idempotencyKey;
  var fingerprint = orderRequestFingerprint(req.body || {});
  if (!fingerprint) {
    return res.status(400).json({message:'Cart items are required.'});
  }

  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.findOne({idempotencyKey:scopedKey}, function(existingErr, existingOrder) {
    if (existingErr) {
      return res.status(500).json({message:'Unable to start checkout.'});
    }
    if (existingOrder) {
      if (existingOrder.requestHash !== fingerprint) {
        return res.status(409).json({message:'Idempotency key was already used for a different checkout.'});
      }
      if (existingOrder.orderStatus === 'gateway_initializing') {
        return res.status(202).json({message:'Checkout initialization is still in progress.'});
      }
      if (existingOrder.orderStatus === 'gateway_failed' ||
          existingOrder.orderStatus === 'wallet_checkout_failed') {
        return res.status(409).json({message:'This checkout could not be initialized. Start a new checkout with a new idempotency key.'});
      }
      getAvailableWalletPaise(userId).then(function(balance) {
        return res.json(checkoutResponse(existingOrder, balance));
      }).catch(function(balanceErr) {
        logger.error('Wallet balance lookup failed: ' + balanceErr.message);
        return res.status(500).json({message:'Unable to retrieve wallet balance.'});
      });
      return;
    }

    buildQuoteFromRequest(req, function(quoteErr, quote) {
      if (quoteErr) {
        if (quoteErr instanceof pricing.PricingError) {
          return res.status(400).json({message:quoteErr.message});
        }
        logger.error('Checkout pricing failed: ' + quoteErr.message);
        return res.status(500).json({message:'Unable to calculate the order total.'});
      }

      var method = req.body && req.body.paymentMethod;
      var supportedMethods = ['cod', 'razorpay', 'wallet', 'wallet_cod', 'wallet_razorpay'];
      if (supportedMethods.indexOf(method) === -1) {
        return res.status(400).json({message:'Choose COD, Razorpay, wallet, wallet+COD, or wallet+Razorpay.'});
      }

      getAvailableWalletPaise(userId).then(function(walletBalancePaise) {
        var breakdown = checkout.calculatePaymentBreakdown(
          quote.totalPaise,
          walletBalancePaise,
          method
        );
        var walletPaidPaise = breakdown.walletPaidPaise;
        var onlinePaidPaise = breakdown.onlinePaidPaise;
        var codDuePaise = breakdown.codDuePaise;

        if (onlinePaidPaise && !paymentConfigurationPresent()) {
          return res.status(503).json({message:'Razorpay checkout is not configured.'});
        }

        var receipt = crypto.createHash('sha256').update(scopedKey).digest('hex').slice(0, 40);
        var order = new Order({
            items:quote.items,
            itemOrderDate:new Date(),
            itemTotal:quote.items.reduce(function(total, line) {
              return total + line.quantity;
            }, 0),
            NetTotal:Number(moneyFromPaise(quote.totalPaise)),
            taxesTotal:0,
            currency:quote.currency,
            subtotalPaise:quote.subtotalPaise,
            discountPaise:0,
            taxableAmountPaise:quote.taxableAmountPaise,
            taxPaise:0,
            deliveryFeePaise:0,
            totalPaise:quote.totalPaise,
            walletPaidPaise:walletPaidPaise,
            onlinePaidPaise:onlinePaidPaise,
            codDuePaise:codDuePaise,
            userId:userId,
            username:req.authUser.username,
            paymentMethod:method,
            paymentStatus:onlinePaidPaise ? 'pending' :
              (codDuePaise ? (walletPaidPaise ? 'partially_paid' : 'pending') : 'paid'),
            orderStatus:onlinePaidPaise ? 'gateway_initializing' : 'pending',
            refundStatus:'none',
            idempotencyKey:scopedKey,
            requestHash:fingerprint,
            payments:[
              ...(walletPaidPaise ? [{method:'wallet', amountPaise:walletPaidPaise, status:'paid', paidAt:new Date()}] : []),
              ...(onlinePaidPaise ? [{method:'razorpay', amountPaise:onlinePaidPaise, status:'pending'}] : []),
              ...(codDuePaise ? [{method:'cod', amountPaise:codDuePaise, status:'due'}] : [])
            ]
          });

        var persistCartLink = function(savedOrder) {
          if (req.body && req.body.cartId) {
            var ItemCart = mongooseConnections[pdt].model('ItemCart', itemCartSchema);
            ItemCart.updateOne(
              {_id:req.body.cartId, userId:userId},
              {$set:{orderId:savedOrder._id.toString(), totalAmountPaid:0}}
            ).catch(function(cartErr) {
              logger.error('Unable to link checked-out cart: ' + cartErr.message);
            });
          }
          return savedOrder;
        };

        var returnCheckout = function(savedOrder) {
          return getAvailableWalletPaise(userId).then(function(balance) {
            return res.status(201).json(checkoutResponse(savedOrder, balance));
          });
        };

        var saveWalletOrder = function() {
          return runMongoTransaction(function(session) {
            return debitWallet(
              userId,
              walletPaidPaise,
              session,
              order._id.toString(),
              'wallet-debit:' + scopedKey
            ).then(function() {
              return order.save({session:session});
            });
          });
        };

        var createOnlineCheckout = function() {
          return order.save().then(function() {
            return razorpay.createOrder(
              config.razorpayKeyId,
              config.razorpayKeySecret,
              onlinePaidPaise,
              receipt
            ).then(function(providerOrder) {
              if (!providerOrder || !providerOrder.id ||
                  Number(providerOrder.amount) !== onlinePaidPaise ||
                  providerOrder.currency !== 'INR') {
                throw new Error('Payment gateway returned an invalid order.');
              }
              order.razorpayOrderId = providerOrder.id;
              var gatewayPayment = order.payments.find(function(payment) {
                return payment.method === 'razorpay';
              });
              gatewayPayment.providerOrderId = providerOrder.id;
              order.orderStatus = 'pending';
              if (!walletPaidPaise) {
                return order.save();
              }
              return runMongoTransaction(function(session) {
                return debitWallet(
                  userId,
                  walletPaidPaise,
                  session,
                  order._id.toString(),
                  'wallet-debit:' + scopedKey
                ).then(function() {
                  return order.save({session:session});
                });
              });
            }).catch(function(err) {
              if (order.orderStatus === 'gateway_initializing') {
                order.orderStatus = 'gateway_failed';
                order.paymentStatus = 'failed';
                return order.save().catch(function(saveErr) {
                  logger.error('Unable to record gateway checkout failure: ' + saveErr.message);
                }).then(function() {
                  throw err;
                });
              }
              if (transactionSupportError(err) || err.message === 'Insufficient wallet balance.') {
                order.orderStatus = 'wallet_checkout_failed';
                order.paymentStatus = 'failed';
                return order.save().catch(function(saveErr) {
                  logger.error('Unable to record wallet checkout failure: ' + saveErr.message);
                }).then(function() {
                  throw err;
                });
              }
              throw err;
            });
          });
        };

        var savePromise;
        if (onlinePaidPaise) {
          savePromise = createOnlineCheckout();
        } else if (walletPaidPaise) {
          savePromise = saveWalletOrder();
        } else {
          savePromise = order.save();
        }

        return savePromise.then(function(savedOrder) {
          return returnCheckout(persistCartLink(savedOrder));
        }).catch(function(err) {
          if (isDuplicateKeyError(err)) {
            return Order.findOne({idempotencyKey:scopedKey}).exec().then(function(racedOrder) {
              if (!racedOrder || racedOrder.requestHash !== fingerprint) {
                return res.status(409).json({message:'Checkout request conflicts with an existing order.'});
              }
              if (racedOrder.orderStatus === 'gateway_initializing') {
                return res.status(202).json({message:'Checkout initialization is still in progress.'});
              }
              return getAvailableWalletPaise(userId).then(function(balance) {
                return res.json(checkoutResponse(racedOrder, balance));
              });
            });
          }
          throw err;
        });
      }).catch(function(err) {
        if (res.headersSent) {
          return;
        }
        if (err.message === 'Insufficient wallet balance.') {
          return res.status(409).json({message:err.message});
        }
        if (transactionSupportError(err)) {
          return res.status(503).json({message:'Wallet checkout requires MongoDB transaction support.'});
        }
        if (err.message === 'Payment gateway returned an invalid order.') {
          return res.status(502).json({message:'Payment gateway returned an invalid order.'});
        }
        if (/payment gateway request failed|timed out|payment gateway returned/i.test(err.message)) {
          return res.status(502).json({message:'Unable to initialize Razorpay checkout.'});
        }
        logger.error('Checkout failed: ' + err.message);
        return res.status(500).json({message:'Unable to complete checkout.'});
      });
    });
  });
});

function finalizeRazorpayCapture(providerOrderId, payment) {
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  return Order.findOne({razorpayOrderId:providerOrderId}).exec().then(function(order) {
    if (!order) {
      throw new Error('The payment does not match an order.');
    }
    if (Number(payment.amount) !== order.onlinePaidPaise || payment.currency !== 'INR' ||
        payment.order_id !== providerOrderId || payment.status !== 'captured') {
      throw new Error('The captured payment does not match the order amount.');
    }
    var paymentEntry = order.payments.find(function(entry) {
      return entry.method === 'razorpay' && entry.providerOrderId === providerOrderId;
    });
    if (!paymentEntry) {
      throw new Error('The payment does not match an order payment.');
    }
    if (paymentEntry.status === 'paid' && paymentEntry.providerPaymentId === payment.id) {
      if (order.orderStatus !== 'cancelled') {
        return order;
      }
    }
    if (paymentEntry.status === 'paid' && paymentEntry.providerPaymentId !== payment.id) {
      throw new Error('A different payment has already been recorded for this order.');
    }

    if (order.orderStatus === 'cancellation_pending') {
      throw new Error('Cancellation refund is still being reconciled.');
    }

    var markPaidFilter = {
      _id:order._id,
      razorpayOrderId:providerOrderId,
      'payments':{$elemMatch:{
        method:'razorpay',
        providerOrderId:providerOrderId,
        status:{$in:['pending','failed']}
      }}
    };
    if (order.orderStatus === 'cancelled') {
      markPaidFilter.orderStatus = 'cancelled';
    } else {
      markPaidFilter.orderStatus = {$nin:['cancelled','cancellation_pending']};
    }

    var paidFields = {
      'payments.$.status':'paid',
      'payments.$.providerPaymentId':payment.id,
      'payments.$.paidAt':new Date(),
      razorpayPaymentId:payment.id,
      paymentStatus:order.codDuePaise ? 'partially_paid' : 'paid'
    };
    var nextOrderStatus = orderState.orderStatusAfterOnlineCapture(order.orderStatus);
    if (nextOrderStatus !== order.orderStatus) {
      paidFields.orderStatus = nextOrderStatus;
    }
    var markPaid = paymentEntry.status === 'paid'
      ? Promise.resolve({nModified:0})
      : Order.updateOne(markPaidFilter, {$set:paidFields}).exec();

    return markPaid.then(function(result) {
      return Order.findById(order._id).exec().then(function(updatedOrder) {
        if (!updatedOrder) {
          throw new Error('The payment order no longer exists.');
        }
        var updatedPayment = updatedOrder.payments.find(function(entry) {
          return entry.method === 'razorpay' && entry.providerOrderId === providerOrderId;
        });
        if (!updatedPayment || updatedPayment.status !== 'paid' ||
            updatedPayment.providerPaymentId !== payment.id) {
          throw new Error('A different payment has already been recorded for this order.');
        }
        if (!result.nModified && updatedOrder.orderStatus !== 'cancelled') {
          return updatedOrder;
        }
        if (updatedOrder.orderStatus !== 'cancelled') {
          return updatedOrder;
        }

        var refundKey = 'razorpay-refund:' + updatedOrder._id.toString();
        var priorRefund = updatedOrder.refunds.find(function(refund) {
          return refund.idempotencyKey === refundKey;
        });
        if (priorRefund) {
          updatedOrder.refundStatus = summarizeRefundStatus(updatedOrder);
          updatedOrder.paymentStatus = updatedOrder.refundStatus === 'completed' ? 'refunded' : 'refund_pending';
          return updatedOrder.save();
        }

        return razorpay.createRefund(
          config.razorpayKeyId,
          config.razorpayKeySecret,
          payment.id,
          updatedOrder.onlinePaidPaise,
          crypto.createHash('sha256').update(refundKey).digest('hex').slice(0, 40)
        ).then(function(refund) {
          updatedOrder.refunds.push({
            idempotencyKey:refundKey,
            method:'razorpay',
            amountPaise:updatedOrder.onlinePaidPaise,
            status:refund.status || 'pending',
            providerRefundId:refund.id,
            createdAt:new Date()
          });
          updatedOrder.refundStatus = summarizeRefundStatus(updatedOrder);
          updatedOrder.paymentStatus = updatedOrder.refundStatus === 'completed' ? 'refunded' : 'refund_pending';
          return updatedOrder.save();
        });
      });
    });
  });
}

function markRazorpayFailure(providerOrderId, payment) {
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  return Order.findOne({razorpayOrderId:providerOrderId}).exec().then(function(order) {
    if (!order) {
      throw new Error('The failed payment does not match an order.');
    }
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
      return order;
    }
    if (payment.order_id !== providerOrderId ||
        Number(payment.amount) !== order.onlinePaidPaise ||
        payment.currency !== 'INR' ||
        payment.status !== 'failed') {
      throw new Error('The failed payment does not match the order amount.');
    }
    var paymentEntry = order.payments.find(function(entry) {
      return entry.method === 'razorpay' && entry.providerOrderId === providerOrderId;
    });
    if (!paymentEntry || paymentEntry.status !== 'pending') {
      return order;
    }

    var failureStatus = orderState.paymentFailureOrderStatus(order.orderStatus);
    var fields = {
      'payments.$.status':'failed',
      'payments.$.providerPaymentId':payment.id,
      paymentStatus:order.walletPaidPaise ? 'partially_paid' : 'failed'
    };
    if (failureStatus) {
      fields.orderStatus = failureStatus;
    }

    return Order.updateOne({
      _id:order._id,
      razorpayOrderId:providerOrderId,
      orderStatus:{$in:['gateway_initializing','pending','payment_failed']},
      payments:{$elemMatch:{
        method:'razorpay',
        providerOrderId:providerOrderId,
        status:'pending'
      }}
    }, {$set:fields}).exec().then(function() {
      return Order.findById(order._id).exec();
    });
  });
}

router.post("/payments/razorpay/verify", requireAuthenticatedUser, function(req, res) {
  if (!paymentConfigurationPresent()) {
    return res.status(503).json({message:'Razorpay verification is not configured.'});
  }
  var providerOrderId = req.body && req.body.razorpay_order_id;
  var paymentId = req.body && req.body.razorpay_payment_id;
  var signature = req.body && req.body.razorpay_signature;
  if (typeof providerOrderId !== 'string' || typeof paymentId !== 'string' ||
      typeof signature !== 'string') {
    return res.status(400).json({message:'Razorpay payment details are required.'});
  }
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.findOne({razorpayOrderId:providerOrderId, userId:req.authUser.UserId}, function(err, order) {
    if (err) {
      return res.status(500).json({message:'Unable to verify payment.'});
    }
    if (!order || !razorpay.verifyPaymentSignature(
        config.razorpayKeySecret,
        providerOrderId,
        paymentId,
        signature)) {
      return res.status(401).json({message:'Payment verification failed.'});
    }

    razorpay.fetchPayment(config.razorpayKeyId, config.razorpayKeySecret, paymentId)
      .then(function(payment) {
        if (payment.id !== paymentId) {
          return res.status(401).json({message:'Payment verification failed.'});
        }
        return finalizeRazorpayCapture(providerOrderId, payment).then(function(updatedOrder) {
          return res.json({
            orderId:updatedOrder._id.toString(),
            paymentStatus:updatedOrder.paymentStatus,
            refundStatus:updatedOrder.refundStatus
          });
        });
      }).catch(function(verifyErr) {
        logger.error('Razorpay verification failed: ' + verifyErr.message);
        if (!res.headersSent) {
          res.status(502).json({message:'Unable to verify payment with Razorpay.'});
        }
      });
  });
});

router.post("/payments/razorpay/webhook", function(req, res) {
  if (!config.razorpayWebhookSecret) {
    return res.status(503).send('Razorpay webhook is not configured.');
  }
  if (!req.rawBody || !razorpay.verifyWebhookSignature(
      config.razorpayWebhookSecret,
      req.rawBody,
      req.headers['x-razorpay-signature'])) {
    return res.status(401).send('Invalid webhook signature.');
  }
  var eventId = req.headers['x-razorpay-event-id'];
  if (typeof eventId !== 'string' || !eventId) {
    return res.status(400).send('Missing event identifier.');
  }
  var eventType = req.body && req.body.event;
  var payment = req.body && req.body.payload &&
    req.body.payload.payment && req.body.payload.payment.entity;
  if (typeof eventType !== 'string') {
    return res.status(400).send('Invalid webhook event.');
  }

  var RazorpayEvent = mongooseConnections[pdt].model('RazorpayEvent', RazorpayEventSchema);
  var eventRecord = new RazorpayEvent({
    eventId:eventId,
    eventType:eventType,
    orderId:payment && payment.order_id,
    paymentId:payment && payment.id,
    status:'processing'
  });
  eventRecord.save(function(saveErr) {
    if (saveErr && !isDuplicateKeyError(saveErr)) {
      logger.error('Unable to persist Razorpay webhook event: ' + saveErr.message);
      return res.status(500).send('Unable to record payment event.');
    }

    var processEvent;
    if (eventType === 'payment.captured' && payment) {
      processEvent = finalizeRazorpayCapture(payment.order_id, payment);
    } else if (eventType === 'payment.failed' && payment) {
      processEvent = markRazorpayFailure(payment.order_id, payment);
    } else if (eventType === 'refund.processed') {
      var refund = req.body.payload && req.body.payload.refund && req.body.payload.refund.entity;
      processEvent = Promise.resolve().then(function() {
        if (!refund || !refund.id) {
          throw new Error('The refund event is incomplete.');
        }
        var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
        return Order.findOne({'refunds.providerRefundId':refund.id}).exec().then(function(order) {
          if (!order) {
            throw new Error('The refund event does not match an order.');
          }
          var refundEntry = order.refunds.find(function(entry) {
            return entry.providerRefundId === refund.id;
          });
          refundEntry.status = refund.status || 'processed';
          order.refundStatus = summarizeRefundStatus(order);
          if (order.refundStatus === 'completed') {
            order.paymentStatus = 'refunded';
          }
          return order.save();
        });
      });
    } else {
      processEvent = Promise.resolve();
      eventRecord.status = 'ignored';
    }

    var duplicateEvent = isDuplicateKeyError(saveErr);
    processEvent.then(function() {
      var finalStatus = eventRecord.status === 'ignored' ? 'ignored' : 'completed';
      if (duplicateEvent) {
        return RazorpayEvent.updateOne({eventId:eventId}, {$set:{status:finalStatus}});
      }
      eventRecord.status = finalStatus;
      return eventRecord.save();
    }).then(function() {
      res.status(200).send('Webhook processed.');
    }).catch(function(processErr) {
      logger.error('Razorpay webhook processing failed: ' + processErr.message);
      res.status(500).send('Unable to process payment event.');
    });
  });
});

router.post("/orders/:orderId/cancel", requireAuthenticatedUser, function(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
    return res.status(400).json({message:'A valid orderId is required.'});
  }
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.findOne({_id:req.params.orderId, userId:req.authUser.UserId}, function(err, order) {
    if (err) {
      return res.status(500).json({message:'Unable to cancel the order.'});
    }
    if (!order) {
      return res.status(404).json({message:'Order not found.'});
    }
    if (order.orderStatus === 'cancelled') {
      return res.json({orderId:order._id.toString(), orderStatus:order.orderStatus, refundStatus:order.refundStatus});
    }
    if (order.orderStatus !== 'pending' && order.orderStatus !== 'confirmed' &&
        order.orderStatus !== 'cancellation_pending') {
      return res.status(409).json({message:'Orders can only be cancelled before preparation starts.'});
    }

    var beginCancellation = function(order) {
    var capturedOnlinePayment = order.payments.find(function(payment) {
      return payment.method === 'razorpay' && payment.status === 'paid';
    });
    var walletRefundKey = 'wallet-cancel-refund:' + order._id.toString();
    var finishCancellation = function(refund) {
      if (!order.walletPaidPaise) {
        var update = {
          $set:{
            orderStatus:'cancelled',
            cancelledAt:new Date(),
            refundStatus:refund ? (refund.status === 'processed' ? 'completed' : 'pending') : 'none',
            paymentStatus:refund ? (refund.status === 'processed' ? 'refunded' : 'refund_pending') : order.paymentStatus
          }
        };
        if (refund) {
          update.$push = {refunds:{
            idempotencyKey:refund.key,
            method:'razorpay',
            amountPaise:refund.amountPaise,
            status:refund.status,
            providerRefundId:refund.providerRefundId,
            createdAt:new Date()
          }};
        }
        return Order.updateOne(
          {_id:order._id, userId:req.authUser.UserId, orderStatus:'cancellation_pending'},
          update
        ).then(function(result) {
          if (!result.nModified) {
            throw new Error('Order status changed during cancellation.');
          }
          return Order.findById(order._id).exec();
        });
      }

      return runMongoTransaction(function(session) {
        return Order.findOne({_id:order._id, userId:req.authUser.UserId}).session(session).exec().then(function(current) {
          if (!current || current.orderStatus !== 'cancellation_pending') {
            throw new Error('Order status changed during cancellation.');
          }
          var credit = current.walletPaidPaise &&
            !current.refunds.some(function(entry) { return entry.idempotencyKey === walletRefundKey; })
            ? creditWallet(
                current.userId,
                current.walletPaidPaise,
                session,
                current._id.toString(),
                walletRefundKey,
                'refund'
              )
            : Promise.resolve();
          return credit.then(function() {
            if (current.walletPaidPaise && !current.refunds.some(function(entry) {
              return entry.idempotencyKey === walletRefundKey;
            })) {
              current.refunds.push({
                idempotencyKey:walletRefundKey,
                method:'wallet',
                amountPaise:current.walletPaidPaise,
                status:'completed',
                createdAt:new Date()
              });
            }
            if (refund) {
              current.refunds.push({
                idempotencyKey:refund.key,
                method:'razorpay',
                amountPaise:refund.amountPaise,
                status:refund.status,
                providerRefundId:refund.providerRefundId,
                createdAt:new Date()
              });
            }
            current.orderStatus = 'cancelled';
            current.cancelledAt = new Date();
            current.refundStatus = summarizeRefundStatus(current);
            if (current.refundStatus === 'completed') {
              current.paymentStatus = 'refunded';
            } else if (current.refundStatus !== 'none') {
              current.paymentStatus = 'refund_pending';
            }
            return current.save({session:session});
          });
        });
      });
    };

    var refundPromise = Promise.resolve(null);
    if (capturedOnlinePayment) {
      if (!paymentConfigurationPresent() || !capturedOnlinePayment.providerPaymentId) {
        return res.status(503).json({message:'Online refund cannot be processed right now.'});
      }
      var refundKey = 'razorpay-refund:' + order._id.toString();
      var existingRefund = order.refunds.find(function(entry) {
        return entry.idempotencyKey === refundKey;
      });
      if (existingRefund) {
        return res.status(202).json({
          orderId:order._id.toString(),
          orderStatus:order.orderStatus,
          refundStatus:order.refundStatus
        });
      }

      refundPromise = razorpay.createRefund(
          config.razorpayKeyId,
          config.razorpayKeySecret,
          capturedOnlinePayment.providerPaymentId,
          order.onlinePaidPaise,
          crypto.createHash('sha256').update(refundKey).digest('hex').slice(0, 40)
        ).then(function(providerRefund) {
          return {key:refundKey, amountPaise:order.onlinePaidPaise,
            status:providerRefund.status || 'pending', providerRefundId:providerRefund.id};
        });
    }

    refundPromise.then(function(refund) {
      return finishCancellation(refund);
    }).then(function(updatedOrder) {
      return getAvailableWalletPaise(req.authUser.UserId).then(function(balance) {
        res.json({
          orderId:updatedOrder._id.toString(),
          orderStatus:updatedOrder.orderStatus,
          refundStatus:updatedOrder.refundStatus,
          walletBalancePaise:balance,
          walletBalance:moneyFromPaise(balance)
        });
      });
    }).catch(function(cancelErr) {
      logger.error('Order cancellation failed: ' + cancelErr.message);
      if (transactionSupportError(cancelErr)) {
        return res.status(503).json({message:'Refund processing requires MongoDB transaction support.'});
      }
      if (cancelErr.message === 'Order status changed during cancellation.') {
        return res.status(409).json({message:cancelErr.message});
      }
      if (capturedOnlinePayment && !res.headersSent) {
        return res.status(202).json({message:'Cancellation is pending refund reconciliation.'});
      }
      if (!res.headersSent) {
        res.status(500).json({message:'Unable to complete cancellation.'});
      }
    });
    };

    if (order.orderStatus === 'cancellation_pending') {
      return beginCancellation(order);
    }
    Order.updateOne(
      {_id:order._id, userId:req.authUser.UserId, orderStatus:{$in:['pending','confirmed']}},
      {$set:{orderStatus:'cancellation_pending', refundStatus:'processing'}}
    ).exec().then(function(result) {
      if (!result.nModified) {
        throw new Error('Order status changed during cancellation.');
      }
      return Order.findOne({_id:order._id, userId:req.authUser.UserId}).exec();
    }).then(function(lockedOrder) {
      if (!lockedOrder) {
        throw new Error('Order not found after cancellation lock.');
      }
      beginCancellation(lockedOrder);
    }).catch(function(lockErr) {
      logger.error('Order cancellation lock failed: ' + lockErr.message);
      if (!res.headersSent) {
        res.status(lockErr.message === 'Order status changed during cancellation.' ? 409 : 500)
          .json({message:'Unable to begin order cancellation.'});
      }
    });
  });
});

router.put("/orders/:orderId/status", requireAuthenticatedUser, requireAdmin, function(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
    return res.status(400).json({message:'A valid orderId is required.'});
  }
  var nextStatus = req.body && req.body.status;
  var transitions = {
    pending:['confirmed'],
    confirmed:['preparing'],
    preparing:['out_for_delivery'],
    out_for_delivery:['completed']
  };
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.findById(req.params.orderId, function(err, order) {
    if (err) {
      return res.status(500).json({message:'Unable to update order status.'});
    }
    if (!order) {
      return res.status(404).json({message:'Order not found.'});
    }
    if (!transitions[order.orderStatus] || transitions[order.orderStatus].indexOf(nextStatus) === -1) {
      return res.status(409).json({message:'Invalid order status transition.'});
    }
    if (orderState.hasUnsettledOnlinePayment(order)) {
      return res.status(409).json({message:'Online payment must be verified before fulfilling this order.'});
    }
    var statusFilter = {_id:order._id, orderStatus:order.orderStatus};
    var statusUpdate = {$set:{orderStatus:nextStatus}};
    var paymentStatus = order.paymentStatus;
    if (nextStatus === 'completed') {
      paymentStatus = 'paid';
      statusUpdate.$set.paymentStatus = paymentStatus;
      if (order.codDuePaise) {
        statusFilter.payments = {$elemMatch:{method:'cod', status:'due'}};
        statusUpdate.$set['payments.$.status'] = 'paid';
        statusUpdate.$set['payments.$.paidAt'] = new Date();
      }
    }
    Order.updateOne(statusFilter, statusUpdate, function(updateErr, result) {
      if (updateErr) {
        return res.status(500).json({message:'Unable to update order status.'});
      }
      if (!result.nModified) {
        return res.status(409).json({message:'Order status changed before this update.'});
      }
      res.json({orderId:order._id.toString(), orderStatus:nextStatus, paymentStatus:paymentStatus});
    });
  });
});

router.post("/orders/:orderId/cod-refund", requireAuthenticatedUser, requireAdmin, function(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
    return res.status(400).json({message:'A valid orderId is required.'});
  }
  var amountPaise = req.body && req.body.amountPaise;
  var idempotencyKey = req.headers['idempotency-key'];
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 ||
      typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
    return res.status(400).json({message:'A positive amountPaise and Idempotency-Key are required.'});
  }

  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  var scopedKey = 'cod-refund:' + req.params.orderId + ':' + idempotencyKey;
  runMongoTransaction(function(session) {
    return Order.findById(req.params.orderId).session(session).exec().then(function(order) {
      if (!order) {
        throw new Error('Order not found.');
      }
      var codPayment = order.payments.find(function(payment) {
        return payment.method === 'cod' && payment.status === 'paid';
      });
      if (!codPayment || order.orderStatus !== 'completed') {
        throw new Error('A collected COD payment must be completed before refund.');
      }
      var alreadyRefunded = order.refunds.reduce(function(total, refund) {
        return total + (refund.method === 'wallet' && refund.status === 'completed' &&
          typeof refund.idempotencyKey === 'string' &&
          refund.idempotencyKey.indexOf('cod-refund:') === 0
          ? refund.amountPaise
          : 0);
      }, 0);
      if (amountPaise > codPayment.amountPaise - alreadyRefunded) {
        throw new Error('Refund exceeds the remaining collected COD amount.');
      }
      return creditWallet(
        order.userId,
        amountPaise,
        session,
        order._id.toString(),
        scopedKey,
        'refund'
      ).then(function() {
        order.refunds.push({
          idempotencyKey:scopedKey,
          method:'wallet',
          amountPaise:amountPaise,
          status:'completed',
          createdAt:new Date(),
          approvedBy:req.authUser.username
        });
        order.refundStatus = summarizeRefundStatus(order);
        return order.save({session:session});
      });
    });
  }).then(function(order) {
    res.json({
      orderId:order._id.toString(),
      refundStatus:order.refundStatus,
      amountPaise:amountPaise
    });
  }).catch(function(refundErr) {
    if (isDuplicateKeyError(refundErr)) {
      return res.status(409).json({message:'This refund has already been processed.'});
    }
    if (transactionSupportError(refundErr)) {
      return res.status(503).json({message:'COD refunds require MongoDB transaction support.'});
    }
    if (refundErr.message === 'Order not found.') {
      return res.status(404).json({message:refundErr.message});
    }
    if (/must be completed|exceeds/.test(refundErr.message)) {
      return res.status(409).json({message:refundErr.message});
    }
    logger.error('COD refund failed: ' + refundErr.message);
    res.status(500).json({message:'Unable to process COD refund.'});
  });
});

router.post("/orders/:orderId/online-refund", requireAuthenticatedUser, requireAdmin, function(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
    return res.status(400).json({message:'A valid orderId is required.'});
  }
  var amountPaise = req.body && req.body.amountPaise;
  var idempotencyKey = req.headers['idempotency-key'];
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 ||
      typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
    return res.status(400).json({message:'A positive amountPaise and Idempotency-Key are required.'});
  }
  if (!paymentConfigurationPresent()) {
    return res.status(503).json({message:'Razorpay refunds are not configured.'});
  }

  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  var refundKey = 'razorpay-admin-refund:' + req.params.orderId + ':' + idempotencyKey;
  runMongoTransaction(function(session) {
    return Order.findById(req.params.orderId).session(session).exec().then(function(order) {
      if (!order) {
        throw new Error('Order not found.');
      }
      var existing = order.refunds.find(function(refund) {
        return refund.idempotencyKey === refundKey;
      });
      if (existing) {
        return {order:order, existing:existing};
      }
      if (!order.razorpayPaymentId || !order.onlinePaidPaise) {
        throw new Error('No captured online payment is available for refund.');
      }
      var reservedRefundPaise = order.refunds.reduce(function(total, refund) {
        return total + (refund.method === 'razorpay' && refund.status !== 'failed'
          ? refund.amountPaise
          : 0);
      }, 0);
      if (amountPaise > order.onlinePaidPaise - reservedRefundPaise) {
        throw new Error('Refund exceeds the remaining online payment amount.');
      }
      order.refunds.push({
        idempotencyKey:refundKey,
        method:'razorpay',
        amountPaise:amountPaise,
        status:'requested',
        createdAt:new Date(),
        approvedBy:req.authUser.username
      });
      order.refundStatus = 'pending';
      return order.save({session:session}).then(function(savedOrder) {
        return {order:savedOrder, existing:null};
      });
    });
  }).then(function(result) {
    if (result.existing) {
      return res.status(202).json({
        orderId:result.order._id.toString(),
        refundStatus:result.order.refundStatus
      });
    }
    var receipt = crypto.createHash('sha256').update(refundKey).digest('hex').slice(0, 40);
    return razorpay.createRefund(
      config.razorpayKeyId,
      config.razorpayKeySecret,
      result.order.razorpayPaymentId,
      amountPaise,
      receipt
    ).then(function(providerRefund) {
      var refundStatus = providerRefund.status || 'pending';
      return Order.updateOne(
        {_id:result.order._id, 'refunds.idempotencyKey':refundKey},
        {$set:{
          'refunds.$.status':refundStatus,
          'refunds.$.providerRefundId':providerRefund.id
        }}
      ).then(function() {
        return Order.findById(result.order._id).exec();
      }).then(function(updatedOrder) {
        updatedOrder.refundStatus = summarizeRefundStatus(updatedOrder);
        if (updatedOrder.refundStatus === 'completed') {
          updatedOrder.paymentStatus = 'refunded';
        }
        return updatedOrder.save().then(function() {
          res.status(202).json({
            orderId:updatedOrder._id.toString(),
            refundStatus:updatedOrder.refundStatus,
            refundId:providerRefund.id,
            amountPaise:amountPaise
          });
        });
      });
    }).catch(function(gatewayErr) {
      logger.error('Razorpay refund request failed: ' + gatewayErr.message);
      if (!res.headersSent) {
        res.status(202).json({
          orderId:result.order._id.toString(),
          refundStatus:'pending_reconciliation'
        });
      }
    });
  }).catch(function(refundErr) {
    if (transactionSupportError(refundErr)) {
      return res.status(503).json({message:'Online refunds require MongoDB transaction support.'});
    }
    if (refundErr.message === 'Order not found.') {
      return res.status(404).json({message:refundErr.message});
    }
    if (/No captured online payment|exceeds the remaining/.test(refundErr.message)) {
      return res.status(409).json({message:refundErr.message});
    }
    logger.error('Online refund failed: ' + refundErr.message);
    res.status(500).json({message:'Unable to process online refund.'});
  });
});

router.get("/orders/:orderId", requireAuthenticatedUser, function(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
    return res.status(400).json({message:'A valid orderId is required.'});
  }
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.findOne({_id:req.params.orderId, userId:req.authUser.UserId}, function(err, order) {
    if (err) {
      return res.status(500).json({message:'Unable to retrieve order.'});
    }
    if (!order) {
      return res.status(404).json({message:'Order not found.'});
    }
    res.json({
      orderId:order._id.toString(),
      orderStatus:order.orderStatus,
      paymentStatus:order.paymentStatus,
      refundStatus:order.refundStatus,
      currency:order.currency,
      items:order.items,
      subtotalPaise:order.subtotalPaise,
      discountPaise:order.discountPaise,
      taxableAmountPaise:order.taxableAmountPaise,
      taxPaise:order.taxPaise,
      deliveryFeePaise:order.deliveryFeePaise,
      totalPaise:order.totalPaise,
      walletPaidPaise:order.walletPaidPaise,
      onlinePaidPaise:order.onlinePaidPaise,
      codDuePaise:order.codDuePaise,
      payments:order.payments.map(function(payment) {
        return {
          method:payment.method,
          amountPaise:payment.amountPaise,
          status:payment.status,
          paidAt:payment.paidAt
        };
      }),
      refunds:order.refunds.map(function(refund) {
        return {
          method:refund.method,
          amountPaise:refund.amountPaise,
          status:refund.status,
          createdAt:refund.createdAt
        };
      })
    });
  });
});

router.get("/admin/orders", requireAuthenticatedUser, requireAdmin, function(req, res) {
  var filter = {};
  if (typeof req.query.status === 'string' && req.query.status.trim()) {
    filter.orderStatus = req.query.status.trim();
  }
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.find(filter)
    .sort({createdAt:-1})
    .limit(100)
    .select('userId username orderStatus paymentStatus refundStatus currency totalPaise walletPaidPaise onlinePaidPaise codDuePaise createdAt')
    .lean()
    .exec(function(err, orders) {
      if (err) {
        return res.status(500).json({message:'Unable to retrieve orders.'});
      }
      res.json({orders:orders});
    });
});

router.get("/admin/orders/:orderId", requireAuthenticatedUser, requireAdmin, function(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
    return res.status(400).json({message:'A valid orderId is required.'});
  }
  var Order = mongooseConnections[pdt].model('itemOrder', itemOrderSchema);
  Order.findById(req.params.orderId).lean().exec(function(err, order) {
    if (err) {
      return res.status(500).json({message:'Unable to retrieve order.'});
    }
    if (!order) {
      return res.status(404).json({message:'Order not found.'});
    }
    res.json({order:order});
  });
});

router.post("/addToCart", requireAuthenticatedUser, function(req, res) {
  buildQuote(orderLinesFromBody(req.body || {}), function(err, quote) {
    if (err) {
      if (err instanceof pricing.PricingError) {
        return res.status(400).json({message:err.message});
      }
      logger.error('Cart pricing failed: ' + err.message);
      return res.status(500).json({message:'Unable to price the cart.'});
    }

    var ItemCart = mongooseConnections[pdt].model('ItemCart', itemCartSchema);
    var item = new ItemCart({
      itemDetails:quote.items.map(function(line) {
        return {
          itemId:line.itemId,
          quantityId:line.quantityId,
          itemName:line.itemName,
          quantityName:line.quantityName,
          unitPricePaise:line.unitPricePaise,
          lineTotalPaise:line.lineTotalPaise,
          itemQuantity:line.quantity
        };
      }),
      userId:req.authUser.UserId,
      username:req.authUser.username,
      itemCartDate:new Date(),
      currency:quote.currency,
      subtotalPaise:quote.subtotalPaise,
      totalPaise:quote.totalPaise,
      taxPaid:0,
      taxesTotal:0,
      NetTotal:Number(moneyFromPaise(quote.totalPaise)),
      itemTotal:quote.items.reduce(function(total, line) {
        return total + line.quantity;
      }, 0),
      couponApplied:0,
      totalAmountPaid:0
    });

    item.save(function(saveErr) {
      if (saveErr) {
        logger.error('Cart save failed: ' + saveErr.message);
        return res.status(500).json({message:'Unable to save the cart.'});
      }
      return res.status(201).json({cartId:item._id, GetData:item});
    });
  });
});



     
router.get("/GetItemsCategoryById",  function(req, res) {
   // var token = getToken(req.headers);
    var cat=Number(req.query.CatId)
    if (!Number.isSafeInteger(cat) || cat <= 0) {
      return res.status(400).json({message:'A valid CatId is required.'});
    }
    var userId=Number(req.query.UserId);
    var userId=req.query.UserId
   // if(token)
  //  {
      
        var items = mongooseConnections[pdt].model('items', itemSchema);
        items.find({"categoryId":cat},//,"likes.userId":userId
        {'_id':0,'itemId':1,'name':1,'itemRatings.ratingLevel':1,'landingImage':1,"likes.userId":1,"likes.isLike":1,"likes.isFavorite":1,"likes.userfullname":1,"spiceLevel":1,"description":1,"quantity.display":1,"quantity.amount":1,"isNonVeg":1,"images.image":1,"companyId":1,"branchId":1},
        function(err, item)
         {
            
          if(err)
            {
                logger.error('Methode : GetItemsCategoryById And Showing Error : - '+err);
            res.status(401).json({GetData:"no such user found"});
            }
            else
            {
              var result = findRemoveSync(publicDir, {age: {seconds: 86400}, extensions: ['.webp','.png','.jpg','.JPG','.gif'], limit: 10})//
              item.forEach(function(itemObj){
                var likeCount=0;
                var totalrating=0;
                var ratings=Array.isArray(itemObj._doc.itemRatings) ? itemObj._doc.itemRatings : [];
                var likes=Array.isArray(itemObj._doc.likes) ? itemObj._doc.likes : [];
                var images=Array.isArray(itemObj._doc.images) ? itemObj._doc.images : [];
               
                 ratings.forEach(function(rat){
                  totalrating=totalrating+(Number(rat.ratingLevel) || 0);
                 })
                 itemObj._doc.avgRating=ratings.length ? totalrating/ratings.length : 0;
               

                 likes.forEach(function(lik){
                   if(lik.isLike)
                  likeCount=likeCount+1;
                 });

                 itemObj._doc.LikeCount=likeCount;
                 var firstImage=images[0] && (images[0]._doc || images[0]);
                 var firstLike=Number.isSafeInteger(userId)
                   ? likes.map(function(entry) { return entry._doc || entry; })
                       .find(function(entry) { return entry.userId === userId; })
                   : null;
                 itemObj._doc.CategoryImageUrl=firstImage ? firstImage.image : null;
                 itemObj._doc.isLike=firstLike ? Boolean(firstLike.isLike) : false;
                 itemObj._doc.isFavorite=firstLike ? Boolean(firstLike.isFavorite) : false;
                 itemObj._doc.UserName=firstLike ? firstLike.userfullname : '';
                 
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
     var Itemid=Number(req.query.Itemid)
     if (!Number.isSafeInteger(Itemid) || Itemid <= 0) {
       return res.status(400).json({message:'A valid Itemid is required.'});
     }
     var userId=Number(req.query.UserId);
    // if(token)
   //  {
       
         var items = mongooseConnections[pdt].model('items', itemSchema);
         items.findOne({"itemId": Itemid},
         {'_id':0,'name':1,'itemRatings.ratingLevel':1,'landingImage':1,"likes.userId":1,"likes.isLike":1,"likes.isFavorite":1,"likes.userfullname":1,"spiceLevel":1,"description":1,"quantity.display":1,"quantity.amount":1,"isNonVeg":1,"images.image":1,"companyId":1,"branchId":1,"comments":1},
         function(err, itemObj)
          {
             
           if(err)
             {

                logger.error('Methode : GetItemById And Showing Error : - '+err);
             res.status(401).json({GetData:"no such user found"});
             }
             else if (!itemObj) {
               return res.status(404).json({message:'Item not found.'});
             }
             else
               {
                //logger.info("Test Message");
                
               var result = findRemoveSync(publicDir, {age: {seconds: 86400}, extensions: ['.webp','.png','.jpg','.JPG','.gif'], limit: 10})
              // item.forEach(function(itemObj){
                 var totalrating=0;
                 var ratings=Array.isArray(itemObj._doc.itemRatings) ? itemObj._doc.itemRatings : [];
                 var likes=Array.isArray(itemObj._doc.likes) ? itemObj._doc.likes : [];
                 var images=Array.isArray(itemObj._doc.images) ? itemObj._doc.images : [];
                
                  ratings.forEach(function(rat){
                   totalrating=totalrating+(Number(rat.ratingLevel) || 0);
                  })
                  itemObj._doc.avgRating=ratings.length ? totalrating/ratings.length : 0;
                
 
                  likes.forEach(function(lik){
                    if(lik.isLike)
                   itemObj._doc.LikeCount=(itemObj._doc.LikeCount || 0)+1;
                  });
 
                  var firstImage=images[0] && (images[0]._doc || images[0]);
                  var firstLike=Number.isSafeInteger(userId)
                    ? likes.map(function(entry) { return entry._doc || entry; })
                        .find(function(entry) { return entry.userId === userId; })
                    : null;
                  itemObj._doc.CategoryImageUrl=firstImage ? firstImage.image : null;
                  itemObj._doc.isLike=firstLike ? Boolean(firstLike.isLike) : false;
                  itemObj._doc.isFavorite=firstLike ? Boolean(firstLike.isFavorite) : false;
                  itemObj._doc.UserName=firstLike ? firstLike.userfullname : '';
                  
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

 router.post('/AddToFavourite',requireAuthenticatedUser,function(req,res){
   
   var username=req.authUser.username;
   var userId=req.authUser.UserId;
   var itemId=Number(req.body && req.body.itemId);
   var userfullname=req.authUser.name;
   var isLike=req.body && req.body.isLike;
   var isFavorite=req.body && req.body.isFavorite;
   var storedUsername=Number.isSafeInteger(Number(username)) ? Number(username) : undefined;
   if (!Number.isSafeInteger(itemId) || itemId <= 0 ||
       typeof isLike !== 'boolean' || typeof isFavorite !== 'boolean') {
       return res.status(400).json({message:'A valid itemId, isLike, and isFavorite are required.'});
   }

   var Itemschema=mongooseConnections[pdt].model('items',itemSchema);
   Itemschema.findOne({itemId:itemId},{likes:1},function(error,item) {
     if (error) {
       logger.error('Favorite lookup failed: ' + error.message);
       return res.status(500).json({message:'Unable to update favorites.'});
     }
     if (!item) {
       return res.status(404).json({message:'Item not found.'});
     }

     var likes=Array.isArray(item.likes) ? item.likes : [];
     if (!Array.isArray(item.likes)) {
       item.likes=[];
     }
     var existingLike=likes.find(function(entry) {
       return entry.userId === userId ||
         (!entry.userId && storedUsername !== undefined && entry.username === storedUsername);
     });
     var like=existingLike || {
       userId:userId,
       username:storedUsername,
       userfullname:userfullname || '',
       isLike:isLike,
       isFavorite:isFavorite
     };
     like.userId=userId;
     like.username=storedUsername;
     like.userfullname=userfullname || '';
     like.isLike=isLike;
     like.isFavorite=isFavorite;

     if (!existingLike) {
       item.likes.push(like);
     }

     item.save(function(saveErr) {
       if (saveErr) {
         logger.error('Favorite update failed: ' + saveErr.message);
         return res.status(500).json({message:'Unable to update favorites.'});
       }
       res.json({GetData:{
         userId:userId,
         username:like.username,
         userfullname:like.userfullname,
         isLike:like.isLike,
         isFavorite:like.isFavorite
       }});
     });
   });
 });
   
    router.post('/AddToComments',requireAuthenticatedUser,function(req,res){
   
        var username=req.authUser.username
        var itemId=req.body.itemId
        var userfullname=req.authUser.name
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
    router.post('/SendEmail',requireAuthenticatedUser,function(req,res){
    if (typeof req.body.message !== 'string' || !req.body.message.trim() || req.body.message.length > 10000) {
      return res.status(400).json({message:"A valid message is required."});
    }
    if (!config.smtpUser || !config.smtpPassword) {
      return res.status(503).json({message:"Email service is not configured."});
    }

    var userName=req.authUser.username;
    var Message=req.body.message;
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
        user: config.smtpUser,
        pass: config.smtpPassword
        }
    });
    
    var mailOptions = {
        from: config.smtpUser,
        to:   'ezifoodapp@gmail.com', //Ezi4949!@
        subject: userName,
        text:  Message,
        status:"Send Email to: ezifoodapp@gmail.com"
    };
    
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            logger.error('SendEmail failed: ' + error.message);
            return res.status(502).json({message:"Unable to send email."});
        } else {
        res.status(200).json({message:"Email sent."})
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
    res.status(404).json({message:"API endpoint not found."});
  });
/////////////////////////////////////// End When Url is Not Match ////////////////////////////////////////////////////////////

  mongooseConnections[pdt].on('error', function(err) {
    console.error('Restaurant database connection error:', err);
  });
  mongooseConnections[pdt].once('open', function() {
    console.log("Restaurant database connection established.");
  });

  app.use('/api', router);
  app.use('/images',express.static(publicDir));
  app.use('/dashboardimages',express.static(publicDashDir));
  var port = process.env.PORT || 8091;
  app.listen(port);
console.log('Punjab d Tadka service running on port ' + port ) ; //+ ' in ' + process.env.NODE_ENV + ' mode');
