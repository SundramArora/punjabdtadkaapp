var test = require('node:test');
var assert = require('node:assert/strict');
var crypto = require('crypto');
var razorpay = require('../app/services/razorpay');

test('verifies Razorpay payment signatures', function() {
  var secret = 'test-secret';
  var orderId = 'order_123';
  var paymentId = 'pay_456';
  var signature = crypto.createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  assert.equal(razorpay.verifyPaymentSignature(secret, orderId, paymentId, signature), true);
  assert.equal(razorpay.verifyPaymentSignature(secret, orderId, paymentId, '0'.repeat(64)), false);
  assert.equal(razorpay.verifyPaymentSignature(secret, orderId, paymentId, 'invalid'), false);
});

test('verifies Razorpay webhook signatures against raw request bytes', function() {
  var secret = 'webhook-test-secret';
  var body = Buffer.from('{"event":"payment.captured"}');
  var signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  assert.equal(razorpay.verifyWebhookSignature(secret, body, signature), true);
  assert.equal(razorpay.verifyWebhookSignature(secret, Buffer.from('tampered'), signature), false);
  assert.equal(razorpay.verifyWebhookSignature(secret, body, 'bad'), false);
});
