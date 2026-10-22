var CURRENCY = 'INR';

function PricingError(message) {
  this.name = 'PricingError';
  this.message = message;
  Error.captureStackTrace(this, PricingError);
}

PricingError.prototype = Object.create(Error.prototype);
PricingError.prototype.constructor = PricingError;

function asPositiveInteger(value, fieldName) {
  var parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new PricingError(fieldName + ' must be a positive integer.');
  }
  return parsed;
}

function toPaise(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    throw new PricingError('The menu price is invalid.');
  }
  var paise = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(paise)) {
    throw new PricingError('The menu price is outside the supported range.');
  }
  return paise;
}

function quoteOrder(lines, menuItems, couponCode) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PricingError('At least one item is required.');
  }
  if (!Array.isArray(menuItems)) {
    throw new PricingError('Current menu pricing is unavailable.');
  }
  if (couponCode !== undefined && couponCode !== null && String(couponCode).trim() !== '') {
    throw new PricingError('Coupons and discounts are not configured.');
  }

  var itemsById = Object.create(null);
  menuItems.forEach(function(item) {
    itemsById[String(item.itemId)] = item;
  });

  var subtotalPaise = 0;
  var pricedItems = lines.map(function(line) {
    if (!line || typeof line !== 'object') {
      throw new PricingError('Each order line must be an object.');
    }

    var itemId = asPositiveInteger(line.itemId, 'itemId');
    var quantity = asPositiveInteger(
      line.quantity !== undefined ? line.quantity : line.itemQuantity,
      'quantity'
    );
    var item = itemsById[String(itemId)];
    if (!item || item.isAvailable === false) {
      throw new PricingError('An item is unavailable.');
    }

    var variants = Array.isArray(item.quantity) ? item.quantity : [];
    var quantityId = line.quantityId !== undefined ? line.quantityId : line.qtId;
    var variant;
    if (quantityId !== undefined && quantityId !== null) {
      var parsedQuantityId = asPositiveInteger(quantityId, 'quantityId');
      variant = variants.find(function(candidate) {
        return Number(candidate.qtId) === parsedQuantityId;
      });
    } else if (variants.length === 1) {
      variant = variants[0];
    } else {
      throw new PricingError('A valid quantity option is required.');
    }
    if (!variant) {
      throw new PricingError('The selected quantity option is unavailable.');
    }

    var unitPricePaise = toPaise(variant.amount);
    if (unitPricePaise <= 0) {
      throw new PricingError('The menu price is invalid.');
    }
    var lineTotalPaise = unitPricePaise * quantity;
    if (!Number.isSafeInteger(lineTotalPaise) ||
        !Number.isSafeInteger(subtotalPaise + lineTotalPaise)) {
      throw new PricingError('The order total is outside the supported range.');
    }
    subtotalPaise += lineTotalPaise;

    var selectedQuantityId = asPositiveInteger(variant.qtId, 'quantityId');
    return {
      itemId:itemId,
      quantityId:selectedQuantityId,
      itemName:String(item.displayName || item.name || ''),
      quantityName:String(variant.display || variant.name || ''),
      quantity:quantity,
      unitPricePaise:unitPricePaise,
      lineTotalPaise:lineTotalPaise
    };
  });

  return {
    currency:CURRENCY,
    items:pricedItems,
    subtotalPaise:subtotalPaise,
    discountPaise:0,
    taxableAmountPaise:subtotalPaise,
    taxPaise:0,
    deliveryFeePaise:0,
    totalPaise:subtotalPaise
  };
}

module.exports = {
  CURRENCY:CURRENCY,
  PricingError:PricingError,
  quoteOrder:quoteOrder,
  toPaise:toPaise
};
