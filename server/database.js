const path = require("path")
const sqlite3 = require("sqlite3").verbose()

const dbPath = path.join(__dirname, "shop.db")
console.log("DB FILE:", dbPath)

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.log("Ошибка базы:", err.message)
  } else {
    console.log("База данных подключена")
  }
})

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steamId TEXT UNIQUE,
      username TEXT,
      balance INTEGER DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steamId TEXT,
      amount INTEGER,
      status TEXT,
      type TEXT,
      note TEXT,
      createdAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steamId TEXT,
      product TEXT,
      price INTEGER,
      quantity INTEGER DEFAULT 1,
      createdAt TEXT,
      status TEXT DEFAULT 'Ожидает выдачи',
      updatedAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS roulette_drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steamId TEXT,
      username TEXT,
      avatar TEXT,
      productName TEXT,
      productPrice INTEGER,
      createdAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS promocode_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steamId TEXT,
      code TEXT,
      amount INTEGER,
      createdAt TEXT,
      UNIQUE(steamId, code)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT,
      category TEXT,
      price INTEGER,
      discountPercent INTEGER DEFAULT 0,
      image TEXT,
      isActive INTEGER DEFAULT 1,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adminSteamId TEXT,
      action TEXT,
      target TEXT,
      details TEXT,
      createdAt TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS promocodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      amount INTEGER,
      maxUses INTEGER DEFAULT 1,
      expiresAt TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  const defaultPromocodes = [
    ["REDMOONSTART", 100],
    ["REDMOONSUMMER", 100],
    ["BAK10", 100]
  ]

  defaultPromocodes.forEach(([code, amount]) => {
    db.run(
      `
      INSERT OR IGNORE INTO promocodes (code, amount, maxUses, expiresAt, isActive, createdAt, updatedAt)
      VALUES (?, ?, 999999, NULL, 1, ?, ?)
      `,
      [code, amount, new Date().toISOString(), new Date().toISOString()]
    )

    db.run(
      `
      UPDATE promocodes
      SET maxUses = 999999
      WHERE code = ? AND maxUses = 1
      `,
      [code]
    )
  })

  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (err) return console.log("Ошибка проверки users:", err.message)

    const hasSteamId = columns.some((col) => col.name === "steamId")

    if (!hasSteamId) {
      db.run("ALTER TABLE users ADD COLUMN steamId TEXT", (err) => {
        if (err) console.log("Ошибка добавления steamId:", err.message)
        else console.log("Колонка steamId добавлена")
      })
    }
  })

  db.all("PRAGMA table_info(purchases)", (err, columns) => {
    if (err) return console.log("Ошибка проверки purchases:", err.message)

    const hasQuantity = columns.some((col) => col.name === "quantity")
    const hasCreatedAt = columns.some((col) => col.name === "createdAt")
    const hasStatus = columns.some((col) => col.name === "status")
    const hasUpdatedAt = columns.some((col) => col.name === "updatedAt")

    if (!hasQuantity) {
      db.run("ALTER TABLE purchases ADD COLUMN quantity INTEGER DEFAULT 1", (err) => {
        if (err) console.log("Ошибка добавления quantity:", err.message)
        else console.log("Колонка quantity добавлена")
      })
    }

    if (!hasCreatedAt) {
      db.run("ALTER TABLE purchases ADD COLUMN createdAt TEXT", (err) => {
        if (err) console.log("Ошибка добавления createdAt:", err.message)
        else console.log("Колонка createdAt добавлена")
      })
    }

    if (!hasStatus) {
      db.run("ALTER TABLE purchases ADD COLUMN status TEXT DEFAULT 'Ожидает выдачи'", (err) => {
        if (err) console.log("Ошибка добавления purchases.status:", err.message)
        else console.log("Колонка purchases.status добавлена")
      })
    }

    if (!hasUpdatedAt) {
      db.run("ALTER TABLE purchases ADD COLUMN updatedAt TEXT", (err) => {
        if (err) console.log("Ошибка добавления purchases.updatedAt:", err.message)
        else console.log("Колонка purchases.updatedAt добавлена")
      })
    }
  })

  db.all("PRAGMA table_info(payments)", (err, columns) => {
    if (err) return console.log("Ошибка проверки payments:", err.message)

    const hasType = columns.some((col) => col.name === "type")
    const hasNote = columns.some((col) => col.name === "note")
    const hasCreatedAt = columns.some((col) => col.name === "createdAt")

    if (!hasType) {
      db.run("ALTER TABLE payments ADD COLUMN type TEXT", (err) => {
        if (err) console.log("Ошибка добавления type:", err.message)
        else console.log("Колонка payments.type добавлена")
      })
    }

    if (!hasNote) {
      db.run("ALTER TABLE payments ADD COLUMN note TEXT", (err) => {
        if (err) console.log("Ошибка добавления note:", err.message)
        else console.log("Колонка payments.note добавлена")
      })
    }

    if (!hasCreatedAt) {
      db.run("ALTER TABLE payments ADD COLUMN createdAt TEXT", (err) => {
        if (err) console.log("Ошибка добавления createdAt:", err.message)
        else console.log("Колонка payments.createdAt добавлена")
      })
    }
  })

  db.all("PRAGMA table_info(products)", (err, columns) => {
    if (err) return console.log("Ошибка проверки products:", err.message)

    const hasDiscountPercent = columns.some((col) => col.name === "discountPercent")
    const hasSortOrder = columns.some((col) => col.name === "sortOrder")

    if (!hasDiscountPercent) {
      db.run("ALTER TABLE products ADD COLUMN discountPercent INTEGER DEFAULT 0", (err) => {
        if (err) console.log("Ошибка добавления products.discountPercent:", err.message)
        else console.log("Колонка products.discountPercent добавлена")
      })
    }

    if (!hasSortOrder) {
      db.run("ALTER TABLE products ADD COLUMN sortOrder INTEGER DEFAULT 0", (err) => {
        if (err) console.log("Ошибка добавления products.sortOrder:", err.message)
        else console.log("Колонка products.sortOrder добавлена")
      })
    }
  })
})

module.exports = db
