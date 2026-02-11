const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Product configurations
const PRODUCTS = {
    'recovery-roadmap': {
        price: 1499,
        name: 'KWP Recovery Roadmap',
        description: 'Complete Protocol Access',
        mode: 'payment'
    },
    'agency-monthly': {
        price: 999,
        name: 'KWP Agency Escape Plan - Monthly',
        description: 'Monthly Membership',
        mode: 'subscription'
    },
    'agency-onetime': {
        price: 4999,
        name: 'KWP Agency Escape Plan - Lifetime',
        description: 'One-Time Investment • Lifetime Access',
        mode: 'payment'
    }
};

// Email setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        message: 'KWP Server Running',
        status: 'active',
        products: Object.keys(PRODUCTS)
    });
});

// THIS IS THE MISSING PART - Create checkout session
app.post('/create-recovery-session', async (req, res) => {
    try {
        const { email, product = 'recovery-roadmap' } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        const productConfig = PRODUCTS[product];
        if (!productConfig) {
            return res.status(400).json({ error: 'Invalid product selected' });
        }

        const priceData = {
            currency: 'usd',
            product_data: {
                name: productConfig.name,
                description: productConfig.description,
            },
            unit_amount: productConfig.price,
        };

        if (productConfig.mode === 'subscription') {
            priceData.recurring = { interval: 'month' };
        }

        const session = await stripe.checkout.sessions.create({
            customer_email: email,
            line_items: [{
                price_data: priceData,
                quantity: 1,
            }],
            mode: productConfig.mode,
            success_url: `${req.headers.origin || 'https://yourdomain.com'}?session_id={CHECKOUT_SESSION_ID}&product=${product}`,
            cancel_url: `${req.headers.origin || 'https://yourdomain.com'}?canceled=true`,
            metadata: {
                customer_email: email,
                product_type: product
            }
        });

        res.json({ url: session.url });
        
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`KWP Server running on port ${PORT}`);
});
