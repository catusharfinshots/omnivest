// Razorpay Checkout: load the script once, open a prepared order, resolve with the payment response.
const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC; s.async = true;
      s.onload = () => resolve(window.Razorpay);
      s.onerror = () => { loading = null; reject(new Error('Could not load the payment window. Check your connection and try again.')); };
      document.body.appendChild(s);
    });
  }
  return loading;
}

/**
 * Opens checkout for an order created by POST /payments/orders.
 * In mock mode (no Razorpay account yet) there is no window: a fake payment id is returned so the
 * server-side verification path can be exercised end to end.
 */
export async function openCheckout(order, theme = '#6C2BD9') {
  if (order.mode === 'mock') {
    const payment_id = `pay_mock_${Math.random().toString(36).slice(2, 12)}`;
    return { razorpay_order_id: order.order_id, razorpay_payment_id: payment_id, razorpay_signature: null, mock: true };
  }
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
      name: order.name, description: order.description, prefill: order.prefill, notes: order.notes,
      theme: { color: theme },
      handler: (resp) => resolve(resp),
      modal: { ondismiss: () => reject(new Error('Payment window closed')) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment failed')));
    rzp.open();
  });
}
