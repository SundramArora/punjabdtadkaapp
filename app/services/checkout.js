function calculatePaymentBreakdown(totalPaise, walletBalancePaise, method) {
  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0 ||
      !Number.isSafeInteger(walletBalancePaise) || walletBalancePaise < 0) {
    throw new Error('Order total and wallet balance must be non-negative paise values.');
  }
  var supportedMethods = ['cod', 'razorpay', 'wallet', 'wallet_cod', 'wallet_razorpay'];
  if (supportedMethods.indexOf(method) === -1) {
    throw new Error('Unsupported payment method.');
  }

  var walletPaidPaise = 0;
  var onlinePaidPaise = 0;
  var codDuePaise = 0;
  if (method === 'wallet') {
    if (walletBalancePaise < totalPaise) {
      throw new Error('Insufficient wallet balance.');
    }
    walletPaidPaise = totalPaise;
  } else if (method === 'wallet_cod' || method === 'wallet_razorpay') {
    walletPaidPaise = Math.min(walletBalancePaise, totalPaise);
    var remainingPaise = totalPaise - walletPaidPaise;
    if (method === 'wallet_cod') {
      codDuePaise = remainingPaise;
    } else {
      onlinePaidPaise = remainingPaise;
    }
  } else if (method === 'cod') {
    codDuePaise = totalPaise;
  } else {
    onlinePaidPaise = totalPaise;
  }

  return {
    walletPaidPaise:walletPaidPaise,
    onlinePaidPaise:onlinePaidPaise,
    codDuePaise:codDuePaise
  };
}

module.exports = {
  calculatePaymentBreakdown:calculatePaymentBreakdown
};
