require('dotenv').config();
const { Pool } = require('pg');
const cors = require('cors')
const express = require('express');
const session = require("express-session");
const bcrypt = require("bcryptjs");
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
secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxeAge: 30 * 24 * 60 * 60 * 1000}}));

app.post("/api/login", async (req, res) => {
 try { const { email, password } = req.body; if (!email || !password) { return res.status(400).json({ error: "Email and password are required" }); } const normalizedEmail = email.trim().toLowerCase(); const result = await db.query("SELECT id, name, email, password_hash, role FROM users WHERE email = $1", [normalizedEmail]); const user = result.rows[0]; if (!user || !(await bcrypt.compare(password, user.password_hash))) { return res.status(401).json({ error:"Invalid email or password" }); } req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
const sellerResult = await db.query("SELECT id FROM sellers WHERE user_id = $1", [user.id]);
if (sellerResult.rows[0]) req.session.sellerId = sellerResult.rows[0].id;      
res.json({ success: true, user: req.session.user }); } catch (err) { console.error(err); res.status(500).json({ error: "Could not log in" }); } });
app.get("/api/me" , (req, res) => {
if (!req.session.user) { 
return res.status(401).json({ error: "Not logged in" });
}
res.json({ success: true, user: req.session.user });
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
  O });
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
app.get('/api/products', async (req,res)=>{
const products = (await db.query('SELECT * FROM products')).rows;
res.json(products);
});
app.get('/api/seller/products', async (req,res)=>{if (!req.session.sellerId) return res.status(401).json({error:'NOT signed in'}); const products = (await db.query('SELECT * FROM products WHERE seller_id = $1', [Number(req.session.sellerId)])).rows; res.json(products);});
db.query(`CREATE TABLE IF NOT EXISTS sellers (id SERIAL PRIMARY KEY, stripe_account_id TEXT UNIQUE, email TEXT UNIQUE)`);
db.query("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS user_id INTEGER UNIQUE");
db.query("CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, stripe_session_id TEXT UNIQUE, seller_id INTEGER, amount REAL DEFAULT 0, seller_earnings REAL DEFAULT 0, jexali_fee REAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");




db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id INTEGER");
app.post('/api/products', async (req,res)=>{
const p = req.body
 if (!req.session.sellerId) return res.status(401).json({error:'Not signed in'});
const sellerRow = { id:Number(req.session.sellerId) };
 const r = await db.query('INSERT INTO products (name, price,seller, seller_id, stock, category, image, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id', [p.name, p.price, p.seller, sellerRow?.id, p.stock || 0, p.category, p.image, p.description]);
 const newID = r.rows[0].id;
res.status(201).json({id:newID});
});
app.delete('/api/products/:id', async (req,res)=>{if (!req.session.sellerId) return res.status(401).json({error:'Not signed in'}); const id = Number(req.params.id); if (!Number.isInteger(id)) return res.status(400).json({error:'Invalid product id'}); const result = await db.query('DELETE FROM products WHERE id = $1 AND seller_id = $2 RETURNING id', [id, Number(req.session.sellerId)]); if (result.rows.length === 0) return res.status(404).json({error:'Product not found'}); res.json({ok:true,id:result.rows[0].id});});
app.post('/api/checkout',async (req,res)=>{
const cart=req.body.cart;
 
 if(!Array.isArray(cart)||
cart.length===0)
 return res.status(400).json({error:'Cart is empty'});
 const productIds = cart.map(item =>String(item.id).replace(/^p/,""));
 
 const quantities = cart.map(item => Number(item.quantity || 1));
 if (quantities.some(q => ! Number.isInteger(q) || q < 1 || q > 99)) return res.status(400).json({error:'Invalid quantity'});
 const dbProducts = (await db.query('SELECT * FROM products WHERE id = ANY($1::int[])',[productIds])).rows;


 if (dbProducts.length !== productIds.length) { return res.status(400).json({eror:'Invalid product in cart'});}
 const outOfStock = dbProducts.find(p => (cart.find(c => String(c.id).replace(/^p/,"") ===String(p.id))?.quantity || 1) > p.stock);
if (outOfStock) return res.status(400).json({error:'Not enough stock'}); 
const sellerIds = dbProducts.map(product => product.seller_id);
 const allSameSellerId = sellerIds.every(id => id === sellerIds[0]);
if (!allSameSellerId || !sellerIds[0]) return res.status(400).json({error:'Products must belong to one valid seller'});
 
const sellerResult = await db.query('SELECT stripe_account_id FROM sellers WHERE id = $1', [sellerIds[0]]);
if (sellerResult.rows.length === 0) return res.status(400).json({error:'Seller not found'});
const sellerStripeId = sellerResult.rows[0].stripe_account_id;
 
const session = await stripe.checkout.sessions.create({
mode:'payment',
 metadata: { seller_id: String(sellerIds[0]) },
branding_settings: { display_name:' Jexali ' },
line_items: dbProducts.map(item=>({
price_data:{
currency:'usd',
product_data:{
name:item.name,
metadata:{product_id:String(item.id)}, 
},
unit_amount:Math.round(item.price*100),
},
quantity:(cart.find(c => c.id === item.id)?.quantity || 1),
})),
...(sellerStripeId ? {payment_intent_data:
{application_fee_amount: Math.round(dbProducts.reduce((sum, item)=>
 sum + Math.round(item.price * 100)
 * (cart.find(c => c.id === item.id)?.quantity || 1), 0
        ) * 0.10
       ),
 transfer_data: {
  destination: sellerStripeId
 }
}
                     } : {}),
                                                                           
success_url:'https://jexali.onrender.com/?success=1& session_id={CHECKOUT_SESSION_ID}',
cancel_url:'https://jexali.onrender.com/?canceled=1',
});
 
res.json({url:session.url});
});
app.get('/api/checkout/verify', async (req,res)=>{
 const sessionId = String(req.query.session_id || '');
 if (!sessionId) return res.status(400).json({error:'Missing session id'});
 const session = await stripe.checkout.sessions.retrieve(sessionId);
 if (sessions.payment_status !== 'paid') return res.status(400).json({error:'Payment not completed'});
 const sellerId = Number(session.metadata?.seller_id);
 if (!Number.isInteger(sellerId)) return res.status(400).json({error:'Invalid seller'});
 const amount = Number(session.amount_total || 0) / 100;
 const jexaliFee = amount * 0.10;
 const sellerEarnings = amount - jexaliFee;
await db.query( 
 'INSERT INTO orders (stripe_session_id, seller_id, amount, seller_earnings, jexali_fee) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (stripe_session_id) DO NOTHING',
 [session.id, sellerId, amount, sellerEarnings, jexaliFee]
 );
 res.json({ok:true, sales:1, sellerEarning, jexaliFee});
});
app.get('/api/seller/stats', async (req,res)=>{
if (!req.session.sellerId) return res.status(401).json({error:'Not signed in'}); const sellerId = Number(req.session.sellerId); 
 const result = await db.query(
  'SELECT COUNT(*)::int AS sales, COALESCE(SUM(seller_earnings),0) AS seller_earnings, COALESCE(SUM(jexali_fee),0) AS jexali_fees FROM orders WHERE seller_id = $1',
  [sellerId]
  );
 const stats = result.rows[0];
 res.json({sales:stats.sales, sellerEarnings:Number(stats.seller_earnings), jexaliFees:Number(stats.jexali_fees)});
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

