const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');

// POST /api/payment/create-checkout-session
// Mock endpoint to simulate creating a payment session
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        
        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required.' });
        }

        // In reality, this would call Stripe/LINE Pay to generate a session URL
        // We'll mock a success response with a fake URL
        const mockSessionUrl = `https://mock-payment-gateway.com/checkout/${productId}?q=${quantity || 1}`;
        
        res.json({ 
            success: true, 
            url: mockSessionUrl,
            message: 'Checkout session created (mocked)' 
        });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session.' });
    }
});

// POST /api/payment/webhook
// Mock endpoint to simulate a successful payment webhook from the provider
router.post('/webhook', async (req, res) => {
    try {
        // In a real scenario, you'd verify the webhook signature here
        const { eventType, paymentData } = req.body;

        if (eventType === 'payment_intent.succeeded') {
            // Trigger the notification to the company representative
            await notificationService.sendPurchaseAlert(paymentData);
            console.log('Processed successful payment webhook.');
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed.' });
    }
});

module.exports = router;
