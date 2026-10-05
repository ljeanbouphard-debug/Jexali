require('dotenv').config();
const { Pool } = require('pg');
const cors = require('cors')
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
const stripeTest = require('stripe') (process.env.STRIPE_TEST_SECRET_KEY);

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
app.use(cors());
app.post('/api/stripe-webhook',express.raw({type:'application/json'}),async (req,res)=>{
const sig = req.headers['stripe-signature'];

 
let event; 
try { 
event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); 
} catch (err) { 
return res.status(400).send(`webhook Error: ${err.message}`); 
} 
if (event.type === 'checkout.session.completed') { 
const session = event.data.object;
const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {limit:100,expand:['data.price.product']});
for (const item of lineItems.data) { 
const productId= Number(item.price.product.metadata.product_id); 
const quantity = item.quantity || 1;
if (!Number.isInteger(productId)) continue; 
await db.query('UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2', [quantity, productId]); 
} 
}
res.json({received:true}); 
}); 
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
   return
   res.status(401).json({ error: "Not signed in" });
  }
  next();
 },
 upload.single("image"),
 async ( req, res) => {
  try {
   if (!req.file) {
    return
    res.status(400).json({ error: "No image selected" });
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
app.get('/api/key-length', (req, res) => {
 res.json({ length:
  process.env.STRIPE_SECRET_KEY ?
  process.env.STRIPE_SECRET_KEY.length :
  0 });
});
app.get('/api/test-key-info', (req,res)=> {const key = process.env.STRIPE_TEST_SECRET_KEY || ''; res.json({exists: !!key, length: key.length,startsWithSkTest: key.startsWith('sk_test_'),hasWhitespace: /\s/.test(key),lastCharCode: key.length ? key.charCodeAt(key.length - 1) : null });});

app.get('/api/stripe-test', async (req,res) => {
 try { const account = await stripeTest.accounts.retrieve();
      res.json({ ok: true, id: account.id });
     } catch (err) {
  res.status(500).json({ ok: false,
   error: err.message });                     
} 
});
db.query("CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT, price REAL, seller TEXT, stock INTEGER DEFAULT 0)");
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


db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id INTEGER");
app.post('/api/products', async (req,res)=>{
const p = req.body
 if (p.image && /^https?:\/\//i.test(p.image) && ! p.image.includes("res.cloudinary.com/")) {
  try {
   p.image = await
   uploadUrlToCloudinary(p.image);
  } catch (err) {
   console.error("Image URL upload failed:", err.message); return
   res.status(400).json({ error: "Could not save product image" });
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
    colors,
    clothing_sizes,
    shoe_sizes,
    waist_sizes
  )
  VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
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
    JSON.stringify(Array.isArray(p.colors) ? p.colors : []),
    JSON.stringify(Array.isArray(p.clothing_sizes) ? p.clothing_sizes : []),
    JSON.stringify(Array.isArray(p.shoe_sizes) ? p.shoe_sizes : []),
    JSON.stringify(Array.isArray(p.waist_sizes) ? p.waist_sizes : [])
  ]
);                          
 const newID = r.rows[0].id;
res.status(201).json({id:newID});
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
          'https://jexali.onrender.com/?success=1&session_id={CHECKOUT_SESSION_ID}',

        cancel_url:
          'https://jexali.onrender.com/?canceled=1'
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
      String(req.query.session_id || '');

    if(!sessionId){
      return res.status(400).json({
        error:'Missing session id'
      });
    }

    const session =
      await stripe.checkout.sessions.retrieve(
        sessionId
      );

    if(session.payment_status !== 'paid'){
      return res.status(400).json({
        error:'Payment not completed'
      });
    }
const customerDetails =
  session.customer_details || {};

const shippingDetails =
  session.shipping_details || {};

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
    const sellerId =
      Number(session.metadata?.seller_id);
const buyerUserId =
  session.metadata?.buyer_user_id
    ? Number(session.metadata.buyer_user_id)
    : null;
    if(!Number.isInteger(sellerId)){
      return res.status(400).json({
        error:'Invalid seller'
      });
    }

    const amount =
      Number(session.amount_total || 0) / 100;

    const shippingAmount =
      Number(
        session.metadata?.shipping_total_cents || 0
      ) / 100;

    const jexaliFee =
      (amount - shippingAmount) * 0.10;

    const sellerEarnings =
      amount - jexaliFee;

    /* Create or reuse the order */

  const orderResult = await db.query(
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
  DO UPDATE SET
    seller_id = EXCLUDED.seller_id,
    buyer_user_id = EXCLUDED.buyer_user_id,
    amount = EXCLUDED.amount,
    seller_earnings = EXCLUDED.seller_earnings,
    jexali_fee = EXCLUDED.jexali_fee,
    buyer_name = EXCLUDED.buyer_name,
    buyer_email = EXCLUDED.buyer_email,
    buyer_phone = EXCLUDED.buyer_phone,
    shipping_name = EXCLUDED.shipping_name,
    shipping_line1 = EXCLUDED.shipping_line1,
    shipping_line2 = EXCLUDED.shipping_line2,
    shipping_city = EXCLUDED.shipping_city,
    shipping_state = EXCLUDED.shipping_state,
    shipping_postal_code = EXCLUDED.shipping_postal_code,
    shipping_country = EXCLUDED.shipping_country

  RETURNING id
  `,
  [
    session.id,
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

    const orderId =
      orderResult.rows[0].id;

    /* Get Stripe products and their options */

    const lineItems =
      await stripe.checkout.sessions.listLineItems(
        session.id,
        {
          limit:100,
          expand:['data.price.product']
        }
      );

    for(const item of lineItems.data){

      const stripeProduct =
        item.price?.product;

      if(
        !stripeProduct ||
        typeof stripeProduct !== 'object'
      ){
        continue;
      }

      const metadata =
        stripeProduct.metadata || {};

      const productId =
        Number(metadata.product_id);

      /* Shipping has no product_id */
      if(!Number.isInteger(productId)){
        continue;
      }

      const quantity =
        Number(item.quantity || 1);

      const unitPrice =
        Number(item.price?.unit_amount || 0) / 100;

      await db.query(
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
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
        )
        ON CONFLICT DO NOTHING
        `,
        [
          orderId,
          productId,
          stripeProduct.name ||
            item.description ||
            'Product',
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

    res.json({
      ok:true,
      sales:1,
      sellerEarnings,
      jexaliFee
    });

  }catch(err){

    console.error(
      "Checkout verification error:",
      err
    );

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

        o.status

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

      SET status = $1

      WHERE id = $2
        AND seller_id = $3

      RETURNING
        id,
        status
      `,
      [
        status,
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
      'Update order status error:',
      err
    );

    res.status(500).json({
      error:'Could not update order status'
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
refresh_url: 'https://jexali.onrender.com',
return_url: 'https://jexali.onrender.com',
type: 'account_onboarding',
});
res.json({url: link.url, accountId: account.id});
});

app.listen(process.env.PORT || 3000, ()=>{
console.log('Jexali API running on port 3000');
});

