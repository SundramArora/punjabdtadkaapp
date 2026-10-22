var test = require('node:test');
var assert = require('node:assert/strict');
var orderState = require('../app/services/order-state');

test('blocks fulfillment while any online payment portion is unsettled', function() {
  assert.equal(orderState.hasUnsettledOnlinePayment({
    onlinePaidPaise:5000,
    payments:[{method:'razorpay', amountPaise:5000, status:'pending'}]
  }), true);

  assert.equal(orderState.hasUnsettledOnlinePayment({
    onlinePaidPaise:5000,
    payments:[{method:'razorpay', amountPaise:5000, status:'paid'}]
  }), false);
});

test('does not require an online payment for COD or wallet-only orders', function() {
  assert.equal(orderState.hasUnsettledOnlinePayment({
    onlinePaidPaise:0,
    payments:[{method:'cod', amountPaise:5000, status:'due'}]
  }), false);
  assert.equal(orderState.hasUnsettledOnlinePayment({
    onlinePaidPaise:undefined,
    payments:[{method:'wallet', amountPaise:5000, status:'paid'}]
  }), false);
});

test('moves retryable failed payment orders into payment_failed', function() {
  assert.equal(orderState.paymentFailureOrderStatus('gateway_initializing'), 'payment_failed');
  assert.equal(orderState.paymentFailureOrderStatus('pending'), 'payment_failed');
  assert.equal(orderState.paymentFailureOrderStatus('confirmed'), null);
});

test('returns a failed order to pending when the online payment later succeeds', function() {
  assert.equal(orderState.orderStatusAfterOnlineCapture('payment_failed'), 'pending');
  assert.equal(orderState.orderStatusAfterOnlineCapture('confirmed'), 'confirmed');
});
