require('dotenv').config();
const Database = require('better-sqlite3');
const cors = require('cors')
const express = require('express');
const stripe = require('stripe') (process.env.STRIPE_SECRET_KEY);

const db = new Database('jexali.db');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.get('/api/key-length', (req, res) => {
 res.json({ length:
  process.env.STRIPE_SECRET_KEY? });
});
app.get('/api/stripe-test', async (req,res) => {
 try { const account = await stripe.accounts.retrieve();
      res.json({ ok: true, id: account.id });
     } catch (err) {
  res.status(500).json({ ok: false,
   error: err.message });                     
} 
});
db.exec("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, seller TEXT, stock INTEGER DEFAULT 0)");
app.get('/api/products', (req,res)=>{
const products = db.prepare('SELECT * FROM products').all();
res.json(products);
});
db.exec(`
CREATE TABLE IF NOT EXISTS sellers (
id INTEGER PRIMARY KEY AUTOINCREMENT,
stripe_account_id TEXT UNIQUE,
email TEXT UNUQUE
);`);
app.post('/api/products', (req,res)=>{
const p = req.body
const stmt = db.prepare('INSERT INTO products (name, price, seller, stock) VALUES (?,?,?,)');
const r = stmt.run(p.name, p.price, p.seller, p.stock || 0);
res.status(201).json({id:r.lastInsertRowid});
});
app.post('/api/checkout',async (req,res)=>{
const cart=req.body.cart;
 if(!Array.isArray(cart)||
cart.length===0)
 return res.status(400).json({error:'Cart is empty'});
const session = await stripe.checkout.sessions.create({
mode:'payment',
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
success_url:'http://localhost:8000/?success=1&session_id={CHECKOUT_SESSION_ID}',
cancel_url:'http://localhost:8000/?canceled=1',
});
res.json({url:session.url});
});
app.post('/api/connect/create-account',async (req,res)=>{
console.log("Stripe KEY PRESENT:", !! process.env.STRIPE_SECRET_KEY, "LENGTH:",(process.env.STRIPE_SECRET_KEY ||"").length);
const account = await stripe.accounts.create({type: 'express',});
 const link = await stripe.accountLinks.create({
account: account.id,
refresh_url: 'https://jexali.onrender.comc',
return_url: 'https://jexali.onrender.com',
type: 'account_onboarding',
});
res.json({url: link.url, accountId: account.id});
});

app.listen(3000, ()=>{
console.log('Jexali API running on port 3000');
});

