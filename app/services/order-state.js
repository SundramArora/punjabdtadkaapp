function hasUnsettledOnlinePayment(order) {
  if (!order || !Number.isSafeInteger(order.onlinePaidPaise) || order.onlinePaidPaise <= 0) {
    return false;
  }

  return !Array.isArray(order.payments) || !order.payments.some(function(payment) {
    return payment.method === 'razorpay' &&
      payment.status === 'paid' &&
      payment.amountPaise === order.onlinePaidPaise;
  });
}

function paymentFailureOrderStatus(orderStatus) {
  if (orderStatus === 'gateway_initializing' || orderStatus === 'pending' ||
      orderStatus === 'payment_failed') {
    return 'payment_failed';
  }
  return null;
}

function orderStatusAfterOnlineCapture(orderStatus) {
  return orderStatus === 'payment_failed' ? 'pending' : orderStatus;
}

module.exports = {
  hasUnsettledOnlinePayment:hasUnsettledOnlinePayment,
  paymentFailureOrderStatus:paymentFailureOrderStatus,
  orderStatusAfterOnlineCapture:orderStatusAfterOnlineCapture
};
