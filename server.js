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

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed.`, err.message);
    return res.sendStatus(400);
  }

  console.log('Otrzymany event:', event.type, event);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const nick = session.metadata.nick;
    const email = session.customer_email;
    const produkt = session.metadata.produkt;

    if (!nick || !produkt) {
      console.error('Brak nick lub produkt w metadanych');
      return res.sendStatus(400);
    }

    console.log(`✅ Płatność zakończona sukcesem dla: ${nick}, ${email}, produkt: ${produkt}`);

    try {
      await db.query(
        'INSERT INTO itemshopkupna (nick, email, produkt, ilosc, platnosc, processed) VALUES (?, ?, ?, ?, ?, ?)',
        [nick, email, produkt, 1, 1, 0]
      );
      console.log(`✅ Zakup zapisany w bazie danych dla: ${nick}`);
    } catch (error) {
      console.error(`❌ Błąd podczas zapisu do bazy danych: ${error.message}`);
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    console.log('async_payment_failed session:', session);

    const nick = session.metadata?.nick;
    const email = session.customer_email;
    const produkt = session.metadata?.produkt;

    if (!nick || !produkt) {
      console.error('Brak nick lub produkt w metadanych async_payment_failed');
      return res.sendStatus(400);
    }

    try {
      await db.query(
        'INSERT INTO itemshopkupna (nick, email, produkt, ilosc, platnosc, processed) VALUES (?, ?, ?, ?, ?, ?)',
        [nick, email, produkt, 1, 0, 0]
      );
      console.log(`Zapytanie zapisane pomimo failed dla: ${nick}, produkt: ${produkt}`);
    } catch (error) {
      console.error(`Błąd podczas zapisu do bazy danych: ${error.message}`);
    }

    console.log(`❌ Płatność nie powiodła się dla: ${nick}, produkt: ${produkt}`);
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;

    // Pobierz sesję checkout powiązaną z tym paymentIntent
    let session;
    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntent.id,
        limit: 1,
      });
      session = sessions.data[0];
    } catch (err) {
      console.error('Błąd podczas pobierania sesji checkout:', err.message);
      return res.sendStatus(500);
    }

    if (!session) {
      console.error('Nie znaleziono sesji checkout powiązanej z paymentIntent');
      return res.sendStatus(400);
    }

    const nick = session.metadata.nick;
    const email = session.customer_email;
    const produkt = session.metadata.produkt;

    if (!nick || !produkt) {
      console.error('Brak nick lub produkt w metadanych sesji checkout');
      return res.sendStatus(400);
    }

    try {
      await db.query(
        'INSERT INTO itemshopkupna (nick, email, produkt, ilosc, platnosc, processed) VALUES (?, ?, ?, ?, ?, ?)',
        [nick, email, produkt, 1, 0, 0]
      );
      console.log(`Zapytanie zapisane pomimo failed (payment_intent.payment_failed) dla: ${nick}, produkt: ${produkt}`);
    } catch (error) {
      console.error(`Błąd podczas zapisu do bazy danych: ${error.message}`);
    }

    console.log(`❌ Płatność nie powiodła się dla: ${nick}, produkt: ${produkt}`);
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
            line_items: [{
                price_data: {
                    currency: 'pln',
                    product_data: {
                        name: `Ranga VIP na 7 dni (Nick: ${nick})`,
                    },
                    unit_amount: 1500,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'http://vayromc.pl/sukces.html',
            cancel_url: 'http://vayromc.pl/cancel.html',
            metadata: {
                nick: nick,
                produkt: 'VIP 7 DNI'
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
            line_items: [{
                price_data: {
                    currency: 'pln',
                    product_data: {
                        name: `Ranga SVIP na 7 dni (Nick: ${nick})`,
                    },
                    unit_amount: 2500,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'http://vayromc.pl/sukces.html',
            cancel_url: 'http://vayromc.pl/cancel.html',
            metadata: {
                nick: nick,
                produkt: 'SVIP 7 DNI'
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
            line_items: [{
                price_data: {
                    currency: 'pln',
                    product_data: {
                        name: `PREMIUMCASE x25 sztuk (Nick: ${nick})`,
                    },
                    unit_amount: 1500,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'http://vayromc.pl/sukces.html',
            cancel_url: 'http://vayromc.pl/cancel.html',
            metadata: {
                nick: nick,
                produkt: 'PREMIUMCASE x25'
            }
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Błąd przy tworzeniu sesji Stripe' });
    }
});

app.post('/sprawdz-voucher', async (req, res) => {
  const { nick, kod } = req.body;
  console.log('Otrzymano POST /sprawdz-voucher:', req.body);

  if (!kod || !nick) {
    return res.status(400).json({ success: false, message: 'Brak kodu lub nicku' });
  }

  try {
    const [results] = await db.query('SELECT * FROM vouchery WHERE kod = ?', [kod]);

    if (results.length === 0) {
      return res.json({ success: false, message: 'Ten voucher nie istnieje!' });
    }

    const voucher = results[0];

    if (voucher.nick) {
      return res.json({ success: false, message: 'Ten kod został już użyty!' });
    }

    await db.query('UPDATE vouchery SET nick = ? WHERE kod = ?', [nick, kod]);

    return res.json({ success: true, message: 'Kod vouchera poprawny i został przypisany do Ciebie!' });

  } catch (err) {
    console.error('Błąd zapytania do bazy danych:', err);
    return res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

app.get('/api/zakupy', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT nick, produkt FROM itemshopkupna WHERE platnosc = 1 ORDER BY id DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error('Błąd pobierania zakupów:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server działa na porcie ${PORT}`));
