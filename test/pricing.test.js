var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../app/services/pricing');

var menu = [
  {
    itemId:10,
    name:'Dal',
    displayName:'Dal Makhani',
    isAvailable:true,
    quantity:[
      {qtId:1, name:'Regular', display:'Regular', amount:125.50},
      {qtId:2, name:'Large', display:'Large', amount:200}
    ]
  },
  {
    itemId:11,
    name:'Lassi',
    isAvailable:true,
    quantity:[{qtId:1, name:'Glass', display:'Glass', amount:45}]
  }
];

test('prices current menu variants and returns an INR bill', function() {
  var quote = pricing.quoteOrder([
    {itemId:10, quantityId:1, quantity:2},
    {itemId:11, quantity:1}
  ], menu);

  assert.equal(quote.currency, 'INR');
  assert.equal(quote.subtotalPaise, 29600);
  assert.equal(quote.taxPaise, 0);
  assert.equal(quote.discountPaise, 0);
  assert.equal(quote.deliveryFeePaise, 0);
  assert.equal(quote.totalPaise, 29600);
  assert.equal(quote.items[0].lineTotalPaise, 25100);
});

test('uses a changed quantity and server price, not submitted client amounts', function() {
  var quote = pricing.quoteOrder([
    {itemId:10, quantityId:2, quantity:3, amount:0.01, discountAmount:999999}
  ], menu);

  assert.equal(quote.items[0].quantity, 3);
  assert.equal(quote.items[0].unitPricePaise, 20000);
  assert.equal(quote.totalPaise, 60000);
});

test('rejects expired or otherwise unconfigured coupons', function() {
  assert.throws(
    function() { pricing.quoteOrder([{itemId:11, quantity:1}], menu, 'EXPIRED'); },
    /Coupons and discounts are not configured/
  );
  assert.throws(
    function() { pricing.quoteOrder([{itemId:11, quantity:1}], menu, 'NOT-VALID'); },
    /Coupons and discounts are not configured/
  );
});

test('rejects unavailable items and unavailable quantity options', function() {
  var unavailableMenu = menu.concat([{
    itemId:12,
    isAvailable:false,
    quantity:[{qtId:1, amount:10}]
  }]);

  assert.throws(
    function() { pricing.quoteOrder([{itemId:12, quantity:1}], unavailableMenu); },
    /item is unavailable/
  );
  assert.throws(
    function() { pricing.quoteOrder([{itemId:10, quantityId:99, quantity:1}], menu); },
    /quantity option is unavailable/
  );
});

test('does not add tax to configured tax-inclusive prices when tax is disabled', function() {
  var quote = pricing.quoteOrder([{itemId:11, quantity:2}], menu);
  assert.equal(quote.taxableAmountPaise, 9000);
  assert.equal(quote.taxPaise, 0);
  assert.equal(quote.totalPaise, 9000);
});

test('rounds the menu price once to paise', function() {
  assert.equal(pricing.toPaise(1.005), 101);
});

test('requires a quantity option when an item has variants', function() {
  assert.throws(
    function() { pricing.quoteOrder([{itemId:10, quantity:1}], menu); },
    /quantity option is required/
  );
});
