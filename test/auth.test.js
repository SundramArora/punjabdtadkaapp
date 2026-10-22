var test = require('node:test');
var assert = require('node:assert/strict');
var jwt = require('jsonwebtoken');
var mongoose = require('mongoose');
var createAuthentication = require('../app/middleware/auth');

var secret = 'test-signing-secret-that-is-long-enough';
var userId = new mongoose.Types.ObjectId().toString();

function createMiddleware(user) {
  var User = {
    findById:function(id, projection, callback) {
      process.nextTick(function() {
        callback(null, user);
      });
    }
  };
  var connection = {
    model:function() {
      return User;
    }
  };
  return createAuthentication(connection, {}, secret);
}

function invoke(middleware, request) {
  return new Promise(function(resolve) {
    var response = {
      statusCode:200,
      body:null,
      status:function(code) {
        this.statusCode=code;
        return this;
      },
      json:function(body) {
        this.body=body;
        resolve({statusCode:this.statusCode, body:body});
      }
    };
    middleware(request, response, function(error) {
      resolve({error:error, request:request});
    });
  });
}

test('requires a token and rejects a token without a valid account identity', async function() {
  var authentication=createMiddleware({username:'customer', UserId:1});
  var missing=await invoke(authentication.authenticate, {headers:{}});
  assert.equal(missing.statusCode, 401);

  var invalidToken=jwt.sign({id:'not-an-object-id'}, secret, {algorithm:'HS256'});
  var invalid=await invoke(authentication.authenticate, {
    headers:{authorization:'Bearer ' + invalidToken}
  });
  assert.equal(invalid.statusCode, 401);
});

test('loads the account from storage and rejects accounts without a stable UserId', async function() {
  var validToken=jwt.sign({_id:userId}, secret, {algorithm:'HS256'});
  var valid=await invoke(createMiddleware({
    username:'customer',
    UserId:12,
    roles:[{role:'admin'}]
  }).authenticate, {
    headers:{'x-access-token':validToken}
  });
  assert.equal(valid.request.authUser.UserId, 12);

  var invalid=await invoke(createMiddleware({
    username:'customer',
    roles:[]
  }).authenticate, {
    headers:{'x-access-token':validToken}
  });
  assert.equal(invalid.statusCode, 401);
});

test('enforces roles from the loaded account', async function() {
  var authentication=createMiddleware({username:'customer', UserId:12, roles:[]});
  var result=await invoke(authentication.requireRole('admin'), {authUser:{roles:[]}});
  assert.equal(result.statusCode, 403);
});
