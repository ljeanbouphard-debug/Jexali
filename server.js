require('dotenv').config();
const { Pool } = require('pg');
const cors = require('cors')
const express = require('express');
const stripe = require('stripe') (process.env.STRIPE_SECRET_KEY);

const db = new Pool({connectionString: process.env.DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.get('/api/key-length', (req, res) => {
 res.json({ length:
  process.env.STRIPE_SECRET_KEY ?
  process.env.STRIPE_SECRET_KEY.length :
  O });
});
app.get('/api/stripe-test', async (req,res) => {
 try { const account = await stripe.accounts.retrieve();
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
db.query(`CREATE TABLE IF NOT EXISTS sellers (id SERIAL PRIMARY KEY, stripe_account_id TEXT UNIQUE, email TEXT UNIQUE)`);
db.query("CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, stripe_session_id TEXT UNIQUE, seller_id INTEGER, amount REAL DEFAULT 0, seller_earnings REAL DEFAULT 0, jexali_fee REAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");




db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id INTEGER");
app.post('/api/products', async (req,res)=>{
const p = req.body
const sellerRow = (await db.query('SELECT id FROM sellers WHERE stripe_account_id = $1', [p.seller])).rows[0];
 const r = await db.query('INSERT INTO products (name, price,seller, seller_id, stock, category, image, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id', [p.name, p.price, p.seller, sellerRow?.id, p.stock || 0, p.category, p.image, p.description]);
 const newID = r.rows[0].id;
res.status(201).json({id:newID});
});
app.delete('/api/products/:id', async (req,res)=>{const id = Number(req.params.id);if (!Number.isInteger(id)) return res.status(400).json({error:'Invalid product id'}); const result = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]); if (result.rows.length === 0) return res.status(404).json({error:'Product not foud'}); res.json({ok:true,id:result.rows[0].id}); });
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
 const sellerId = Number(req.query.seller_id);
 if (!Number.isInteger(sellerId)) return res.status(400).json({error:'Invalid seller'});
 const result = await db.query(
  'SELECT COUNT(*)::int AS sales, COALESCE(SUM(seller_earnings),0) AS seller_earnings, COALESCE(SUM(jexali_fee),0) AS jexali_fees FROM orders WHERE seller_id = $1',
  [sellerId]
  );
 const stats = result.rows[0];
 res.json({sales:stats.sales, sellerEarnings:Number(stats.seller_earnings), jexaliFees:Number(stats.jexali_fees)});
});
app.post('/api/connect/create-account',async (req,res)=>{
const email = String(req.body.email ||
 '').trim().toLowerCase();
 if (!email) return res.status(400).json({error:'Email is required'});
 const sellerResult = await db.query('SELECT * FROM sellers WHERE email = $1', [email]); 
 const existingSeller = sellerResult.rows[0];
 const account = existingSeller &&
  existingSeller.stripe_account_id ? {id:
   existingSeller.stripe_account_id} : await
 stripe.accounts.create({type:'express'});

if (existingSeller) await db.query('UPDATE sellers SET stripe_account_id = $1 WHERE email = $2', [account.id, email]);
else await db.query('INSERT INTO sellers (stripe_account_id, email) VALUES ($1, $2)', [account.id, email]);                             
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

