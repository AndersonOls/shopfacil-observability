'use strict';

const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');

const SEED_STOCK = [
  { productId: 1, available: 100 },
  { productId: 2, available: 50 },
  { productId: 3, available: 10 },
  { productId: 4, available: 75 },
  { productId: 5, available: 200 },
  { productId: 6, available: 30 },
];

function createInventoryDb(path = ':memory:') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock (
      product_id INTEGER PRIMARY KEY,
      available INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS total FROM stock').get().total;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO stock (product_id, available) VALUES (@productId, @available)',
    );
    const seed = db.transaction((rows) => {
      for (const row of rows) {
        insert.run(row);
      }
    });
    seed(SEED_STOCK);
  }

  const reserve = db.transaction((productId, quantity) => {
    const stock = db
      .prepare('SELECT available FROM stock WHERE product_id = ?')
      .get(productId);
    if (!stock) {
      return { ok: false, reason: 'product_not_found' };
    }
    if (stock.available < quantity) {
      return { ok: false, reason: 'insufficient_stock', available: stock.available };
    }
    db.prepare(
      'UPDATE stock SET available = available - ? WHERE product_id = ?',
    ).run(quantity, productId);
    const reservationId = randomUUID();
    db.prepare(
      'INSERT INTO reservations (id, product_id, quantity, status, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(reservationId, productId, quantity, 'active', new Date().toISOString());
    const remaining = db
      .prepare('SELECT available FROM stock WHERE product_id = ?')
      .get(productId).available;
    return { ok: true, reservationId, productId, quantity, remaining };
  });

  const release = db.transaction((reservationId) => {
    const reservation = db
      .prepare('SELECT * FROM reservations WHERE id = ?')
      .get(reservationId);
    if (!reservation || reservation.status !== 'active') {
      return { ok: true, released: false, status: 'noop' };
    }
    db.prepare(
      'UPDATE stock SET available = available + ? WHERE product_id = ?',
    ).run(reservation.quantity, reservation.product_id);
    db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(
      'released',
      reservationId,
    );
    const remaining = db
      .prepare('SELECT available FROM stock WHERE product_id = ?')
      .get(reservation.product_id).available;
    return {
      ok: true,
      released: true,
      status: 'released',
      productId: reservation.product_id,
      quantity: reservation.quantity,
      remaining,
    };
  });

  return {
    db,
    reserve,
    release,
    getStock(productId) {
      return db
        .prepare('SELECT product_id, available FROM stock WHERE product_id = ?')
        .get(productId);
    },
    getReservation(id) {
      return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createInventoryDb, SEED_STOCK };
