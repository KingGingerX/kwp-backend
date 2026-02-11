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
        description: 'Complete Protocol Access - One Time',
        mode: 'payment'
    },
    'agency-monthly': {
        price: 999,
        name: 'KWP Agency Escape Plan - Monthly',
        description: 'Monthly Membership Subscription',
        mode: 'subscription'
    },
    'agency-onetime': {
        price: 4999,
        name: 'KWP Agency Escape Plan - Lifetime',
        description: 'One-Time Investment • Lifetime Access',
        mode: 'payment'
    }
};

// Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Root route - Health check
app.get('/', (req, res) => {
    res.json({ 
        message: 'KWP Server Running',
        status: 'active',
        products: Object.keys(PRODUCTS)
    });
});

// Create checkout session
app.post('/create-recovery-session', async (req, res) => {
    try {
        const { email, product = 'recovery-roadmap' } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Get product config
        const productConfig = PRODUCTS[product];
        if (!productConfig) {
            return res.status(400).json({ error: 'Invalid product selected' });
        }

        // Build price data
        const priceData = {
            currency: 'usd',
            product_data: {
                name: productConfig.name,
                description: productConfig.description,
            },
            unit_amount: productConfig.price,
        };

        // Add recurring data for subscriptions
        if (productConfig.mode === 'subscription') {
            priceData.recurring = { interval: 'month' };
        }

        // Create Stripe Checkout Session
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

// Stripe Webhook endpoint
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle successful payment
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const customerEmail = session.customer_email || session.metadata.customer_email;
        const productType = session.metadata.product_type || 'recovery-roadmap';
        
        // Send email with access info
        await sendProductEmail(customerEmail, productType);
    }
    
    res.json({received: true});
});

// Send product email
async function sendProductEmail(email, productType) {
    const productNames = {
        'recovery-roadmap': 'KWP Recovery Roadmap',
        'agency-monthly': 'KWP Agency Escape Plan (Monthly)',
        'agency-onetime': 'KWP Agency Escape Plan (Lifetime)'
    };
    
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: `Your ${productNames[productType]} Access`,
        html: `
            <h1>Welcome to KWP</h1>
            <p>Thank you for purchasing the ${productNames[productType]}.</p>
            <p>Your access has been activated.</p>
            <br>
            <p>Login to your dashboard to get started.</p>
            <p>- Kingdom Wellness Protocol Team</p>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${email} for ${productType}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`KWP Server running on port ${PORT}`);
    console.log('Available products:', Object.keys(PRODUCTS));
});
