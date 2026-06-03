const path = require("path")
const fs = require("fs")

const DATABASE_URL = process.env.DATABASE_URL || ""

const camelKeyMap = {
  steamid: "steamId",
  createdat: "createdAt",
  updatedat: "updatedAt",
  productname: "productName",
  productprice: "productPrice",
  maxuses: "maxUses",
  expiresat: "expiresAt",
  isactive: "isActive",
  sortorder: "sortOrder",
  discountpercent: "discountPercent",
  adminsteamid: "adminSteamId",
  providerpaymentid: "providerPaymentId",
  provideramount: "providerAmount",
  creditedamount: "creditedAmount",
  customeremail: "customerEmail",
  totalreplenished: "totalReplenished"
}

const normalizeError = (err) => {
  if (!err) return err

  if (err.code === "23505" && !String(err.message || "").includes("UNIQUE")) {
    err.message = `UNIQUE constraint failed: ${err.message}`
  }

  return err
}

const normalizeRow = (row) => {
  if (!row || typeof row !== "object") return row

  return Object.entries(row).reduce((result, [key, value]) => {
    result[camelKeyMap[key] || key] = value
    return result
  }, {})
}

const normalizeRows = (rows) => (rows || []).map(normalizeRow)

const pgIdentifierMap = {
  steamId: "steamid",
  createdAt: "createdat",
  updatedAt: "updatedat",
  productName: "productname",
  productPrice: "productprice",
  maxUses: "maxuses",
  expiresAt: "expiresat",
  isActive: "isactive",
  sortOrder: "sortorder",
  discountPercent: "discountpercent",
  adminSteamId: "adminsteamid",
  providerPaymentId: "providerpaymentid",
  providerAmount: "provideramount",
  creditedAmount: "creditedamount",
  customerEmail: "customeremail",
  totalReplenished: "totalreplenished"
}

const insertTablesWithId = new Set([
  "users",
  "payments",
  "purchases",
  "roulette_drops",
  "roulette_spins",
  "promocode_redemptions",
  "products",
  "admin_logs",
  "promocodes"
])

const translateSqliteToPostgres = (sql) => {
  let translated = String(sql || "").trim()

  translated = translated.replace(/\bBEGIN\s+IMMEDIATE\b/gi, "BEGIN")
  translated = translated.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO")
  translated = translated.replace(/\bMAX\s*\(\s*balance\s*-\s*\?\s*,\s*0\s*\)/gi, "GREATEST(balance - ?, 0)")

  Object.entries(pgIdentifierMap).forEach(([sqliteName, pgName]) => {
    translated = translated.replace(new RegExp(`\\b${sqliteName}\\b`, "g"), pgName)
  })

  const insertIgnoreLike = /^\s*INSERT\s+INTO\s+\w+\s*\(/i.test(translated) &&
    !/\bON\s+CONFLICT\b/i.test(translated) &&
    /\bVALUES\s*\(/i.test(translated) &&
    /INSERT\s+INTO\s+(users|promocode_redemptions)\b/i.test(translated)

  if (insertIgnoreLike) {
    translated += " ON CONFLICT DO NOTHING"
  }

  const insertMatch = translated.match(/^\s*INSERT\s+INTO\s+([a-z_]+)/i)

  if (insertMatch && insertTablesWithId.has(insertMatch[1].toLowerCase()) && !/\bRETURNING\b/i.test(translated)) {
    translated += " RETURNING id"
  }

  let index = 0
  translated = translated.replace(/\?/g, () => `$${++index}`)

  return translated
}

class PgStatement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql
    this.queue = Promise.resolve()
    this.finalizeCallbacks = []
  }

  run(...args) {
    const callback = typeof args[args.length - 1] === "function" ? args.pop() : null
    const params = args

    this.queue = this.queue.then(() => new Promise((resolve) => {
      this.db.run(this.sql, params, function (err) {
        if (callback) callback.call(this, err)
        resolve()
      })
    }))

    return this
  }

  finalize(callback) {
    this.queue
      .then(() => callback?.(null))
      .catch((err) => callback?.(normalizeError(err)))

    return this
  }
}

