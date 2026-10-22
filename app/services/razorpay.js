var crypto = require('crypto');
var https = require('https');

function secureHexEqual(expectedHex, providedHex) {
  if (typeof providedHex !== 'string' || !/^[a-f0-9]{64}$/i.test(providedHex)) {
    return false;
  }
  var expected = Buffer.from(expectedHex, 'hex');
  var provided = Buffer.from(providedHex, 'hex');
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

function verifyPaymentSignature(secret, orderId, paymentId, signature) {
  if (!secret || typeof orderId !== 'string' || typeof paymentId !== 'string') {
    return false;
  }
  var expected = crypto.createHmac('sha256', secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');
  return secureHexEqual(expected, signature);
}

function verifyWebhookSignature(secret, rawBody, signature) {
  if (!secret || !Buffer.isBuffer(rawBody)) {
    return false;
  }
  var expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return secureHexEqual(expected, signature);
}

function request(method, path, keyId, keySecret, body) {
  return new Promise(function(resolve, reject) {
    var requestBody = body ? Buffer.from(JSON.stringify(body)) : null;
    var req = https.request({
      hostname:'api.razorpay.com',
      path:path,
      method:method,
      auth:keyId + ':' + keySecret,
      headers:requestBody ? {
        'Content-Type':'application/json',
        'Content-Length':requestBody.length
      } : {}
    }, function(res) {
      var chunks = [];
      res.on('data', function(chunk) {
        chunks.push(chunk);
      });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var response;
        try {
          response = text ? JSON.parse(text) : {};
        } catch (parseErr) {
          return reject(new Error('Payment gateway returned an invalid response.'));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('Payment gateway request failed with status ' + res.statusCode + '.'));
        }
        resolve(response);
      });
    });

    req.setTimeout(10000, function() {
      req.destroy(new Error('Payment gateway request timed out.'));
    });
    req.on('error', reject);
    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

function createOrder(keyId, keySecret, amountPaise, receipt) {
  return request('POST', '/v1/orders', keyId, keySecret, {
    amount:amountPaise,
    currency:'INR',
    receipt:receipt,
    payment_capture:1
  });
}

function fetchPayment(keyId, keySecret, paymentId) {
  return request('GET', '/v1/payments/' + encodeURIComponent(paymentId), keyId, keySecret);
}

function createRefund(keyId, keySecret, paymentId, amountPaise, receipt) {
  return request('POST', '/v1/payments/' + encodeURIComponent(paymentId) + '/refund', keyId, keySecret, {
    amount:amountPaise,
    receipt:receipt
  });
}

module.exports = {
  verifyPaymentSignature:verifyPaymentSignature,
  verifyWebhookSignature:verifyWebhookSignature,
  createOrder:createOrder,
  fetchPayment:fetchPayment,
  createRefund:createRefund
};
