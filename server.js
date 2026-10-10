require('dotenv').config();
const { Pool } = require('pg');

const express = require('express');
const session = require("express-session");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary") .v2;
const multer = require("multer");
cloudinary.config({
 cloud_name:
  process.env.CLOUDINARY_CLOUD_NAME,
 api_key:
  process.env.CLOUDINARY_API_KEY,
api_secret:
 process.env.CLOUDINARY_API_SECRET
});
const stripe = require('stripe') (process.env.STRIPE_SECRET_KEY);
const BASE_URL =
  process.env.BASE_URL ||
  'https://jexali.onrender.com';

/* ===== JEXALI EMAIL NOTIFICATIONS ===== */

async function sendJexaliEmail({ to, subject, text }) {

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing");
  }

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        from:
          process.env.RESEND_FROM_EMAIL ||
          "Jexali <onboarding@resend.dev>",

        to: [to],
        subject,
        text
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || "Email sending failed"
    );
  }

  return result;
}

/* ===== END EMAIL NOTIFICATIONS ===== */

/* ===== BUYER ORDER CONFIRMATION EMAIL ===== */

async function sendBuyerOrderConfirmation(order) {

  
  const recipient = order.buyer_email;

  if (!recipient) {
   console.log("Order email skipped: buyer email missing"); 
    return;
  }

  const message = `
Thank you for shopping with Jexali!

Your order has been confirmed.

Order Number: #${order.id}

Order Total: $${Number(order.amount).toFixed(2)}

We will notify you when your order ships.

Thank you for choosing Jexali!
`;

  return sendJexaliEmail({
    to: recipient,
   subject: `Jexali Order Confirmation #${order.id}`, 
    text: message
  });

}

/* ===== END BUYER ORDER CONFIRMATION ===== */

/* ===== SELLER NEW ORDER EMAIL ===== */

async function sendSellerNewOrderEmail(order) {

  
  
const recipient = order.seller_email;


  if (!recipient) {
    console.log("Seller email skipped: seller email missing");
    return;
  }

  const message = `
Hello Seller!

You have received a new order on Jexali.

Order Number: #${order.id}

Order Total: $${Number(order.amount).toFixed(2)}

Please visit your Seller Dashboard
to review and prepare this order.

Thank you for selling on Jexali!
`;

  return sendJexaliEmail({
    to: recipient,
    
subject: `Jexali - New Order #${order.id}`,

    text: message
  });

}

/* ===== END SELLER NEW ORDER EMAIL ===== */

/* ===== BUYER SHIPPING EMAIL ===== */

async function sendBuyerShippingEmail(order) {


const recipient = order.buyer_email;
  

  if (!recipient) {
   console.log("Shipping email skipped: buyer email missing"); 
    return;
  }

  const status = order.status;

  if (!["Shipped", "Delivered"].includes(status)) {
    return;
  }

  const tracking = order.tracking_number
    ? `
Carrier: ${order.shipping_carrier || "Not specified"}
Tracking Number: ${order.tracking_number}
`
    : "";

  const message = `
Hello!

Your Jexali order has been updated.

Order Number: #${order.id}

Order Status: ${status}
${tracking}
Visit My Orders on Jexali for more details.

Thank you for shopping with Jexali!
`;

  return sendJexaliEmail({
    to: recipient,
   
subject: `Jexali Order #${order.id} - ${status}`,
 
    text: message
  });

}

/* ===== END BUYER SHIPPING EMAIL ===== */

/* ===== SELLER REFUND REQUEST EMAIL ===== */

async function sendSellerRefundRequestEmail(order) {

 
const recipient = order.seller_email;
 

  if (!recipient) {
   console.log("Refund request email skipped: seller email missing"); 
    return;
  }

  const message = `
Hello Seller!

A buyer has requested a refund on Jexali.

Order Number: #${order.id}

Reason: ${order.reason || "Not specified"}

Please visit your Seller Dashboard
to review the refund request.

Thank you for selling on Jexali!
`;

  return sendJexaliEmail({
    to: recipient,
 
subject: `Jexali Refund Request #${order.id}`,
   
    text: message
  });

}



/* ===== END SELLER REFUND REQUEST EMAIL ===== */
/* ===== BUYER REFUND DECISION EMAIL ===== */

async function sendBuyerRefundDecisionEmail(order) {

  
const recipient = order.buyer_email;


  if (!recipient) {
   console.log("Refund decision email skipped: buyer email missing"); 
    return;
  }

  if (!["Refunded", "Declined"].includes(order.status)) {
    return;
  }

  const approved = order.status === "Refunded";

  const message = approved
    ? `Hello!

Your refund for Jexali Order #${order.id} has been issued.

The time for the money to appear depends on your payment provider.

Thank you for shopping with Jexali!`
    : `Hello!

Your refund request for Jexali Order #${order.id} was declined.

Please visit My Orders on Jexali for more information.`;

  return sendJexaliEmail({
    to: recipient,
    
subject: `Jexali Refund #${order.id} - ${order.status}`,

    text: message
  });

}

/* ===== END BUYER REFUND DECISION EMAIL ===== */
const db = new Pool({connectionString: process.env.DATABASE_URL });
class PgSessionStore extends session.Store {
constructor(pool) {
super();
this.pool = pool; 
this.pool.query(` 
CREATE TABLE IF NOT EXISTS user_sessions (
sid TEXT PRIMARY KEY,
sess JSONB NOT NULL,
expire TIMESTAMPTZ NOT NULL
)
`).catch(console.error);
}
get(sid, callback) { 
this.pool.query(
'SELECT sess FROM user_sessions WHERE sid = $1 AND expire > NOW()', 
[sid]
)  
.then(r => callback(null, r.rows[0]?.sess || null))
.catch(callback); 
}  
set(sid, sess, callback) {  
const maxAge = sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000; 
const expire = new Date(Date.now() + maxAge); 
this.pool.query('INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2, $3) ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire', [sid, sess, expire]).then(() => callback()).catch(callback);
}  
destroy(sid, callback) { 
this.pool.query('DELETE FROM user_sessions WHERE sid = $1', [sid])
.then(() => callback()).catch(callback);
}
touch(sid, sess, callback) {  
const maxAge = sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000; 
const expire = new Date(Date.now() + maxAge); 
this.pool.query(  
'UPDATE user_sessions SET expire = $2 WHERE sid = $1',
 [sid, expire] 
 ) 
.then(() => callback()).catch(callback); 
}  
}

db.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')), created_at TIMESTAMPTZ DEFAULT NOW())`).catch(console.error);
const app = express();
app.set('trust proxy', 1);

