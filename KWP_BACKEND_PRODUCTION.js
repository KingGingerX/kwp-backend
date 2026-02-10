// KWP BACKEND SERVER - PRODUCTION
// Account: goodyxcorp@gmail.com

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Email setup using your Gmail
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'goodyxcorp@gmail.com',
        pass: process.env.EMAIL_PASS
    }
});

const DB_FILE = './kwp_database.json';

function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({
            purchases: [],
            giftCodes: [],
            stats: { totalRevenue: 0, totalSales: 0 }
        }, null, 2));
    }
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function generateKWPCode() {
    return 'KWP-' + crypto.randomBytes(3).toString('hex').toUpperCase() + '-' + 
           crypto.randomBytes(2).toString('hex').toUpperCase();
}

// Recovery Payment ($14.99)
app.post('/create-recovery-session', async (req, res) => {
    try {
        const { email } = req.body;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: process.env.STRIPE_PRICE_RECOVERY,
                quantity: 1
            }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/canceled.html`,
            customer_email: email,
            metadata: { product: 'recovery', email: email }
        });
        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify and send email
app.post('/verify-recovery', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status === 'paid') {
            initDB();
            const db = readDB();
            const giftCode = generateKWPCode();
            const orderId = 'KWP-REC-' + Date.now();
            
            db.purchases.push({
                id: orderId,
                email: session.customer_email,
                product: 'recovery',
                amount: 14.99,
                giftCode: giftCode,
                date: new Date().toISOString()
            });
            
            db.giftCodes.push({
                code: giftCode,
                createdBy: session.customer_email,
                redeemed: false,
                createdAt: new Date().toISOString()
            });
            
            writeDB(db);
            
            // Send email
            await transporter.sendMail({
                from: '"KWP" <goodyxcorp@gmail.com>',
                to: session.customer_email,
                subject: 'Your KWP Recovery + Gift Code',
                html: `<h1>Welcome to KWP</h1><p>Your gift code: ${giftCode}</p>`
            });
            
            res.json({ success: true, orderId, giftCode });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Redeem gift
app.post('/redeem-gift', async (req, res) => {
    const { code, email } = req.body;
    initDB();
    const db = readDB();
    const gift = db.giftCodes.find(g => g.code === code);
    
    if (!gift) return res.status(404).json({ error: 'Invalid code' });
    if (gift.redeemed) return res.status(400).json({ error: 'Already used' });
    
    gift.redeemed = true;
    gift.redeemedBy = email;
    writeDB(db);
    
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KWP Server running on port ${PORT}`));