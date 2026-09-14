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
app.get('/api/products', async (req,res)=>{
const products = (await db.query('SELECT * FROM products')).rows;
res.json(products);
});
db.query(`CREATE TABLE IF NOT EXISTS sellers (id SERIAL PRIMARY KEY, stripe_account_id TEXT UNIQUE, email TEXT UNIQUE,)`);
app.post('/api/products', async (req,res)=>{
const p = req.body
const r = await db.query('INSERT INTO products (name, price,seller, stock) VALUES ($1, $2, $3, $4) RETURNING id',[p.name, p.price, p.seller, p.stock || 0]); 
 const newID = r.rows[0].id;
res.status(201).json({id:newId});
});
app.post('/api/checkout',async (req,res)=>{
const cart=req.body.cart;
 
 if(!Array.isArray(cart)||
cart.length===0)
 return res.status(400).json({error:'Cart is empty'});
 const hasSeller=cart.some(item=>item.seller);
 const allSameSeller=hasSeller&&cart.every(item=>
  item.seller===cart[0].seller);
 if(hasSeller&&!allSameSeller)return res.status(400).json({error:"Please checkout products from one seller at a time."});
 const sellerStripeId=allSameSeller?
  cart[0].seller:null;
const session = await stripe.checkout.sessions.create({
mode:'payment',
branding_settings: { display_name:' Jexali ' },
line_items: cart.map(item=>({
price_data:{
currency:'usd',
product_data:{
name:item.name,
},
unit_amount:Math.round(item.price*100),
},
quantity:item.quantity||1,
})),
...(sellerStripeId ? {payment_intent_data:
{application_fee_amount: Math.round(cart.reduce((sum, item)=>
 sum + Math.round(item.price * 100)
 * (item.quantity || 1), 0
        ) * 0.10
       ),
 transfer_data: {
  destination: sellerStripeId
 }
}
                     } : {}),
                                                                           
success_url:'http://localhost:8000/?success=1&session_id={CHECKOUT_SESSION_ID}',
cancel_url:'http://localhost:8000/?canceled=1',
});
 
res.json({url:session.url});
});
app.post('/api/connect/create-account',async (req,res)=>{
const email = String(req.body.email ||
 '').trim().toLowerCase();
 if (!email) return res.status(400).json({error:'Email is required'});
 const sellerResult = await db.query('SELECT * FROM sellers WHERE amail = $1', [email]); 
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