async function fulfillCheckoutSession(sessionId){

  const checkoutSession =
    await stripe.checkout.sessions.retrieve(sessionId);

  if(checkoutSession.payment_status !== "paid"){
    throw new Error("Payment not completed");
  }

  const sellerId =
    Number(checkoutSession.metadata?.seller_id);

  if(!Number.isInteger(sellerId)){
    throw new Error("Invalid seller");
  }

  const rawBuyerUserId =
    checkoutSession.metadata?.buyer_user_id
      ? Number(checkoutSession.metadata.buyer_user_id)
      : null;

  const buyerUserId =
    Number.isInteger(rawBuyerUserId)
      ? rawBuyerUserId
      : null;

  const customerDetails =
    checkoutSession.customer_details || {};

  const shippingDetails =
    checkoutSession.collected_information?.shipping_details ||
    checkoutSession.shipping_details ||
    {};

  const shippingAddress =
    shippingDetails.address ||
    customerDetails.address ||
    {};

  const buyerName =
    shippingDetails.name ||
    customerDetails.name ||
    null;

  const buyerEmail =
    customerDetails.email || null;

  const buyerPhone =
    customerDetails.phone || null;

  const shippingName =
    shippingDetails.name ||
    customerDetails.name ||
    null;

  const amountTotalCents =
    Number(checkoutSession.amount_total || 0);

  const shippingCents =
    Number(
      checkoutSession.metadata?.shipping_total_cents || 0
    );

  const productSubtotalCents =
    Math.max(
      0,
      amountTotalCents - shippingCents
    );

  const jexaliFeeCents =
    Math.round(
      productSubtotalCents * 0.10
    );

  const sellerEarningsCents =
    amountTotalCents - jexaliFeeCents;

  const amount =
    amountTotalCents / 100;

  const jexaliFee =
    jexaliFeeCents / 100;

  const sellerEarnings =
    sellerEarningsCents / 100;

  const lineItems =
    await stripe.checkout.sessions.listLineItems(
      checkoutSession.id,
      {
        limit:100,
        expand:["data.price.product"]
      }
    );

  const client =
    await db.connect();

  try{

    await client.query("BEGIN");

    /*
      stripe_session_id is UNIQUE.
      This prevents the same checkout
      from being processed twice.
    */

    const orderInsert =
      await client.query(
        `
        INSERT INTO orders (
          stripe_session_id,
          seller_id,
          buyer_user_id,
          amount,
          seller_earnings,
          jexali_fee,
          buyer_name,
          buyer_email,
          buyer_phone,
          shipping_name,
          shipping_line1,
          shipping_line2,
          shipping_city,
          shipping_state,
          shipping_postal_code,
          shipping_country
        )

        VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16
        )

        ON CONFLICT (stripe_session_id)
        DO NOTHING

        RETURNING id
        `,
        [
          checkoutSession.id,
          sellerId,
          buyerUserId,
          amount,
          sellerEarnings,
          jexaliFee,
          buyerName,
          buyerEmail,
          buyerPhone,
          shippingName,
          shippingAddress.line1 || null,
          shippingAddress.line2 || null,
          shippingAddress.city || null,
          shippingAddress.state || null,
          shippingAddress.postal_code || null,
          shippingAddress.country || null
        ]
      );

    /*
      If this Stripe session was already
      processed, do not remove stock again.
    */

    if(orderInsert.rows.length === 0){

      const existingOrder =
        await client.query(
          `
          SELECT
            id,
            seller_earnings,
            jexali_fee
          FROM orders
          WHERE stripe_session_id = $1
          `,
          [checkoutSession.id]
        );

      await client.query("COMMIT");

      return {
        ok:true,
        alreadyProcessed:true,
        orderId:existingOrder.rows[0]?.id,
        sellerEarnings:
          Number(
            existingOrder.rows[0]?.seller_earnings || 0
          ),
        jexaliFee:
          Number(
            existingOrder.rows[0]?.jexali_fee || 0
          )
      };
    }

    const orderId =
      orderInsert.rows[0].id;

    for(const item of lineItems.data){

      const stripeProduct =
        item.price?.product;

      if(
        !stripeProduct ||
        typeof stripeProduct !== "object"
      ){
        continue;
      }

      const metadata =
        stripeProduct.metadata || {};

      const productId =
        Number(metadata.product_id);

      /*
        Shipping has no product_id,
        so it is skipped here.
      */

      if(!Number.isInteger(productId)){
        continue;
      }

      const quantity =
        Number(item.quantity || 1);

      if(
        !Number.isInteger(quantity) ||
        quantity < 1
      ){
        throw new Error(
          "Invalid purchased quantity"
        );
      }

      /*
        Remove stock safely.
        It cannot go below zero.
      */

      const stockUpdate =
        await client.query(
          `
          UPDATE products

          SET stock = stock - $1

          WHERE id = $2
            AND stock >= $1

          RETURNING id
          `,
          [
            quantity,
            productId
          ]
        );

      if(stockUpdate.rows.length === 0){
        throw new Error(
          `Insufficient stock for product ${productId}`
        );
      }

      const unitPrice =
        Number(
          item.price?.unit_amount || 0
        ) / 100;

      await client.query(
        `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          selected_color,
          selected_clothing_size,
          selected_shoe_size,
          selected_waist_size,
          stripe_line_item_id
        )

        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,$10
        )

        ON CONFLICT DO NOTHING
        `,
        [
          orderId,
          productId,
          stripeProduct.name ||
            item.description ||
            "Product",
          quantity,
          unitPrice,
          metadata.selected_color || null,
          metadata.selected_clothing_size || null,
          metadata.selected_shoe_size || null,
          metadata.selected_waist_size || null,
          item.id
        ]
      );
    }

  
    await client.query("COMMIT");

    /* ===== BUYER ORDER EMAIL ===== */

    try {

     await sendBuyerOrderConfirmation({
  id: orderId,
  amount: amount,
  buyer_email: buyerEmail
}); 

      console.log(
        "Buyer order confirmation processed:",
        orderId
      );

    } catch (emailError) {

      console.error(
        "Buyer order email failed:",
        emailError.message
      );

    }

    /* ===== END BUYER ORDER EMAIL ===== */

    /* ===== SELLER NEW ORDER NOTIFICATION ===== */

    try {

      
const sellerEmailResult = await db.query(
  `SELECT COALESCE(u.email, s.email) AS email
   FROM sellers s
   LEFT JOIN users u ON u.id = s.user_id
   WHERE s.id = $1`,
  [sellerId]
);

await sendSellerNewOrderEmail({
  id: orderId,
  amount: amount,
  seller_email: sellerEmailResult.rows[0]?.email || null
});


      console.log(
        "Seller new order email processed:",
        orderId
      );

    } catch (sellerEmailError) {

      console.error(
        "Seller new order email failed:",
        sellerEmailError.message
      );

    }

    /* ===== END SELLER NEW ORDER NOTIFICATION ===== */

    return {
      ok:true,
      alreadyProcessed:false,
      orderId,
      sellerEarnings,
      jexaliFee
    };
  

  }catch(err){

    await client.query("ROLLBACK");
    throw err;

  }finally{

    client.release();

  }
}
app.post(
  '/api/stripe-webhook',
  express.raw({type:'application/json'}),
  async (req,res)=>{

    const sig =
      req.headers['stripe-signature'];

    let event;

    try{

      event =
        stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );

    }catch(err){

      console.error(
        "Webhook signature error:",
        err.message
      );

      return res.status(400).send(
        `Webhook Error: ${err.message}`
      );
    }

    try{

      if(
        event.type ===
          'checkout.session.completed' ||

        event.type ===
          'checkout.session.async_payment_succeeded'
      ){

        const checkoutSession =
          event.data.object;

        /*
          Only fulfill when payment
          is actually paid.
        */

        if(
          checkoutSession.payment_status ===
          'paid'
        ){

          await fulfillCheckoutSession(
            checkoutSession.id
          );

        }
      }

      res.json({
        received:true
      });

    }catch(err){

      console.error(
        "Webhook fulfillment error:",
        err
      );

      /*
        Return 500 so Stripe can retry
        if fulfillment failed.
      */

      res.status(500).json({
        error:
          "Webhook fulfillment failed"
      });

    }
  }
);
 app.use(express.json());