class PgDatabase {
  constructor(connectionString) {
    const { Pool } = require("pg")

    this.pool = new Pool({
      connectionString,
      max: 1,
      ssl: { rejectUnauthorized: false }
    })
    this.queue = Promise.resolve()
    this.ready = this.initialize()
  }

  async initialize() {
    console.log("DB PROVIDER: PostgreSQL")

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        steamid TEXT UNIQUE,
        username TEXT,
        balance INTEGER DEFAULT 0
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        steamid TEXT,
        amount INTEGER,
        status TEXT,
        type TEXT,
        note TEXT,
        createdat TEXT,
        provider TEXT,
        providerpaymentid TEXT,
        provideramount INTEGER,
        creditedamount INTEGER,
        customeremail TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        steamid TEXT,
        product TEXT,
        price INTEGER,
        quantity INTEGER DEFAULT 1,
        createdat TEXT,
        status TEXT DEFAULT 'Ожидает выдачи',
        updatedat TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS roulette_drops (
        id SERIAL PRIMARY KEY,
        steamid TEXT,
        username TEXT,
        avatar TEXT,
        productname TEXT,
        productprice INTEGER,
        createdat TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS roulette_spins (
        id SERIAL PRIMARY KEY,
        steamid TEXT,
        createdat TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS roulette_items (
        productname TEXT PRIMARY KEY,
        isactive INTEGER DEFAULT 1,
        weight INTEGER DEFAULT 10,
        updatedat TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS promocode_redemptions (
        id SERIAL PRIMARY KEY,
        steamid TEXT,
        code TEXT,
        amount INTEGER,
        createdat TEXT,
        UNIQUE(steamid, code)
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE,
        description TEXT,
        category TEXT,
        price INTEGER,
        discountpercent INTEGER DEFAULT 0,
        image TEXT,
        isactive INTEGER DEFAULT 1,
        sortorder INTEGER DEFAULT 0,
        createdat TEXT,
        updatedat TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id SERIAL PRIMARY KEY,
        adminsteamid TEXT,
        action TEXT,
        target TEXT,
        details TEXT,
        createdat TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS promocodes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE,
        amount INTEGER,
        maxuses INTEGER DEFAULT 1,
        expiresat TEXT,
        isactive INTEGER DEFAULT 1,
        createdat TEXT,
        updatedat TEXT
      )
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedat TEXT
      )
    `)

    const now = new Date().toISOString()
    const defaultPromocodes = [
      ["REDMOONSTART", 100],
      ["REDMOONSUMMER", 100],
      ["BAK10", 100]
    ]

    for (const [code, amount] of defaultPromocodes) {
      await this.pool.query(
        `
        INSERT INTO promocodes (code, amount, maxuses, expiresat, isactive, createdat, updatedat)
        VALUES ($1, $2, 999999, NULL, 1, $3, $4)
        ON CONFLICT(code) DO NOTHING
        `,
        [code, amount, now, now]
      )

      await this.pool.query(
        `
        UPDATE promocodes
        SET maxuses = 999999
        WHERE code = $1 AND maxuses = 1
        `,
        [code]
      )
    }

    console.log("База данных PostgreSQL подключена")
  }

  enqueue(task) {
    const runTask = this.queue.then(async () => {
      await this.ready
      return task()
    })

    this.queue = runTask.catch(() => {})

    return runTask
  }

  query(sql, params = []) {
    return this.enqueue(() => this.pool.query(translateSqliteToPostgres(sql), params))
  }

  run(sql, params = [], callback) {
    if (typeof params === "function") {
      callback = params
      params = []
    }

    this.query(sql, params)
      .then((result) => {
        const context = {
          lastID: result.rows?.[0]?.id || null,
          changes: result.rowCount || 0
        }

        callback?.call(context, null)
      })
      .catch((err) => callback?.call({}, normalizeError(err)))

    return this
  }

  get(sql, params = [], callback) {
    if (typeof params === "function") {
      callback = params
      params = []
    }

    this.query(sql, params)
      .then((result) => callback?.(null, normalizeRow(result.rows?.[0])))
      .catch((err) => callback?.(normalizeError(err)))

    return this
  }

  all(sql, params = [], callback) {
    if (typeof params === "function") {
      callback = params
      params = []
    }

    this.query(sql, params)
      .then((result) => callback?.(null, normalizeRows(result.rows)))
      .catch((err) => callback?.(normalizeError(err)))

    return this
  }

  prepare(sql) {
    return new PgStatement(this, sql)
  }

  serialize(callback) {
    callback()
  }
}

const createSqliteDatabase = () => {
  const sqlite3 = require("sqlite3").verbose()
  const legacyDbPath = path.join(__dirname, "shop.db")
  const renderDiskDir = "/var/data"
  const defaultPersistentDir = fs.existsSync(renderDiskDir) ? renderDiskDir : __dirname
  const dbPath = process.env.DATABASE_PATH || process.env.SQLITE_DB_PATH || path.join(defaultPersistentDir, "shop.db")
  const dbDir = path.dirname(dbPath)

  fs.mkdirSync(dbDir, { recursive: true })

  if (dbPath !== legacyDbPath && !fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
    fs.copyFileSync(legacyDbPath, dbPath)
    console.log("DB MIGRATED FROM:", legacyDbPath)
  }

  console.log("DB PROVIDER: SQLite")
  console.log("DB FILE:", dbPath)

  if (dbPath === legacyDbPath) {
    console.log("WARNING: SQLite DB is stored inside the app directory. Use DATABASE_PATH or /var/data/shop.db for persistent production balances.")
  }

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
      CREATE TABLE IF NOT EXISTS roulette_spins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steamId TEXT,
        createdAt TEXT
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS roulette_items (
        productName TEXT PRIMARY KEY,
        isActive INTEGER DEFAULT 1,
        weight INTEGER DEFAULT 10,
        updatedAt TEXT
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

    db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
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
      const hasProvider = columns.some((col) => col.name === "provider")
      const hasProviderPaymentId = columns.some((col) => col.name === "providerPaymentId")
      const hasProviderAmount = columns.some((col) => col.name === "providerAmount")
      const hasCreditedAmount = columns.some((col) => col.name === "creditedAmount")
      const hasCustomerEmail = columns.some((col) => col.name === "customerEmail")

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

      if (!hasProvider) {
        db.run("ALTER TABLE payments ADD COLUMN provider TEXT", (err) => {
          if (err) console.log("Ошибка добавления provider:", err.message)
          else console.log("Колонка payments.provider добавлена")
        })
      }

      if (!hasProviderPaymentId) {
        db.run("ALTER TABLE payments ADD COLUMN providerPaymentId TEXT", (err) => {
          if (err) console.log("Ошибка добавления providerPaymentId:", err.message)
          else console.log("Колонка payments.providerPaymentId добавлена")
        })
      }

      if (!hasProviderAmount) {
        db.run("ALTER TABLE payments ADD COLUMN providerAmount INTEGER", (err) => {
          if (err) console.log("Ошибка добавления providerAmount:", err.message)
          else console.log("Колонка payments.providerAmount добавлена")
        })
      }

      if (!hasCreditedAmount) {
        db.run("ALTER TABLE payments ADD COLUMN creditedAmount INTEGER", (err) => {
          if (err) console.log("Ошибка добавления creditedAmount:", err.message)
          else console.log("Колонка payments.creditedAmount добавлена")
        })
      }

      if (!hasCustomerEmail) {
        db.run("ALTER TABLE payments ADD COLUMN customerEmail TEXT", (err) => {
          if (err) console.log("Ошибка добавления customerEmail:", err.message)
          else console.log("Колонка payments.customerEmail добавлена")
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

  return db
}

module.exports = DATABASE_URL ? new PgDatabase(DATABASE_URL) : createSqliteDatabase()
