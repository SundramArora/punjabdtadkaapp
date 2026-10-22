var test = require('node:test');
var assert = require('node:assert/strict');
var checkout = require('../app/services/checkout');

test('supports a full wallet payment', function() {
  assert.deepEqual(
    checkout.calculatePaymentBreakdown(25000, 30000, 'wallet'),
    {walletPaidPaise:25000, onlinePaidPaise:0, codDuePaise:0}
  );
});

test('rejects a full wallet payment when the balance is insufficient', function() {
  assert.throws(
    function() { checkout.calculatePaymentBreakdown(25000, 24999, 'wallet'); },
    /Insufficient wallet balance/
  );
});

test('splits a wallet and online payment without a rounding gap', function() {
  assert.deepEqual(
    checkout.calculatePaymentBreakdown(12345, 4000, 'wallet_razorpay'),
    {walletPaidPaise:4000, onlinePaidPaise:8345, codDuePaise:0}
  );
});

test('splits a wallet and COD payment when allowed', function() {
  assert.deepEqual(
    checkout.calculatePaymentBreakdown(12345, 4000, 'wallet_cod'),
    {walletPaidPaise:4000, onlinePaidPaise:0, codDuePaise:8345}
  );
});

test('supports pure online and COD payments', function() {
  assert.deepEqual(
    checkout.calculatePaymentBreakdown(12345, 0, 'razorpay'),
    {walletPaidPaise:0, onlinePaidPaise:12345, codDuePaise:0}
  );
  assert.deepEqual(
    checkout.calculatePaymentBreakdown(12345, 0, 'cod'),
    {walletPaidPaise:0, onlinePaidPaise:0, codDuePaise:12345}
  );
});

test('rejects unsupported methods and invalid paise amounts', function() {
  assert.throws(
    function() { checkout.calculatePaymentBreakdown(100, 0, 'cash-app'); },
    /Unsupported payment method/
  );
  assert.throws(
    function() { checkout.calculatePaymentBreakdown(-1, 0, 'cod'); },
    /non-negative paise values/
  );
});
