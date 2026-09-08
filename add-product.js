const db = require('better-sqlite3')('jexali.db');
const stmt = db.prepare(`INSERT INTO products (name,price,description,category,image,seller,stock)
VALUES(?,?,?,?,?,?,?)`);
stmt.run('Test Product', 19.99, 'First Jexali product', 'Test', '','Jexali Seller', 10);
console.log('Product added');
