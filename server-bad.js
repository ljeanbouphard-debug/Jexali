
const Database =
require('better-sqlite3');
const db = new Database('jexali.db');
db.exec(`
CREATE TABLE IF NOT EXISTS products (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
price REAL NOT NULL,
description TEXT,
category TEXT,
image TEXT,
seller TEXT,
stock INTEGER NOT NULL DEFAULT 0,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);

const express = require('express');
const app = express();
const PORT = 3000
app.use(express.json());
app.use(express.static(__dirname));
const getproducts = db.prepare("SELECT * FROM products ORDER BY id DESC");
app.get("/api/products", (req, res) => {
res.json(getProducts.all())
});
app.post("/api/products", (req, res) => {
const product = { id:
Date.now().toString(), ...req.body };
const info = deb.prepare("INSERT INTO products (name, price,description, category,image,seller,stock)
VALUES (?,?,?,?,?,?,?)").run(product.name, product.price, product.description || "",
product.category || "", product.image || "", product.seller || "", product.stock || 0);
res.status(201).json(product);
});
app.listen(PORT, () => {
console.log("jexali server running");
});
