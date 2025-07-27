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
            success_url: 'http://vayromc.pl/sukces.html',
            cancel_url: 'http://vayromc.pl/cancel.html',
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

app.post('/create-checkout-session-svip', async (req, res) => {
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
                            name: `Ranga SVIP na 7 dni (Nick: ${nick})`,
                        },
                        unit_amount: 2500,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'http://vayromc.pl/sukces.html',
            cancel_url: 'http://vayromc.pl/cancel.html',
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

app.post('/create-checkout-session-premiumcase', async (req, res) => {
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
                            name: `PREMIUMCASE x25 sztuk (Nick: ${nick})`,
                        },
                        unit_amount: 1500,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'http://vayromc.pl/sukces.html',
            cancel_url: 'http://vayromc.pl/cancel.html',
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

app.post('/test', (req, res) => {
  console.log('Test działa:', req.body);
  res.json({ success: true, message: 'Test OK!' });
});

app.post('/sprawdz-voucher', (req, res) => {
    const { nick, kod } = req.body;
    console.log('Otrzymano POST /sprawdz-voucher:', req.body);

    if (!kod || !nick) {
        return res.status(400).json({ success: false, message: 'Brak kodu lub nicku' });
    }

    db.query('SELECT * FROM vouchery WHERE kod = ?', [kod], (err, results) => {
        if (err) {
            console.error('Błąd zapytania do bazy danych:', err);
            return res.status(500).json({ success: false, message: 'Błąd serwera' });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: 'Nieprawidłowy kod vouchera' });
        }

        const voucher = results[0];

        if (voucher.nick) {
            return res.json({ success: false, message: 'Ten kod został już użyty przez innego gracza.' });
        }

        db.query('UPDATE vouchery SET nick = ? WHERE kod = ?', [nick, kod], (updateErr) => {
            if (updateErr) {
                console.error('Błąd przy aktualizacji vouchera:', updateErr);
                return res.status(500).json({ success: false, message: 'Błąd zapisu nicku' });
            }

            return res.json({ success: true, message: 'Kod vouchera poprawny i został przypisany do Twojego nicku!' });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server działa na porcie ${PORT}`));
