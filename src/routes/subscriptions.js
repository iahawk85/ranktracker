const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = Router();

/**
 * POST /api/subscriptions/create-checkout
 * Creates a Stripe Checkout Session for the Pro plan ($19/mo).
 * Returns the session URL for redirect.
 */
router.post('/create-checkout', requireAuth, async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY.' });
  }

  try {
    const stripe = require('stripe')(stripeKey);
    const db = getDb();

    // Get user info to find/create Stripe customer
    const user = db.prepare('SELECT id, email, stripe_customer_id FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let customerId = user.stripe_customer_id;

    // Create a Stripe customer if this user doesn't have one yet
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: String(user.id) },
      });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id);
    }

    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Rank Tracker Pro',
            description: 'Unlimited keywords, daily rank checks',
          },
          unit_amount: 1900, // $19.00 in cents
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/?subscription=success`,
      cancel_url: `${baseUrl}/?subscription=canceled`,
      metadata: { user_id: String(user.id) },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[subscriptions] Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

/**
 * GET /api/subscriptions/portal
 * Creates a Stripe Customer Portal session for managing the subscription.
 */
router.get('/portal', requireAuth, async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY.' });
  }

  try {
    const stripe = require('stripe')(stripeKey);
    const db = getDb();

    const user = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(req.session.userId);
    if (!user || !user.stripe_customer_id) {
      return res.status(400).json({ error: 'No subscription found. Please subscribe first.' });
    }

    const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl}/`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[subscriptions] Portal error:', err.message);
    res.status(500).json({ error: 'Failed to create portal session.' });
  }
});

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 */
router.post('/webhook', async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured.' });
  }

  let event;
  try {
    const stripe = require('stripe')(stripeKey);

    if (webhookSecret) {
      // Verify webhook signature
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // No secret configured — parse body directly (test mode only)
      event = req.body;
    }
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const db = getDb();

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const userId = session.metadata?.user_id;

      if (userId) {
        db.prepare(`
          UPDATE users
          SET tier = 'pro',
              stripe_customer_id = ?,
              stripe_subscription_id = ?,
              subscription_status = 'active'
          WHERE id = ?
        `).run(customerId, subscriptionId, userId);
        console.log(`[stripe-webhook] User ${userId} upgraded to Pro`);
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const subscription = event.data.object;
      const status = subscription.status; // active, past_due, canceled, etc.
      const customerId = subscription.customer;

      const user = db.prepare('SELECT id FROM users WHERE stripe_customer_id = ?').get(customerId);
      if (user) {
        const tier = status === 'active' || status === 'trialing' ? 'pro' : 'free';
        db.prepare(`
          UPDATE users
          SET tier = ?,
              stripe_subscription_id = ?,
              subscription_status = ?
          WHERE id = ?
        `).run(tier, subscription.id, status, user.id);
        console.log(`[stripe-webhook] User ${user.id} subscription ${status}, tier=${tier}`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const user = db.prepare('SELECT id FROM users WHERE stripe_customer_id = ?').get(customerId);
      if (user) {
        db.prepare(`
          UPDATE users
          SET tier = 'free',
              stripe_subscription_id = ?,
              subscription_status = 'canceled'
          WHERE id = ?
        `).run(subscription.id, user.id);
        console.log(`[stripe-webhook] User ${user.id} subscription canceled, reverted to free`);
      }
      break;
    }

    default:
      console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;