app.post("/api/register", async (req, res)=> {try {const { name, email, password, role } = req.body; if (!name || !email || !password || ! ["buyer", "seller"].includes(role)) { return res.status(400).json({ error: "Invalid registration information" }); } const normalizedEmail = email.trim().toLowerCase(); const passwordHash = await bcrypt.hash(password, 12); const result = await db.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`, [name.trim(), normalizedEmail, passwordHash, role]); res.json({ success: true, user: result.rows[0] }); } catch (err) { if (err.code === "23505") { return res.status(409).json({ error: "An account with this email already exists" });} console.error(err); res.status(500).json({ error: "Could not create account" });} });


app.use(session({ 
 store: new PgSessionStore(db), 
secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000}}));
const upload = multer({
 storage: multer.memoryStorage(),
 limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
   const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
   if
    (allowedTypes.includes(file.mimetype)
     ) {
     cb(null, true);
    } else {
     cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
    }
  }
});
function uploadToCloudinary(buffer) {
 return new Promise((resolve,reject) => {
  console.log("Starting Cloudinary upload...");
  const stream = 
   cloudinary.uploader.upload_stream(
    {
     folder: "jexali/products",
     resource_type: "image"
    },
    (error, result) => {
     console.log("Cloudinary callback:",
      error ? error.message : "SUCCESS");           
     if (error) return reject(error);
     resolve(result);
    }
    );
  stream.end(buffer);
 });
}
async function
 uploadUrlToCloudinary(imageUrl) {
  const result = await
   cloudinary.uploader.upload(imageUrl,
  {
   folder: "jexali/products",
   resource_type: "image"
  });
  return result.secure_url;
 }
app.post(
 "/api/upload-product-image",
 (req, res, next) => {
  if (!req.session.sellerId) {
  return res.status(401).json({ error: "Not signed in" });
}
  next();
 },
 upload.single("image"),
 async ( req, res) => {
  try {
   if (!req.file) {
  return res.status(400).json({
    error: "No image selected"
  });
}
   const result = await 
   uploadToCloudinary(req.file.buffer);
   res.json({
    url: result.secure_url
   });
  } catch (err) {
   console.error(err);
   res.status(500).json({ error:
    "Image upload failed" });
  }
 }
 );
app.post("/api/login", async (req, res) => {
 try { const { email, password } = req.body; if (!email || !password) { return res.status(400).json({ error: "Email and password are required" }); } const normalizedEmail = email.trim().toLowerCase(); const result = await db.query("SELECT id, name, email, password_hash, role FROM users WHERE email = $1", [normalizedEmail]); const user = result.rows[0]; if (!user || !(await bcrypt.compare(password, user.password_hash))) { return res.status(401).json({ error:"Invalid email or password" }); } req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
const sellerResult = await db.query("SELECT id FROM sellers WHERE user_id = $1", [user.id]);
if (sellerResult.rows[0]) req.session.sellerId = sellerResult.rows[0].id;      
res.json({ success: true, user: req.session.user }); } catch (err) { console.error(err); res.status(500).json({ error: "Could not log in" }); } });
app.get("/api/me" , async (req, res) => {
if (!req.session.user) { 
return res.status(401).json({ error: "Not logged in" });
}
const seller = req.session.user.role === "seller" ? (await db.query("SELECT stripe_account_id FROM sellers WHERE user_id = $1", [req.session.user.id])).rows[0] : null;
 res.json({ success: true, user: req.session.user, stripeConnected: !! seller?.stripe_account_id });
});
app.post("/api/logout", (req, res) => {
req.session.destroy(err => { 
if (err) return res.status(500).json({ error: "Could not log out" });
res.json({ success: true })
}); 
}); 
app.use(express.static(__dirname));




db.query("CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT, price REAL, seller TEXT, stock INTEGER DEFAULT 0)");
db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS processing_days INTEGER DEFAULT 1");
db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT, ADD COLUMN IF NOT EXISTS image TEXT, ADD COLUMN IF NOT EXISTS description TEXT");
db.query("Alter TABLE products ADD COLUMN IF NOT EXISTS shipping_fee REAL DEFAULT 0");
db.query(`
  ALTER TABLE products
  ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clothing_sizes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shoe_sizes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS waist_sizes JSONB DEFAULT '[]'::jsonb
`).catch(console.error);
app.get('/api/products', async (req,res)=>{
const products = (await db.query('SELECT * FROM products')).rows;
res.json(products);
});
app.get('/api/seller/products', async (req,res)=>{if (!req.session.sellerId) return res.status(401).json({error:'NOT signed in'}); const products = (await db.query('SELECT * FROM products WHERE seller_id = $1', [Number(req.session.sellerId)])).rows; res.json(products);});
db.query(`CREATE TABLE IF NOT EXISTS sellers (id SERIAL PRIMARY KEY, stripe_account_id TEXT UNIQUE, email TEXT UNIQUE)`);
db.query("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS user_id INTEGER UNIQUE");
db.query("CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, stripe_session_id TEXT UNIQUE, seller_id INTEGER, amount REAL DEFAULT 0, seller_earnings REAL DEFAULT 0, jexali_fee REAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
db.query(`
  ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS buyer_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS buyer_name TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email TEXT,
  ADD COLUMN IF NOT EXISTS buyer_phone TEXT,
  ADD COLUMN IF NOT EXISTS shipping_name TEXT,
  ADD COLUMN IF NOT EXISTS shipping_line1 TEXT,
  ADD COLUMN IF NOT EXISTS shipping_line2 TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_state TEXT,
  ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tracking_number TEXT,
ADD COLUMN IF NOT EXISTS shipping_carrier TEXT
`).catch(console.error);
db.query(`
  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price REAL DEFAULT 0,
    selected_color TEXT,
    selected_clothing_size TEXT,
    selected_shoe_size TEXT,
    selected_waist_size TEXT,
    stripe_line_item_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`)
.then(() =>
  db.query(`
    ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS stripe_line_item_id TEXT
  `)
)
.then(() =>
  db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    order_items_stripe_line_item_id_unique
    ON order_items(stripe_line_item_id)
    WHERE stripe_line_item_id IS NOT NULL
  `)
)
.catch(console.error);

/* ===== REFUND REQUESTS ===== */

db.query(`
  CREATE TABLE IF NOT EXISTS refund_requests (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL UNIQUE
      REFERENCES orders(id)
      ON DELETE CASCADE,

    buyer_user_id INTEGER NOT NULL,

    reason TEXT NOT NULL,

    message TEXT,

    status TEXT NOT NULL
      DEFAULT 'Requested'
      CHECK (
        status IN (
          'Requested',
          'Approved',
          'Declined',
          'Refunded'
        )
      ),

    stripe_refund_id TEXT,

    created_at TIMESTAMPTZ
      DEFAULT NOW(),

    decided_at TIMESTAMPTZ
  )
`).catch(console.error);
db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id INTEGER");
app.post('/api/products', async (req,res)=>{
const p = req.body
 if (p.image && /^https?:\/\//i.test(p.image) && ! p.image.includes("res.cloudinary.com/")) {
  try {
   p.image = await
   uploadUrlToCloudinary(p.image);
  } catch (err) {
   console.error("Image URL upload failed:", err.message);
return res.status(400).json({
  error: "Could not save product image"
});
  }
 }
 if (!req.session.sellerId) return res.status(401).json({error:'Not signed in'});
const sellerRow = { id:Number(req.session.sellerId) };
 const r = await db.query(
  `INSERT INTO products (
    name,
    price,
    seller,
    seller_id,
    stock,
    category,
    image,
   description,
    shipping_fee,
    processing_days,
    colors,
    clothing_sizes,
    shoe_sizes,
    waist_sizes
  )
  VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )
  RETURNING id`,
  [
    p.name,
    p.price,
    p.seller,
    sellerRow?.id,
    p.stock || 0,
    p.category,
    p.image,
        p.description,
    Number(p.shipping_fee) || 0,
    Math.max(1, Number(p.processing_days) || 1),
    JSON.stringify(Array.isArray(p.colors) ? p.colors : []),
    JSON.stringify(Array.isArray(p.clothing_sizes) ? p.clothing_sizes : []),
    JSON.stringify(Array.isArray(p.shoe_sizes) ? p.shoe_sizes : []),
    JSON.stringify(Array.isArray(p.waist_sizes) ? p.waist_sizes : [])
  ]
);                          
 const newID = r.rows[0].id;
res.status(201).json({id:newID});
});
app.patch('/api/products/:id', async (req,res)=>{
  try{

    if(!req.session.sellerId){
      return res.status(401).json({
        error:'Not signed in'
      });
    }

    const id = Number(req.params.id);

    if(!Number.isInteger(id)){
      return res.status(400).json({
        error:'Invalid product id'
      });
    }

    const p = req.body;

    const name =
      String(p.name || '').trim();

    const description =
      String(p.description || '').trim();

    const price =
      Number(p.price);

    const stock =
      Number(p.stock);

    const shippingFee =
      Number(p.shipping_fee || 0);

    const processingDays =
      Math.max(
        1,
        Number(p.processing_days) || 1
      );

    if(
      !name ||
      !description ||
      !(price > 0) ||
      !Number.isInteger(stock) ||
      stock < 0
    ){
      return res.status(400).json({
        error:'Invalid product information'
      });
    }

    let image =
      String(p.image || '').trim();

    if(
      image &&
      /^https?:\/\//i.test(image) &&
      !image.includes("res.cloudinary.com/")
    ){
      try{

        image =
          await uploadUrlToCloudinary(image);

      }catch(err){

        console.error(
          "Edit product image upload failed:",
          err.message
        );

        return res.status(400).json({
          error:'Could not save product image'
        });
      }
    }

    const result = await db.query(
      `
      UPDATE products

      SET
        name = $1,
        price = $2,
        stock = $3,
        category = $4,
        image = $5,
        description = $6,
        shipping_fee = $7,
        processing_days = $8,
        colors = $9,
        clothing_sizes = $10,
        shoe_sizes = $11,
        waist_sizes = $12

      WHERE id = $13
        AND seller_id = $14

      RETURNING *
      `,
      [
        name,
        price,
        stock,
        p.category,
        image,
        description,
        shippingFee,
        processingDays,

        JSON.stringify(
          Array.isArray(p.colors)
            ? p.colors
            : []
        ),

        JSON.stringify(
          Array.isArray(p.clothing_sizes)
            ? p.clothing_sizes
            : []
        ),

        JSON.stringify(
          Array.isArray(p.shoe_sizes)
            ? p.shoe_sizes
            : []
        ),

        JSON.stringify(
          Array.isArray(p.waist_sizes)
            ? p.waist_sizes
            : []
        ),

        id,
        Number(req.session.sellerId)
      ]
    );

    if(!result.rows.length){
      return res.status(404).json({
        error:'Product not found'
      });
    }

    res.json({
      ok:true,
      product:result.rows[0]
    });

  }catch(err){

    console.error(
      "Edit product error:",
      err
    );

    res.status(500).json({
      error:'Could not update product'
    });
  }
});
app.delete('/api/products/:id', async (req,res)=>{if (!req.session.sellerId) return res.status(401).json({error:'Not signed in'}); const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({error:'Invalid product id'}); const result = await db.query('DELETE FROM products WHERE id = $1 AND seller_id = $2 RETURNING id', [id, Number(req.session.sellerId)]); if (result.rows.length === 0) return res.status(404).json({error:'Product not found'}); res.json({ok:true,id:result.rows[0].id});});
app.post('/api/checkout', async (req,res)=>{
  try{
    const cart = req.body.cart;

    if(!Array.isArray(cart) || cart.length === 0){
      return res.status(400).json({
        error:'Cart is empty'
      });
    }

    const normalizedCart = cart.map(item => ({
      productId: Number(
        String(item.id).replace(/^p/,"")
      ),

      quantity: Number(item.quantity || 1),

      selectedColor:
        String(item.selectedColor || "").trim(),

      selectedClothingSize:
        String(item.selectedClothingSize || "").trim(),

      selectedShoeSize:
        String(item.selectedShoeSize || "").trim(),

      selectedWaistSize:
        String(item.selectedWaistSize || "").trim()
    }));

    if(
      normalizedCart.some(item =>
        !Number.isInteger(item.productId)
      )
    ){
      return res.status(400).json({
        error:'Invalid product in cart'
      });
    }

    if(
      normalizedCart.some(item =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      )
    ){
      return res.status(400).json({
        error:'Invalid quantity'
      });
    }

    const uniqueProductIds = [
      ...new Set(
        normalizedCart.map(item => item.productId)
      )
    ];

    const dbProducts = (
      await db.query(
        'SELECT * FROM products WHERE id = ANY($1::int[])',
        [uniqueProductIds]
      )
    ).rows;

    if(dbProducts.length !== uniqueProductIds.length){
      return res.status(400).json({
        error:'Invalid product in cart'
      });
    }

    const productMap = new Map(
      dbProducts.map(product => [
        Number(product.id),
        product
      ])
    );

    /* Validate selected options */

    for(const cartItem of normalizedCart){

      const product =
        productMap.get(cartItem.productId);

      const colors =
        Array.isArray(product.colors)
          ? product.colors.map(String)
          : [];

      const clothingSizes =
        Array.isArray(product.clothing_sizes)
          ? product.clothing_sizes.map(String)
          : [];

      const shoeSizes =
        Array.isArray(product.shoe_sizes)
          ? product.shoe_sizes.map(String)
          : [];

      const waistSizes =
        Array.isArray(product.waist_sizes)
          ? product.waist_sizes.map(String)
          : [];

      if(
        colors.length > 0 &&
        !colors.includes(cartItem.selectedColor)
      ){
        return res.status(400).json({
          error:`Please choose a valid color for ${product.name}`
        });
      }

      if(
        clothingSizes.length > 0 &&
        !clothingSizes.includes(
          cartItem.selectedClothingSize
        )
      ){
        return res.status(400).json({
          error:`Please choose a valid size for ${product.name}`
        });
      }

      if(
        shoeSizes.length > 0 &&
        !shoeSizes.includes(
          cartItem.selectedShoeSize
        )
      ){
        return res.status(400).json({
          error:`Please choose a valid shoe size for ${product.name}`
        });
      }

      if(
        waistSizes.length > 0 &&
        !waistSizes.includes(
          cartItem.selectedWaistSize
        )
      ){
        return res.status(400).json({
          error:`Please choose a valid waist size for ${product.name}`
        });
      }
    }

    /* Check total stock for each product */

    const requestedQuantities = new Map();

    normalizedCart.forEach(item => {
      requestedQuantities.set(
        item.productId,
        (requestedQuantities.get(item.productId) || 0)
        + item.quantity
      );
    });

    for(const [productId, quantity]
      of requestedQuantities){

      const product = productMap.get(productId);

      if(quantity > Number(product.stock || 0)){
        return res.status(400).json({
          error:`Not enough stock for ${product.name}`
        });
      }
    }

    /* All products must belong to one seller */

    const sellerIds =
      dbProducts.map(product =>
        Number(product.seller_id)
      );

    const allSameSellerId =
      sellerIds.every(
        id => id === sellerIds[0]
      );

    if(
      !allSameSellerId ||
      !sellerIds[0]
    ){
      return res.status(400).json({
        error:'Products must belong to one valid seller'
      });
    }

    const sellerResult =
      await db.query(
        'SELECT stripe_account_id FROM sellers WHERE id = $1',
        [sellerIds[0]]
      );

    if(sellerResult.rows.length === 0){
      return res.status(400).json({
        error:'Seller not found'
      });
    }

    const sellerStripeId =
      sellerResult.rows[0].stripe_account_id;

    /* Keep current shipping behavior:
       one shipping fee per unique product */

    const shippingTotal =
      dbProducts.reduce(
        (sum,product) =>
          sum + Number(product.shipping_fee || 0),
        0
      );

    const productSubtotalCents =
      normalizedCart.reduce(
        (sum,cartItem) => {

          const product =
            productMap.get(cartItem.productId);

          return sum +
            Math.round(
              Number(product.price) * 100
            ) * cartItem.quantity;
        },
        0
      );

    /* Create one Stripe line item
       for every cart selection */

    const productLineItems =
      normalizedCart.map(cartItem => {

        const product =
          productMap.get(cartItem.productId);

        const variantParts = [];

        const productMetadata = {
          product_id:String(product.id)
        };

        if(cartItem.selectedColor){
          variantParts.push(
            `Color: ${cartItem.selectedColor}`
          );

          productMetadata.selected_color =
            cartItem.selectedColor;
        }

        if(cartItem.selectedClothingSize){
          variantParts.push(
            `Size: ${cartItem.selectedClothingSize}`
          );

          productMetadata.selected_clothing_size =
            cartItem.selectedClothingSize;
        }

        if(cartItem.selectedShoeSize){
          variantParts.push(
            `Shoe Size: ${cartItem.selectedShoeSize}`
          );

          productMetadata.selected_shoe_size =
            cartItem.selectedShoeSize;
        }

        if(cartItem.selectedWaistSize){
          variantParts.push(
            `Waist Size: ${cartItem.selectedWaistSize}`
          );

          productMetadata.selected_waist_size =
            cartItem.selectedWaistSize;
        }

        return {
          price_data:{
            currency:'usd',

            product_data:{
              name:product.name,

              ...(variantParts.length > 0
                ? {
                    description:
                      variantParts.join(" • ")
                  }
                : {}
              ),

              metadata:productMetadata
            },

            unit_amount:
              Math.round(
                Number(product.price) * 100
              )
          },

          quantity:cartItem.quantity
        };
      });

    const lineItems = [
      ...productLineItems,

      ...(shippingTotal > 0
        ? [{
            price_data:{
              currency:'usd',

              product_data:{
                name:'Shipping'
              },

              unit_amount:
                Math.round(
                  shippingTotal * 100
                )
            },

            quantity:1
          }]
        : []
      )
    ];

    const session =
      await stripe.checkout.sessions.create({

        mode:'payment',
shipping_address_collection:{
  allowed_countries:['US']
},

phone_number_collection:{
  enabled:true
},
metadata:{
  seller_id:String(sellerIds[0]),

  buyer_user_id:
    req.session.user?.role === "buyer"
      ? String(req.session.user.id)
      : "",

  shipping_total_cents:
    String(
      Math.round(
        shippingTotal * 100
      )
    )
},        

        branding_settings:{
          display_name:'Jexali'
        },

        line_items:lineItems,

        ...(sellerStripeId
          ? {
              payment_intent_data:{
                application_fee_amount:
                  Math.round(
                    productSubtotalCents * 0.10
                  ),

                transfer_data:{
                  destination:sellerStripeId
                }
              }
            }
          : {}
        ),

      success_url:
  `${BASE_URL}/?success=1&session_id={CHECKOUT_SESSION_ID}`,

cancel_url:
  `${BASE_URL}/?canceled=1`  
      });

    res.json({
      url:session.url
    });

  }catch(err){

    console.error(
      "Checkout error:",
      err
    );

    res.status(500).json({
      error:'Could not create checkout'
    });
  }
});
app.get('/api/checkout/verify', async (req,res)=>{
  try{

    const sessionId =
      String(
        req.query.session_id || ''
      ).trim();

    if(!sessionId){
      return res.status(400).json({
        error:'Missing session id'
      });
    }

    const result =
      await fulfillCheckoutSession(
        sessionId
      );

    res.json({
      ok:true,
      sales:1,
      orderId:result.orderId,
      alreadyProcessed:
        !!result.alreadyProcessed,
      sellerEarnings:
        result.sellerEarnings,
      jexaliFee:
        result.jexaliFee
    });

  }catch(err){

    console.error(
      "Checkout verification error:",
      err
    );

    if(
      err.message ===
        "Payment not completed" ||
      err.message ===
        "Invalid seller"
    ){
      return res.status(400).json({
        error:err.message
      });
    }

    res.status(500).json({
      error:'Could not verify checkout'
    });

  }
});
app.get('/api/seller/stats', async (req,res)=>{
  if(!req.session.sellerId){
    return res.status(401).json({
      error:'Not signed in'
    });
  }

  const sellerId = Number(req.session.sellerId);

  const result = await db.query(
    `
    SELECT
      COUNT(*)::int AS sales,
      COALESCE(SUM(seller_earnings),0) AS seller_earnings,
      COALESCE(SUM(jexali_fee),0) AS jexali_fees
    FROM orders
    WHERE seller_id = $1
    `,
    [sellerId]
  );

  const stats = result.rows[0];

  res.json({
    sales:stats.sales,
    sellerEarnings:Number(stats.seller_earnings),
    jexaliFees:Number(stats.jexali_fees)
  });
});
app.get('/api/seller/orders', async (req,res)=>{
  try{
    if(!req.session.sellerId){
      return res.status(401).json({
        error:'Not signed in'
      });
    }

    const sellerId =
      Number(req.session.sellerId);

    const result = await db.query(
      `
      SELECT
        o.id,
        o.amount,
        o.seller_earnings,
        o.jexali_fee,
        o.created_at,

        o.buyer_name,
        o.buyer_email,
        o.buyer_phone,

        o.shipping_name,
        o.shipping_line1,
        o.shipping_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_postal_code,
        o.shipping_country,

        o.status,
o.shipping_carrier,
o.tracking_number,
(
  SELECT json_build_object(
    'id', rr.id,
    'reason', rr.reason,
    'message', rr.message,
    'status', rr.status,
    'created_at', rr.created_at
  )

  FROM refund_requests rr

  WHERE rr.order_id = o.id

  LIMIT 1
) AS refund_request,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price,
              'selected_color', oi.selected_color,
              'selected_clothing_size', oi.selected_clothing_size,
              'selected_shoe_size', oi.selected_shoe_size,
              'selected_waist_size', oi.selected_waist_size
            )
            ORDER BY oi.id
          )
          FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items

      FROM orders o

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE o.seller_id = $1

      GROUP BY
        o.id,
        o.amount,
        o.seller_earnings,
        o.jexali_fee,
        o.created_at,

        o.buyer_name,
        o.buyer_email,
        o.buyer_phone,

        o.shipping_name,
        o.shipping_line1,
        o.shipping_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_postal_code,
        o.shipping_country,

      o.status,
o.shipping_carrier,
o.tracking_number  

      ORDER BY o.created_at DESC

      LIMIT 50
      `,
      [sellerId]
    );

    res.json(result.rows);

  }catch(err){

    console.error(
      "Seller orders error:",
      err
    );

    res.status(500).json({
      error:'Could not load seller orders'
    });
  }
});
/* ===== BUYER ORDER HISTORY ===== */

app.get('/api/buyer/orders', async (req,res)=>{
  try{

    if(
      !req.session.user ||
      req.session.user.role !== "buyer"
    ){
      return res.status(401).json({
        error:"Buyer login required"
      });
    }

    const buyerUserId =
      Number(req.session.user.id);

    const result = await db.query(
      `
      SELECT
        o.id,
o.amount,
o.created_at,
o.status,
o.delivered_at,
o.shipping_carrier,
o.tracking_number,
(
  SELECT json_build_object(
    'id', rr.id,
    'reason', rr.reason,
    'message', rr.message,
    'status', rr.status,
    'created_at', rr.created_at
  )

  FROM refund_requests rr

  WHERE rr.order_id = o.id

  LIMIT 1
) AS refund_request,
        o.shipping_name,
        o.shipping_line1,
        o.shipping_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_postal_code,
        o.shipping_country,

        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'product_id', oi.product_id,
              'product_name', oi.product_name,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price,
              'selected_color', oi.selected_color,
              'selected_clothing_size', oi.selected_clothing_size,
              'selected_shoe_size', oi.selected_shoe_size,
              'selected_waist_size', oi.selected_waist_size
            )
            ORDER BY oi.id
          )
          FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items

      FROM orders o

      LEFT JOIN order_items oi
        ON oi.order_id = o.id

      WHERE o.buyer_user_id = $1

      GROUP BY
        o.id,
o.amount,
o.created_at,
o.status,
o.delivered_at,
o.shipping_carrier,
o.tracking_number,

        o.shipping_name,
        o.shipping_line1,
        o.shipping_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_postal_code,
        o.shipping_country

      ORDER BY o.created_at DESC

      LIMIT 100
      `,
      [buyerUserId]
    );

    res.json(result.rows);

  }catch(err){

    console.error(
      "Buyer orders error:",
      err
    );

    res.status(500).json({
      error:"Could not load your orders"
    });
  }
});
/* ===== BUYER REQUEST REFUND ===== */

app.post('/api/buyer/orders/:id/refund-request', async (req,res)=>{
  try{

    if(
      !req.session.user ||
      req.session.user.role !== "buyer"
    ){
      return res.status(401).json({
        error:"Buyer login required"
      });
    }

    const orderId =
      Number(req.params.id);

    const buyerUserId =
      Number(req.session.user.id);

    const reason =
      String(req.body.reason || "").trim();

    const message =
      String(req.body.message || "").trim();

    const allowedReasons = [
      "Wrong item",
      "Damaged item",
      "Item not as described",
      "Other"
    ];

    if(!Number.isInteger(orderId)){
      return res.status(400).json({
        error:"Invalid order"
      });
    }

    if(!allowedReasons.includes(reason)){
      return res.status(400).json({
        error:"Please select a valid refund reason"
      });
    }

    if(message.length > 1000){
      return res.status(400).json({
        error:"Refund message is too long"
      });
    }

    const orderResult =
      await db.query(
        `
        SELECT
          id,
          status,
          delivered_at

        FROM orders

        WHERE id = $1
          AND buyer_user_id = $2
        `,
        [
          orderId,
          buyerUserId
        ]
      );

    if(!orderResult.rows.length){
      return res.status(404).json({
        error:"Order not found"
      });
    }

    const order =
      orderResult.rows[0];

    if(
      order.status !== "Delivered" ||
      !order.delivered_at
    ){
      return res.status(400).json({
        error:
          "Refund requests are available only after delivery"
      });
    }

    const refundDeadline =
      new Date(
        new Date(order.delivered_at).getTime() +
        7 * 24 * 60 * 60 * 1000
      );

    if(Date.now() > refundDeadline.getTime()){
      return res.status(400).json({
        error:
          "The 7-day refund request period has expired"
      });
    }

    const existingRequest =
      await db.query(
        `
        SELECT id
        FROM refund_requests
        WHERE order_id = $1
        `,
        [orderId]
      );

    if(existingRequest.rows.length){
      return res.status(409).json({
        error:
          "A refund request already exists for this order"
      });
    }

    const result =
      await db.query(
        `
        INSERT INTO refund_requests (
          order_id,
          buyer_user_id,
          reason,
          message
        )

        VALUES ($1,$2,$3,$4)

        RETURNING
          id,
          order_id,
          reason,
          message,
          status,
          created_at
        `,
        [
          orderId,
          buyerUserId,
          reason,
          message || null
        ]
      );

    /* ===== SELLER REFUND EMAIL NOTIFICATION ===== */

    try {

const sellerEmailResult = await db.query(
  `SELECT COALESCE(u.email, s.email) AS email
   FROM orders o
   JOIN sellers s ON s.id = o.seller_id
   LEFT JOIN users u ON u.id = s.user_id
   WHERE o.id = $1
     AND o.buyer_user_id = $2`,
  [orderId, buyerUserId]
);

   
await sendSellerRefundRequestEmail({
  id: orderId,
  reason: reason,
  seller_email: sellerEmailResult.rows[0]?.email || null
});
   

      console.log(
        "Seller refund request email processed:",
        orderId
      );

    } catch (emailError) {

      console.error(
        "Seller refund request email failed:",
        emailError.message
      );

    }

    /* ===== END SELLER REFUND EMAIL ===== */

    res.status(201).json({
      ok:true,
      refundRequest:
        result.rows[0]
    });

  }catch(err){

    console.error(
      "Refund request error:",
      err
    );

    res.status(500).json({
      error:
        "Could not submit refund request"
    });
  }
});
/* ===== SELLER DECLINE REFUND ===== */

app.patch('/api/seller/orders/:id/refund-decline', async (req,res)=>{
  try{

    if(!req.session.sellerId){
      return res.status(401).json({
        error:"Seller login required"
      });
    }

    const orderId =
      Number(req.params.id);

    const sellerId =
      Number(req.session.sellerId);

    if(!Number.isInteger(orderId)){
      return res.status(400).json({
        error:"Invalid order"
      });
    }

    const result =
      await db.query(
        `
        UPDATE refund_requests rr

        SET
          status = 'Declined',
          decided_at = NOW()

        FROM orders o

        WHERE rr.order_id = $1
          AND rr.order_id = o.id
          AND o.seller_id = $2
          AND rr.status = 'Requested'

      
RETURNING
  rr.id,
  rr.order_id,
  rr.status,
  rr.reason,
  rr.message,
  rr.decided_at,
  o.buyer_email
  
        `,
        [
          orderId,
          sellerId
        ]
      );

    if(!result.rows.length){
      return res.status(404).json({
        error:
          "Refund request not found or already decided"
      });
    }
    /* ===== BUYER REFUND DECLINED EMAIL ===== */

    try {

      
await sendBuyerRefundDecisionEmail({
  id: orderId,
  status: result.rows[0].status,
  buyer_email: result.rows[0].buyer_email
});


      console.log(
        "Buyer refund declined email processed:",
        orderId
      );

    } catch (emailError) {

      console.error(
        "Buyer refund declined email failed:",
        emailError.message
      );

    }

    /* ===== END BUYER REFUND DECLINED EMAIL ===== */
    res.json({
      ok:true,
      refundRequest:
        result.rows[0]
    });

  }catch(err){

    console.error(
      "Decline refund error:",
      err
    );

    res.status(500).json({
      error:
        "Could not decline refund request"
    });
  }
});
/* ===== SELLER APPROVE REFUND ===== */

app.post('/api/seller/orders/:id/refund-approve', async (req,res)=>{
  try{

    if(!req.session.sellerId){
      return res.status(401).json({
        error:"Seller login required"
      });
    }

    const orderId =
      Number(req.params.id);

    const sellerId =
      Number(req.session.sellerId);

    if(!Number.isInteger(orderId)){
      return res.status(400).json({
        error:"Invalid order"
      });
    }

    const result =
      await db.query(
        `
     
SELECT
  o.id,
  o.stripe_session_id,
  o.buyer_email,
  rr.id AS refund_request_id,
  rr.status AS refund_status
 

        FROM orders o

        JOIN refund_requests rr
          ON rr.order_id = o.id

        WHERE o.id = $1
          AND o.seller_id = $2
          AND rr.status = 'Requested'
        `,
        [
          orderId,
          sellerId
        ]
      );

    if(!result.rows.length){
      return res.status(404).json({
        error:
          "Refund request not found or already decided"
      });
    }

    const order =
      result.rows[0];

    const checkoutSession =
      await stripe.checkout.sessions.retrieve(
        order.stripe_session_id
      );

    const paymentIntentId =
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : checkoutSession.payment_intent?.id;

    if(!paymentIntentId){
      return res.status(400).json({
        error:
          "Payment information was not found"
      });
    }

    const refund =
      await stripe.refunds.create(
        {
          payment_intent:
            paymentIntentId,

          reverse_transfer:true,

          refund_application_fee:true
        },
        {
          idempotencyKey:
            `jexali-refund-order-${orderId}`
        }
      );

    const updateResult =
      await db.query(
        `
        UPDATE refund_requests

        SET
          status = 'Refunded',
          stripe_refund_id = $1,
          decided_at = NOW()

        WHERE id = $2
          AND status = 'Requested'

        RETURNING
          id,
          order_id,
          status,
          stripe_refund_id,
          decided_at
        `,
        [
          refund.id,
          order.refund_request_id
        ]
      );

    if(!updateResult.rows.length){
      return res.status(409).json({
        error:
          "Refund was already processed"
      });
    }
    /* ===== BUYER REFUND APPROVED EMAIL ===== */

    try {

     
await sendBuyerRefundDecisionEmail({
  id: orderId,
  status: updateResult.rows[0].status,
  buyer_email: order.buyer_email
});
 

      console.log(
        "Buyer refund approved email processed:",
        orderId
      );

    } catch (emailError) {

      console.error(
        "Buyer refund approved email failed:",
        emailError.message
      );

    }

    /* ===== END BUYER REFUND APPROVED EMAIL ===== */
    res.json({
      ok:true,
      refundRequest:
        updateResult.rows[0]
    });

  }catch(err){

    console.error(
      "Approve refund error:",
      err
    );

    res.status(500).json({
      error:
        "Could not process refund"
    });
  }
});
/* ===== UPDATE SELLER ORDER STATUS ===== */

app.patch('/api/seller/orders/:id/status', async (req,res)=>{
  try{

    if(!req.session.sellerId){
      return res.status(401).json({
        error:'Not signed in'
      });
    }

    const orderId = Number(req.params.id);
    const sellerId = Number(req.session.sellerId);
    const status = String(req.body.status || '').trim();

    const allowedStatuses = [
      'New',
      'Shipped',
      'Delivered'
    ];

    if(
      !Number.isInteger(orderId) ||
      !allowedStatuses.includes(status)
    ){
      return res.status(400).json({
        error:'Invalid order status'
      });
    }

    const result = await db.query(
      `
      UPDATE orders

SET
  status = $1,

  delivered_at =
    CASE
      WHEN $1 = 'Delivered'
      THEN COALESCE(delivered_at, NOW())
      ELSE delivered_at
    END


WHERE id = $2
  AND seller_id = $3
  AND status IS DISTINCT FROM $1


  

RETURNING
  id,
  status,
  shipping_carrier,
  tracking_number,
  buyer_email

    
      `,
      [
        status,
        orderId,
        sellerId
      ]
    );

   
    if(!result.rows.length){

      const existingOrder = await db.query(
        `
        SELECT
          id,
          status,
          shipping_carrier,
          tracking_number
        FROM orders
        WHERE id = $1
          AND seller_id = $2
        `,
        [orderId, sellerId]
      );

      if(!existingOrder.rows.length){
        return res.status(404).json({
          error:'Order not found'
        });
      }

      return res.json({
        ok:true,
        unchanged:true,
        order:existingOrder.rows[0]
      });
    }
 

  
    /* ===== BUYER SHIPPING NOTIFICATION ===== */

    const updatedOrder = result.rows[0];

    if (
      updatedOrder.status === "Shipped" ||
      updatedOrder.status === "Delivered"
    ) {

      try {

        await sendBuyerShippingEmail(updatedOrder);

      } catch (emailError) {

        console.error(
          "Buyer shipping email failed:",
          emailError.message
        );

      }

    }

    /* ===== END SHIPPING NOTIFICATION ===== */

    res.json({
      ok:true,
      order:updatedOrder
    });
  

  }catch(err){

    console.error(
      'Update order status error:',
      err
    );

    res.status(500).json({
      error:'Could not update order status'
    });
  }
});
/* ===== UPDATE SELLER ORDER TRACKING ===== */

app.patch('/api/seller/orders/:id/tracking', async (req,res)=>{
  try{

    if(!req.session.sellerId){
      return res.status(401).json({
        error:'Not signed in'
      });
    }

    const orderId =
      Number(req.params.id);

    const sellerId =
      Number(req.session.sellerId);

    const shippingCarrier =
      String(req.body.shipping_carrier || '').trim();

    const trackingNumber =
      String(req.body.tracking_number || '').trim();

    const allowedCarriers = [
      'USPS',
      'UPS',
      'FedEx',
      'DHL',
      'Other'
    ];

    if(!Number.isInteger(orderId)){
      return res.status(400).json({
        error:'Invalid order id'
      });
    }

    if(!allowedCarriers.includes(shippingCarrier)){
      return res.status(400).json({
        error:'Invalid shipping carrier'
      });
    }

    if(
      trackingNumber.length < 3 ||
      trackingNumber.length > 100
    ){
      return res.status(400).json({
        error:'Invalid tracking number'
      });
    }

    const result = await db.query(
      `
      UPDATE orders

      SET
        shipping_carrier = $1,
        tracking_number = $2

      WHERE id = $3
        AND seller_id = $4

      RETURNING
        id,
        shipping_carrier,
        tracking_number,
        status
      `,
      [
        shippingCarrier,
        trackingNumber,
        orderId,
        sellerId
      ]
    );

    if(!result.rows.length){
      return res.status(404).json({
        error:'Order not found'
      });
    }

    res.json({
      ok:true,
      order:result.rows[0]
    });

  }catch(err){

    console.error(
      'Update order tracking error:',
      err
    );

    res.status(500).json({
      error:'Could not update tracking information'
    });
  }
});
app.post('/api/connect/create-account',async (req,res)=>{
if (!req.session.user || req.session.user.role !== "seller") return res.status(401).json({ error: "Seller login required" });
const userId = req.session.user.id; 
const email = String(req.body.email ||
 '').trim().toLowerCase();
 if (!email) return res.status(400).json({error:'Email is required'});
 const sellerResult = await db.query('SELECT * FROM sellers WHERE user_id = $1 OR email = $2', [userId, email]); 
 const existingSeller = sellerResult.rows[0];
 const account = existingSeller &&
  existingSeller.stripe_account_id ? {id:
   existingSeller.stripe_account_id} : await
 stripe.accounts.create({type:'express'});

if (existingSeller) await db.query('UPDATE sellers SET stripe_account_id = $1, user_id = $2 WHERE id = $3', [account.id, userId, existingSeller.id]);
else await db.query('INSERT INTO sellers (stripe_account_id, email, user_id) VALUES ($1, $2, $3)', [account.id, email, userId]); 
req.session.sellerId = existingSeller ? existingSeller.id : (await db.query('SELECT id FROM sellers WHERE user_id = $1', [userId])).rows[0].id; 
await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
 const link = await stripe.accountLinks.create({
account: account.id,
refresh_url: BASE_URL,
return_url: BASE_URL,
type: 'account_onboarding',
});
res.json({url: link.url, accountId: account.id});
});








app.listen(process.env.PORT || 3000, () => {
  console.log('Jexali API running on port 3000');
});







