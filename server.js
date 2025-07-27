const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

const allowedOrigins = [
  'https://www.vayromc.pl',
  'https://vayromc.pl'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Nieautoryzowany origin: ' + origin));
    }
  }
}));

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed.`, err.message);
        return res.sendStatus(400);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const nick = session.metadata.nick;
        const email = session.customer_email;

        console.log(`Płatność zakończona sukcesem dla: ${nick}, ${email}`);
        try { 
            db.query('INSERT INTO itemshopkupna (nick, email, produkt, ilosc) VALUES (?, ?, ?, ?)', [nick, email, 'VIP 7 DNI', 1], (error) => {
                if (error) {
                    console.error(`Błąd podczas zapisywania do bazy danych: ${error.message}`);
                } else {
                    console.log(`Zakup zapisany w bazie danych dla: ${nick}`);
                }
            });
        } catch (error) {
            console.error(`Błąd podczas przetwarzania płatności: ${error.message}`);
        }
    }

    if (event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object;
        const nick = session.metadata.nick;
        const email = session.customer_email;

        console.log(`❌ Płatność nie powiodła się dla: ${nick}, ${email}`);
    }

    res.sendStatus(200);
});

app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
    const { nick, email } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'blik', 'klarna'],
            customer_email: email,
            line_items: [
                {
                    price_data: {
                        currency: 'pln',
                        product_data: {
                            name: `Ranga VIP na 7 dni (Nick: ${nick})`,
                        },
                        unit_amount: 1500,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'http://vayromc.pl/index.html',
            cancel_url: 'http://vayromc.pl/regulamin/regulamin.html',
            metadata: {
                nick: nick,
            }
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd przy tworzeniu sesji Stripe' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server działa na porcie ${PORT}`));
