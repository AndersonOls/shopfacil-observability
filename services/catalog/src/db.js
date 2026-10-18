'use strict';

const Database = require('better-sqlite3');

const SEED_PRODUCTS = [
  { id: 1, name: 'Mouse Gamer RGB', price: 149.9 },
  { id: 2, name: 'Teclado Mecanico', price: 299.0 },
  { id: 3, name: 'Monitor 27 Polegadas', price: 1299.0 },
  { id: 4, name: 'Headset 7.1', price: 199.9 },
  { id: 5, name: 'Mousepad XL', price: 59.9 },
  { id: 6, name: 'Webcam Full HD', price: 249.0 },
];

function createCatalogDb(path = ':memory:') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS total FROM products').get().total;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO products (id, name, price) VALUES (@id, @name, @price)',
    );
    const seed = db.transaction((rows) => {
      for (const row of rows) {
        insert.run(row);
      }
    });
    seed(SEED_PRODUCTS);
  }

  return {
    db,
    listProducts(query) {
      if (query) {
        return db
          .prepare(
            'SELECT id, name, price FROM products WHERE LOWER(name) LIKE ? ORDER BY id',
          )
          .all(`%${String(query).toLowerCase()}%`);
      }
      return db
        .prepare('SELECT id, name, price FROM products ORDER BY id')
        .all();
    },
    getProduct(id) {
      return db
        .prepare('SELECT id, name, price FROM products WHERE id = ?')
        .get(id);
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createCatalogDb, SEED_PRODUCTS };
