const express = require("express")
const cors = require("cors")
const session = require("express-session")
const passport = require("passport")
const SteamStrategy = require("passport-steam").Strategy
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const db = require("./database")

const app = express()

app.set("trust proxy", 1)
const FRONTEND_URL = "https://redmoon-dayz.ru"
const ADMIN_STEAM_IDS = new Set(["76561198722502186"])
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET || "redmoon_auth_secret"
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || ""
const FREEKASSA_MERCHANT_ID = process.env.FREEKASSA_MERCHANT_ID || ""
const FREEKASSA_SECRET_1 = process.env.FREEKASSA_SECRET_1 || ""
const FREEKASSA_SECRET_2 = process.env.FREEKASSA_SECRET_2 || ""
const FREEKASSA_CURRENCY = process.env.FREEKASSA_CURRENCY || "RUB"
const uploadsDir = path.join(__dirname, "uploads")
const rouletteDropClients = new Set()
const ROULETTE_PRODUCT_NAME = "Рулетка REDMOON"
const ROULETTE_PRICE = 120
const MIN_DEPOSIT_AMOUNT = 10
const MAX_DEPOSIT_AMOUNT = 100000
const DEPOSIT_BONUS_TIERS = [
  { min: 3000, percent: 30 },
  { min: 2000, percent: 20 },
  { min: 1000, percent: 15 },
  { min: 500, percent: 10 }
]
const ROULETTE_EXCLUDED_PRODUCT_NAMES = new Set([ROULETTE_PRODUCT_NAME, "VIP-слот"])
const promocodes = {
  REDMOONSTART: 100,
  REDMOONSUMMER: 100,
  BAK10: 100
}

const productCatalog = {
  "Gunter-2": 250,
  "Кувалда": 30,
  "Коробка гвоздей": 70,
  "Плоскогубцы": 45,
  "Веревка": 20,
  "Проволока": 65,
  "Лопата": 40,
  "Строительный рюзкак": 160,
  "10 листов металла": 130,
  "Бочка": 150,
  "Топорик": 35,
  "Кирка": 35,
  "Флагшток": 300,
  [ROULETTE_PRODUCT_NAME]: ROULETTE_PRICE,
  "VIP-слот": 500
}

fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadsDir)
  },
  filename: (req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase()
    const safeExt = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext) ? ext : ".png"
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      return callback(new Error("Можно загрузить только изображение"))
    }

    callback(null, true)
  }
})

const getImageUrl = (file) => file ? `https://redmoon-dayz.ru/uploads/${file.filename}` : null

const encodeTokenPart = (value) =>
  Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

const decodeTokenPart = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=")

  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"))
}

const signTokenPart = (payload) =>
  crypto
    .createHmac("sha256", AUTH_TOKEN_SECRET)
    .update(payload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

const createAuthToken = (user) => {
  const payload = encodeTokenPart({
    id: user.id,
    steamId: user.id,
    displayName: user.displayName,
    photos: user.photos,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  })

  return `${payload}.${signTokenPart(payload)}`
}

const verifyAuthToken = (token) => {
  if (!token || !token.includes(".")) return null

  const [payload, signature] = token.split(".")
  const expectedSignature = signTokenPart(payload)

  if (signature.length !== expectedSignature.length) {
    return null
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null
  }

  const user = decodeTokenPart(payload)

  if (!user.exp || user.exp < Date.now()) return null

  return user
}

const getAuthTokenFromRequest = (req) => {
  const header = req.get("authorization") || ""

  if (header.startsWith("Bearer ")) {
    return header.slice(7)
  }

  return req.query.authToken || req.body?.authToken || null
}

const getRequestUser = (req) => req.user || verifyAuthToken(getAuthTokenFromRequest(req))

const getRequestSteamId = (req) => {
  const user = getRequestUser(req)

  return String(user?.id || user?.steamId || "")
}

const isAdminSteamId = (steamId) => ADMIN_STEAM_IDS.has(String(steamId || ""))

const isAdminRequest = (req) => isAdminSteamId(getRequestSteamId(req))

const getAdminTargetSteamId = (req) =>
  String(req.body?.steamId || req.body?.targetSteamId || getRequestSteamId(req) || "").trim()

const requireAdmin = (req, res, next) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "Доступ только для администратора" })
  }

  next()
}

const writeAdminLog = (req, action, target, details = "") => {
  const adminUser = getRequestUser(req)

  db.run(
    `
    INSERT INTO admin_logs (adminSteamId, action, target, details, createdAt)
    VALUES (?, ?, ?, ?, ?)
    `,
    [
      adminUser?.id || adminUser?.steamId || "unknown",
      action,
      target,
      typeof details === "string" ? details : JSON.stringify(details),
      new Date().toISOString()
    ],
    (err) => {
      if (err) console.log("Ошибка записи admin_logs:", err.message)
    }
  )
}

const sendDiscordNotification = (content) => {
  if (!DISCORD_WEBHOOK_URL) return

  fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  }).catch((err) => {
    console.log("DISCORD WEBHOOK ERROR:", err.message)
  })
}

const createHash = (value, algorithm = "md5") =>
  crypto.createHash(algorithm).update(String(value)).digest("hex")

const toMoneyAmount = (value) => {
  const normalized = Number(String(value || "").replace(",", "."))

  if (!Number.isFinite(normalized)) return 0

  return Math.round(normalized * 100) / 100
}

const toKopecks = (value) => Math.round(toMoneyAmount(value) * 100)

const formatPaymentAmount = (value) => {
  const amount = toMoneyAmount(value)

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}

const getDepositBonus = (amount) => {
  const tier = DEPOSIT_BONUS_TIERS.find((item) => amount >= item.min)

  return tier ? Math.floor(amount * tier.percent / 100) : 0
}

const getDepositTotal = (amount) => amount + getDepositBonus(amount)

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())

const createFreeKassaPaymentUrl = ({ paymentId, amount, email, steamId }) => {
  const params = new URLSearchParams()
  const formattedAmount = formatPaymentAmount(amount)
  const signature = createHash(`${FREEKASSA_MERCHANT_ID}:${formattedAmount}:${FREEKASSA_SECRET_1}:${FREEKASSA_CURRENCY}:${paymentId}`)

  params.set("m", FREEKASSA_MERCHANT_ID)
  params.set("oa", formattedAmount)
  params.set("currency", FREEKASSA_CURRENCY)
  params.set("o", String(paymentId))
  params.set("s", signature)
  params.set("lang", "ru")
  params.set("us_steamId", String(steamId))

  if (email) {
    params.set("em", email)
  }

  return `https://pay.fk.money/?${params.toString()}`
}

const verifyFreeKassaSignature = (payload) => {
  const merchantId = payload.MERCHANT_ID
  const amount = payload.AMOUNT
  const orderId = payload.MERCHANT_ORDER_ID
  const signature = String(payload.SIGN || "").toLowerCase()
  const expectedSignature = createHash(`${merchantId}:${amount}:${FREEKASSA_SECRET_2}:${orderId}`).toLowerCase()

  if (!signature || signature.length !== expectedSignature.length) {
    return false
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
}

const getDiscountedPrice = (price, discountPercent) => {
  const safePrice = Number(price || 0)
  const safeDiscount = Math.min(Math.max(Number(discountPercent || 0), 0), 100)

  return Math.max(Math.round(safePrice * (100 - safeDiscount) / 100), 0)
}

const isRoulettePrizeProduct = (product) => {
  const price = getDiscountedPrice(product?.price, product?.discountPercent)

  if (!product?.name || price <= 0) return false

  return !ROULETTE_EXCLUDED_PRODUCT_NAMES.has(product.name)
}

const formatPurchase = (purchase) => ({
  id: purchase.id,
  name: purchase.product,
  priceValue: Number(purchase.price || 0),
  quantity: Number(purchase.quantity || 1),
  status: purchase.status || "Ожидает выдачи",
  createdAt: purchase.createdAt,
  date: purchase.createdAt
    ? new Date(purchase.createdAt).toLocaleString("ru-RU")
    : "Дата не указана"
})

const formatProduct = (product) => ({
  id: product.id,
  name: product.name,
  description: product.description || "",
  category: product.category || "Все для строительства",
  oldPriceValue: Number(product.price || 0),
  discountPercent: Number(product.discountPercent || 0),
  price: `${getDiscountedPrice(product.price, product.discountPercent)}₽`,
  priceValue: getDiscountedPrice(product.price, product.discountPercent),
  image: product.image,
  isActive: Boolean(product.isActive),
  sortOrder: Number(product.sortOrder || 0),
  createdAt: product.createdAt,
  updatedAt: product.updatedAt
})

const getProductPrice = (productName, callback) => {
  if (productName === ROULETTE_PRODUCT_NAME) {
    callback(null, null)
    return
  }

  const staticPrice = productCatalog[productName]

  if (staticPrice) {
    callback(null, staticPrice)
    return
  }

  db.get(
    `
    SELECT price, discountPercent
    FROM products
    WHERE name = ? AND isActive = 1
    `,
    [productName],
    (err, product) => {
      if (err) {
        callback(err)
        return
      }

      callback(null, getDiscountedPrice(product?.price, product?.discountPercent))
    }
  )
}

const normalizeCartItems = (items, callback) => {
  const mergedItems = new Map()
  const productNames = [...new Set(items.map((item) => item.productName || item.name).filter(Boolean))]

  db.all(
    `
    SELECT name, price, discountPercent
    FROM products
    WHERE name IN (${productNames.map(() => "?").join(",") || "NULL"}) AND isActive = 1
    `,
    productNames,
    (err, rows) => {
      if (err) {
        callback(err)
        return
      }

      const dynamicPrices = new Map(rows.map((product) => [
        product.name,
        getDiscountedPrice(product.price, product.discountPercent)
      ]))

      items.forEach((item) => {
        const productName = item.productName || item.name

        if (productName === ROULETTE_PRODUCT_NAME) {
          return
        }

        const price = productCatalog[productName] || dynamicPrices.get(productName)
        const quantity = Math.max(Number(item.quantity || 1), 1)

        if (!productName || !price || !Number.isInteger(quantity)) {
          return
        }

        const currentQuantity = mergedItems.get(productName)?.quantity || 0
        mergedItems.set(productName, {
          productName,
          price,
          quantity: currentQuantity + quantity
        })
      })

      callback(null, Array.from(mergedItems.values()))
    }
  )
}

const getRoulettePrizeProducts = (callback) => {
  const prizeMap = new Map()

  Object.entries(productCatalog).forEach(([name, price], index) => {
    const product = {
      id: `static-${index}`,
      name,
      price,
      discountPercent: 0,
      isActive: 1,
      sortOrder: index
    }

    if (isRoulettePrizeProduct(product)) {
      prizeMap.set(name, product)
    }
  })

  db.all(
    `
    SELECT *
    FROM products
    WHERE isActive = 1
    ORDER BY sortOrder ASC, id DESC
    `,
    [],
    (err, products) => {
      if (err) {
        callback(err)
        return
      }

      products
        .filter(isRoulettePrizeProduct)
        .forEach((product) => {
          prizeMap.set(product.name, product)
        })

      callback(null, Array.from(prizeMap.values()))
    }
  )
}

const getRoulettePrize = (callback) => {
  getRoulettePrizeProducts((err, products) => {
    if (err) {
      callback(err)
      return
    }

    const prizes = products.map((product) => ({
      name: product.name,
      price: getDiscountedPrice(product.price, product.discountPercent)
    }))

    if (prizes.length === 0) {
      callback(new Error("Нет доступных призов для рулетки"))
      return
    }

    callback(null, prizes[Math.floor(Math.random() * prizes.length)])
  })
}

const ensureUser = (steamId, username, callback) => {
  db.run(
    `
    INSERT OR IGNORE INTO users (steamId, username, balance)
    VALUES (?, ?, 0)
    `,
    [steamId, username],
    callback
  )
}

const getLatestRouletteDrops = (callback) => {
  db.all(
    `
    SELECT *
    FROM roulette_drops
    ORDER BY id DESC
    LIMIT 7
    `,
    [],
    callback
  )
}

const broadcastRouletteDrops = () => {
  getLatestRouletteDrops((err, drops) => {
    if (err) {
      console.log("Ошибка загрузки выпадений рулетки:", err.message)
      return
    }

    const payload = `data: ${JSON.stringify(drops)}\n\n`

    rouletteDropClients.forEach((client) => {
      client.write(payload)
    })
  })
}

const renderTestPaymentPage = (payment) => `
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>REDMOON TEST PAY</title>
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: Arial, sans-serif;
        color: white;
        background:
          radial-gradient(circle at 50% 0%, rgba(255, 48, 69, 0.2), transparent 34%),
          linear-gradient(rgba(0,0,0,0.78), rgba(0,0,0,0.94)),
          url("https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=2064&auto=format&fit=crop");
        background-size: cover;
        background-position: center;
      }

      .card {
        width: min(520px, 100%);
        padding: 30px;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 22px;
        background: rgba(12,12,14,0.92);
        box-shadow:
          0 0 55px rgba(0,0,0,0.48),
          0 0 42px rgba(255,48,69,0.18),
          inset 0 1px 0 rgba(255,255,255,0.05);
        backdrop-filter: blur(14px);
      }

      .brand {
        margin-bottom: 22px;
        color: #ff4056;
        font-size: 34px;
        font-weight: 900;
        letter-spacing: 4px;
        text-shadow: 0 0 24px rgba(255,64,86,0.55);
      }

      .label {
        color: rgba(255,255,255,0.52);
        font-size: 13px;
        font-weight: 900;
        text-transform: uppercase;
      }

      h1 {
        margin: 8px 0 18px;
        font-size: 30px;
        line-height: 1.12;
      }

      .amount {
        margin: 22px 0;
        padding: 20px;
        border: 1px solid rgba(255,59,79,0.28);
        border-radius: 16px;
        background: rgba(255,59,79,0.1);
      }

      .amount span {
        display: block;
        margin-bottom: 7px;
        color: rgba(255,255,255,0.58);
        font-weight: 800;
      }

      .amount strong {
        color: white;
        font-size: 44px;
        line-height: 1;
      }

      .meta {
        display: grid;
        gap: 10px;
        margin: 18px 0 26px;
        color: rgba(255,255,255,0.68);
        font-weight: 700;
      }

      .meta b {
        color: white;
      }

      .actions {
        display: grid;
        gap: 12px;
      }

      button,
      a {
        min-height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        color: white;
        font-size: 16px;
        font-weight: 900;
        text-decoration: none;
        cursor: pointer;
      }

      button {
        border: none;
        background: linear-gradient(135deg, #ff3045, #a9001f);
        box-shadow: 0 0 26px rgba(255,48,69,0.32);
      }

      a {
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.045);
      }

      .notice {
        margin-top: 18px;
        color: rgba(255,255,255,0.44);
        font-size: 13px;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="brand">REDMOON</div>
      <div class="label">Тестовая оплата</div>
      <h1>Подтверждение пополнения баланса</h1>

      <div class="amount">
        <span>К оплате</span>
        <strong>${Number(payment.amount)} ₽</strong>
      </div>

      <div class="meta">
        <div>Платёж: <b>#${payment.id}</b></div>
        <div>SteamID: <b>${payment.steamId}</b></div>
        <div>Статус: <b>${payment.status}</b></div>
      </div>

      <div class="actions">
        <form method="POST" action="/api/test-payment/${payment.id}/pay">
          <button type="submit">Оплатить тестово</button>
        </form>
        <a href="/api/test-payment/${payment.id}/cancel">Отменить и вернуться</a>
      </div>

      <div class="notice">
        Это тестовая страница оплаты для разработки. Реальные деньги здесь не списываются.
      </div>
    </main>
  </body>
</html>
`

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use("/uploads", express.static(uploadsDir))

app.use(cors({
  origin: ["https://redmoon-dayz.ru", "http://localhost:5174"],
  credentials: true
}))

app.use(session({
  secret: "redmoon_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}))

app.use(passport.initialize())
app.use(passport.session())

passport.serializeUser((user, done) => {
  done(null, user)
})

passport.deserializeUser((user, done) => {
  done(null, user)
})

passport.use(new SteamStrategy({
  returnURL: "https://dayz-shop.onrender.com/auth/steam/return",
  realm: "https://dayz-shop.onrender.com/",
  apiKey: process.env.STEAM_API_KEY
}, (identifier, profile, done) => {
  db.run(
    `
    INSERT OR IGNORE INTO users (steamId, username, balance)
    VALUES (?, ?, 0)
    `,
    [profile.id, profile.displayName],
    (err) => {
      if (err) {
        console.log("Ошибка сохранения пользователя:", err.message)
      }

      return done(null, profile)
    }
  )
}))

app.get("/", (req, res) => {
  res.send("Backend работает")
})

app.get("/auth/steam", passport.authenticate("steam"))

app.get(
  "/auth/steam/return",
  passport.authenticate("steam", {
    failureRedirect: FRONTEND_URL
  }),
  (req, res) => {
    const redirectUrl = new URL(FRONTEND_URL)
    redirectUrl.searchParams.set("steamId", req.user.id)
    redirectUrl.searchParams.set("authToken", createAuthToken(req.user))
    res.redirect(redirectUrl.toString())
  }
)

app.get("/api/user", (req, res) => {
  const authUser = getRequestUser(req)

  if (authUser) {
    const steamId = authUser.id || authUser.steamId

    res.json({
      ...authUser,
      id: steamId,
      steamId,
      displayName: authUser.displayName || authUser.username || "Steam пользователь",
      isAdmin: isAdminSteamId(steamId)
    })
  } else {
    res.json(null)
  }
})

app.get("/api/user/:steamId", (req, res) => {
  const steamId = req.params.steamId
  const authUser = getRequestUser(req)
  const username =
    String(authUser?.id || authUser?.steamId || "") === String(steamId)
      ? authUser.displayName || "Unknown"
      : "Unknown"

  console.log("USER ROUTE HIT:", steamId)

  db.run(
    `
    INSERT OR IGNORE INTO users (steamId, username, balance)
    VALUES (?, ?, 0)
    `,
    [steamId, username],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      db.get(
        `
        SELECT * FROM users
        WHERE steamId = ?
        `,
        [steamId],
        (err, row) => {
          if (err) {
            return res.status(500).json({ error: err.message })
          }

          res.json({
            ...row,
            id: row.steamId,
            displayName: row.username,
            isAdmin: isAdminSteamId(row.steamId)
          })
        }
      )
    }
  )
})

app.post("/api/promocodes/redeem", (req, res) => {
  const { steamId, code } = req.body
  const normalizedCode = String(code || "").trim().toUpperCase()
  const currentSteamId = req.user?.id || steamId
  const username = req.user?.displayName || "Unknown"

  if (!currentSteamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  if (!normalizedCode) {
    return res.status(400).json({ error: "Введите промокод" })
  }

  db.get(
    `
    SELECT *
    FROM promocodes
    WHERE code = ? AND isActive = 1
    `,
    [normalizedCode],
    (err, promoRow) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      const staticAmount = promocodes[normalizedCode]
      const amount = Number(promoRow?.amount || staticAmount || 0)

      if (!amount) {
        return res.status(404).json({ error: "Промокод не найден" })
      }

      if (promoRow?.expiresAt && new Date(promoRow.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: "Срок действия промокода истёк" })
      }

      db.get(
        "SELECT COUNT(*) AS count FROM promocode_redemptions WHERE code = ?",
        [normalizedCode],
        (err, usageRow) => {
          if (err) {
            return res.status(500).json({ error: err.message })
          }

          if (promoRow?.maxUses && usageRow.count >= promoRow.maxUses) {
            return res.status(409).json({ error: "Лимит активаций промокода закончился" })
          }

  db.run(
    `
    INSERT OR IGNORE INTO users (steamId, username, balance)
    VALUES (?, ?, 0)
    `,
    [currentSteamId, username],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      db.run(
        `
        INSERT INTO promocode_redemptions (steamId, code, amount, createdAt)
        VALUES (?, ?, ?, ?)
        `,
        [currentSteamId, normalizedCode, amount, new Date().toISOString()],
        (err) => {
          if (err) {
            if (err.message.includes("UNIQUE")) {
              return res.status(409).json({ error: "Вы уже активировали этот промокод" })
            }

            return res.status(500).json({ error: err.message })
          }

          db.run(
            `
            UPDATE users
            SET balance = balance + ?
            WHERE steamId = ?
            `,
            [amount, currentSteamId],
            (err) => {
              if (err) {
                return res.status(500).json({ error: err.message })
              }

              db.get(
                `
                SELECT balance
                FROM users
                WHERE steamId = ?
                `,
                [currentSteamId],
                (err, userRow) => {
                  if (err) {
                    return res.status(500).json({ error: err.message })
                  }

                  res.json({
                    success: true,
                    code: normalizedCode,
                    amount,
                    balance: userRow?.balance || 0
                  })
                }
              )
            }
          )
        }
      )
    }
  )
        }
      )
    }
  )
})

app.get("/api/products", (req, res) => {
  db.all(
    `
    SELECT *
    FROM products
    WHERE isActive = 1
    ORDER BY sortOrder ASC, id DESC
    `,
    [],
    (err, products) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      res.json(products.map(formatProduct))
    }
  )
})

app.get("/api/roulette/prizes", (req, res) => {
  getRoulettePrizeProducts((err, products) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    res.json(products.map(formatProduct))
  })
})

app.get("/api/admin/summary", requireAdmin, (req, res) => {
  const summary = {}

  db.serialize(() => {
    db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
      if (err) return res.status(500).json({ error: err.message })
      summary.users = row.count

      db.get("SELECT COUNT(*) AS count FROM purchases", (err, row) => {
        if (err) return res.status(500).json({ error: err.message })
        summary.purchases = row.count

        db.get("SELECT COUNT(*) AS count FROM products WHERE isActive = 1", (err, row) => {
          if (err) return res.status(500).json({ error: err.message })
          summary.products = row.count

          db.get("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid' AND amount > 0", (err, row) => {
            if (err) return res.status(500).json({ error: err.message })
            summary.paymentsTotal = row.total
            res.json(summary)
          })
        })
      })
    })
  })
})

app.get("/api/admin/products", requireAdmin, (req, res) => {
  db.all(
    `
    SELECT *
    FROM products
    ORDER BY sortOrder ASC, id DESC
    `,
    [],
    (err, products) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      res.json(products.map(formatProduct))
    }
  )
})

app.post("/api/admin/products", requireAdmin, upload.single("image"), (req, res) => {
  const name = String(req.body.name || "").trim()
  const description = String(req.body.description || "").trim()
  const category = String(req.body.category || "").trim()
  const price = Number(req.body.price || 0)
  const discountPercent = Math.min(Math.max(Number(req.body.discountPercent || 0), 0), 100)
  const sortOrder = Math.max(Number(req.body.sortOrder || 0), 0)
  const image = getImageUrl(req.file)
  const createdAt = new Date().toISOString()

  if (!name || !category || !price || price <= 0) {
    return res.status(400).json({ error: "Заполни название, цену и категорию" })
  }

  if (!image) {
    return res.status(400).json({ error: "Добавь картинку товара" })
  }

  db.run(
    `
    INSERT INTO products (name, description, category, price, discountPercent, image, isActive, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `,
    [name, description, category, price, discountPercent, image, sortOrder, createdAt, createdAt],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE")) {
          return res.status(409).json({ error: "Товар с таким названием уже есть" })
        }

        return res.status(500).json({ error: err.message })
      }

      res.json(formatProduct({
        id: this.lastID,
        name,
        description,
        category,
        price,
        discountPercent,
        image,
        isActive: 1,
        sortOrder,
        createdAt,
        updatedAt: createdAt
      }))
      writeAdminLog(req, "product_create", name, { price, discountPercent, category })
    }
  )
})

app.put("/api/admin/products/:id", requireAdmin, upload.single("image"), (req, res) => {
  const id = req.params.id
  const name = String(req.body.name || "").trim()
  const description = String(req.body.description || "").trim()
  const category = String(req.body.category || "").trim()
  const price = Number(req.body.price || 0)
  const discountPercent = Math.min(Math.max(Number(req.body.discountPercent || 0), 0), 100)
  const sortOrder = Math.max(Number(req.body.sortOrder || 0), 0)
  const isActive = req.body.isActive === "0" ? 0 : 1
  const image = getImageUrl(req.file)
  const updatedAt = new Date().toISOString()

  if (!name || !category || !price || price <= 0) {
    return res.status(400).json({ error: "Заполни название, цену и категорию" })
  }

  db.get("SELECT image FROM products WHERE id = ?", [id], (err, currentProduct) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    if (!currentProduct) {
      return res.status(404).json({ error: "Товар не найден" })
    }

    db.run(
      `
      UPDATE products
      SET name = ?, description = ?, category = ?, price = ?, discountPercent = ?, image = ?, isActive = ?, sortOrder = ?, updatedAt = ?
      WHERE id = ?
      `,
      [name, description, category, price, discountPercent, image || currentProduct.image, isActive, sortOrder, updatedAt, id],
      (err) => {
        if (err) {
          if (err.message.includes("UNIQUE")) {
            return res.status(409).json({ error: "Товар с таким названием уже есть" })
          }

          return res.status(500).json({ error: err.message })
        }

        db.get("SELECT * FROM products WHERE id = ?", [id], (err, product) => {
          if (err) {
            return res.status(500).json({ error: err.message })
          }

          writeAdminLog(req, "product_update", name, { price, discountPercent, category, isActive })
          res.json(formatProduct(product))
        })
      }
    )
  })
})

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.run(
    `
    UPDATE products
    SET isActive = 0, updatedAt = ?
    WHERE id = ?
    `,
    [new Date().toISOString(), req.params.id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      writeAdminLog(req, "product_hide", `product:${req.params.id}`)
      res.json({ success: true })
    }
  )
})

app.post("/api/admin/products/sort", requireAdmin, (req, res) => {
  const { items } = req.body

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "Некорректный порядок товаров" })
  }

  db.serialize(() => {
    const statement = db.prepare("UPDATE products SET sortOrder = ?, updatedAt = ? WHERE id = ?")
    const updatedAt = new Date().toISOString()

    items.forEach((item, index) => {
      statement.run(index, updatedAt, item.id)
    })

    statement.finalize((err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      writeAdminLog(req, "product_sort", "products", `${items.length} товаров`)
      res.json({ success: true })
    })
  })
})

app.get("/api/admin/users", requireAdmin, (req, res) => {
  db.all(
    `
    SELECT *
    FROM users
    ORDER BY id DESC
    `,
    [],
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      res.json(users)
    }
  )
})

app.get("/api/admin/purchases", requireAdmin, (req, res) => {
  db.all(
    `
    SELECT purchases.*, users.username
    FROM purchases
    LEFT JOIN users ON users.steamId = purchases.steamId
    ORDER BY purchases.id DESC
    LIMIT 100
    `,
    [],
    (err, purchases) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      res.json(purchases.map((purchase) => ({
        ...formatPurchase(purchase),
        steamId: purchase.steamId,
        username: purchase.username || "Unknown"
      })))
    }
  )
})

app.patch("/api/admin/purchases/:id/status", requireAdmin, (req, res) => {
  const id = req.params.id
  const status = String(req.body.status || "").trim()
  const allowedStatuses = ["Ожидает выдачи", "Выдано", "Отменено"]

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Некорректный статус покупки" })
  }

  db.run(
    `
    UPDATE purchases
    SET status = ?, updatedAt = ?
    WHERE id = ?
    `,
    [status, new Date().toISOString(), id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      writeAdminLog(req, "purchase_status", `purchase:${id}`, status)
      res.json({ success: true, id, status })
    }
  )
})

app.get("/api/admin/payments", requireAdmin, (req, res) => {
  db.all(
    `
    SELECT payments.*, users.username
    FROM payments
    LEFT JOIN users ON users.steamId = payments.steamId
    ORDER BY payments.id DESC
    LIMIT 100
    `,
    [],
    (err, payments) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      res.json(payments)
    }
  )
})

app.get("/api/admin/top-products", requireAdmin, (req, res) => {
  db.all(
    `
    SELECT
      product AS name,
      SUM(quantity) AS totalQuantity,
      COUNT(*) AS totalPurchases,
      SUM(price * quantity) AS totalRevenue
    FROM purchases
    GROUP BY product
    ORDER BY totalQuantity DESC, totalPurchases DESC
    LIMIT 10
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message })
      res.json(rows)
    }
  )
})

app.post("/api/admin/balance/add", requireAdmin, (req, res) => {
  const steamId = getAdminTargetSteamId(req)
  const amount = Math.floor(Number(req.body.amount || 0))
  const note = String(req.body.note || "").trim()
  const username = "Manual top-up"
  const createdAt = new Date().toISOString()

  if (!steamId) {
    return res.status(400).json({ error: "Укажи SteamID игрока" })
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Укажи сумму больше 0" })
  }

  ensureUser(steamId, username, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    db.run(
      `
      UPDATE users
      SET balance = balance + ?
      WHERE steamId = ?
      `,
      [amount, steamId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message })
        }

        db.run(
          `
          INSERT INTO payments (steamId, amount, status, type, note, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [steamId, amount, "paid", "manual", note || "Ручное начисление", createdAt],
          function (err) {
            if (err) {
              return res.status(500).json({ error: err.message })
            }

            db.get(
              `
              SELECT balance
              FROM users
              WHERE steamId = ?
              `,
              [steamId],
              (err, userRow) => {
                if (err) {
                  return res.status(500).json({ error: err.message })
                }

                res.json({
                  success: true,
                  paymentId: this.lastID,
                  steamId,
                  amount,
                  balance: userRow?.balance || 0,
                  note: note || "Ручное начисление",
                  createdAt
                })
                writeAdminLog(req, "balance_add", steamId, { amount, note })
                sendDiscordNotification(`REDMOON: вручную начислено ${amount} ₽ игроку ${steamId}. ${note || ""}`)
              }
            )
          }
        )
      }
    )
  })
})

app.post("/api/admin/balance/subtract", requireAdmin, (req, res) => {
  const steamId = getAdminTargetSteamId(req)
  const amount = Math.floor(Number(req.body.amount || 0))
  const note = String(req.body.note || "").trim()
  const createdAt = new Date().toISOString()

  if (!steamId) return res.status(400).json({ error: "Укажи SteamID игрока" })
  if (!amount || amount <= 0) return res.status(400).json({ error: "Укажи сумму больше 0" })

  ensureUser(steamId, "Manual edit", (err) => {
    if (err) return res.status(500).json({ error: err.message })

    db.run(
      "UPDATE users SET balance = MAX(balance - ?, 0) WHERE steamId = ?",
      [amount, steamId],
      (err) => {
        if (err) return res.status(500).json({ error: err.message })

        db.run(
          `
          INSERT INTO payments (steamId, amount, status, type, note, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [steamId, -amount, "paid", "manual-subtract", note || "Ручное списание", createdAt],
          (err) => {
            if (err) return res.status(500).json({ error: err.message })

            db.get("SELECT balance FROM users WHERE steamId = ?", [steamId], (err, userRow) => {
              if (err) return res.status(500).json({ error: err.message })

              writeAdminLog(req, "balance_subtract", steamId, { amount, note })
              res.json({ success: true, steamId, amount, balance: userRow?.balance || 0 })
            })
          }
        )
      }
    )
  })
})

app.post("/api/admin/balance/set", requireAdmin, (req, res) => {
  const steamId = getAdminTargetSteamId(req)
  const rawAmount = Number(req.body.amount || 0)
  const amount = Math.max(Math.floor(rawAmount), 0)
  const note = String(req.body.note || "").trim()
  const createdAt = new Date().toISOString()

  if (!steamId) return res.status(400).json({ error: "Укажи SteamID игрока" })
  if (!Number.isFinite(rawAmount) || rawAmount < 0) return res.status(400).json({ error: "Укажи сумму в рублях" })

  ensureUser(steamId, "Manual edit", (err) => {
    if (err) return res.status(500).json({ error: err.message })

    db.run("UPDATE users SET balance = ? WHERE steamId = ?", [amount, steamId], (err) => {
      if (err) return res.status(500).json({ error: err.message })

      db.run(
        `
        INSERT INTO payments (steamId, amount, status, type, note, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [steamId, amount, "paid", "manual-set", note || "Баланс установлен вручную", createdAt],
        (err) => {
          if (err) return res.status(500).json({ error: err.message })

          writeAdminLog(req, "balance_set", steamId, { amount, note })
          res.json({ success: true, steamId, balance: amount })
        }
      )
    })
  })
})

app.get("/api/admin/logs", requireAdmin, (req, res) => {
  db.all(
    `
    SELECT *
    FROM admin_logs
    ORDER BY id DESC
    LIMIT 100
    `,
    [],
    (err, logs) => {
      if (err) return res.status(500).json({ error: err.message })
      res.json(logs)
    }
  )
})

app.get("/api/admin/promocodes", requireAdmin, (req, res) => {
  db.all(
    `
    SELECT *
    FROM promocodes
    ORDER BY id DESC
    `,
    [],
    (err, codes) => {
      if (err) return res.status(500).json({ error: err.message })
      res.json(codes)
    }
  )
})

app.post("/api/admin/promocodes", requireAdmin, (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase()
  const amount = Math.floor(Number(req.body.amount || 0))
  const maxUses = Math.max(Math.floor(Number(req.body.maxUses || 1)), 1)
  const expiresAt = String(req.body.expiresAt || "").trim() || null
  const createdAt = new Date().toISOString()

  if (!code || !amount || amount <= 0) {
    return res.status(400).json({ error: "Укажи код и сумму промокода" })
  }

  db.run(
    `
    INSERT INTO promocodes (code, amount, maxUses, expiresAt, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    `,
    [code, amount, maxUses, expiresAt, createdAt, createdAt],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE")) {
          return res.status(409).json({ error: "Такой промокод уже есть" })
        }
        return res.status(500).json({ error: err.message })
      }

      writeAdminLog(req, "promocode_create", code, { amount, maxUses, expiresAt })
      res.json({ id: this.lastID, code, amount, maxUses, expiresAt, isActive: 1 })
    }
  )
})

app.patch("/api/admin/promocodes/:id", requireAdmin, (req, res) => {
  const isActive = req.body.isActive ? 1 : 0

  db.run(
    "UPDATE promocodes SET isActive = ?, updatedAt = ? WHERE id = ?",
    [isActive, new Date().toISOString(), req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message })
      writeAdminLog(req, "promocode_toggle", `promocode:${req.params.id}`, { isActive })
      res.json({ success: true })
    }
  )
})

app.get("/api/purchases/:steamId", (req, res) => {
  const steamId = getRequestSteamId(req) || req.params.steamId

  if (!steamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  db.all(
    `
    SELECT *
    FROM purchases
    WHERE steamId = ?
    ORDER BY id DESC
    `,
    [steamId],
    (err, purchases) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      res.json(purchases.map(formatPurchase))
    }
  )
})

app.get("/api/payments/:steamId", (req, res) => {
  const requestedSteamId = String(req.params.steamId || "")
  const currentSteamId = getRequestSteamId(req)

  if (!currentSteamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  if (requestedSteamId !== currentSteamId && !isAdminSteamId(currentSteamId)) {
    return res.status(403).json({ error: "Можно смотреть только свои операции" })
  }

  db.all(
    `
    SELECT *
    FROM payments
    WHERE steamId = ?
    ORDER BY id DESC
    LIMIT 100
    `,
    [requestedSteamId],
    (err, payments) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      res.json(payments)
    }
  )
})

app.post("/api/transfer", (req, res) => {
  const senderSteamId = getRequestSteamId(req)
  const senderUser = getRequestUser(req)
  const recipientSteamId = String(req.body.recipientSteamId || req.body.toSteamId || "").trim()
  const amount = Math.floor(Number(req.body.amount || 0))
  const steamIdPattern = /^\d{17}$/

  if (!senderSteamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  if (!steamIdPattern.test(recipientSteamId)) {
    return res.status(400).json({ error: "Укажи корректный SteamID64 получателя" })
  }

  if (recipientSteamId === senderSteamId) {
    return res.status(400).json({ error: "Нельзя переводить средства самому себе" })
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "Сумма перевода должна быть положительным числом" })
  }

  const createdAt = new Date().toISOString()
  const senderName = senderUser?.displayName || senderUser?.username || "Steam пользователь"

  ensureUser(senderSteamId, senderName, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    db.serialize(() => {
        db.run("BEGIN IMMEDIATE")

        const rollback = (status, error) => {
          db.run("ROLLBACK", () => {
            res.status(status).json({ error })
          })
        }

        db.run(
          `
          UPDATE users
          SET balance = balance - ?
          WHERE steamId = ? AND balance >= ?
          `,
          [amount, senderSteamId, amount],
          function (err) {
            if (err) {
              return rollback(500, err.message)
            }

            if (this.changes === 0) {
              return rollback(400, "Недостаточно средств на балансе")
            }

            db.run(
              `
              INSERT OR IGNORE INTO users (steamId, username, balance)
              VALUES (?, ?, 0)
              `,
              [recipientSteamId, "Transfer recipient"],
              (err) => {
                if (err) {
                  return rollback(500, err.message)
                }

                db.run(
                  `
                  UPDATE users
                  SET balance = balance + ?
                  WHERE steamId = ?
                  `,
                  [amount, recipientSteamId],
                  (err) => {
                    if (err) {
                      return rollback(500, err.message)
                    }

                    db.run(
                  `
                  INSERT INTO payments (steamId, amount, status, type, note, createdAt)
                  VALUES (?, ?, ?, ?, ?, ?)
                  `,
                  [
                    senderSteamId,
                    -amount,
                    "paid",
                    "transfer-out",
                    `Перевод игроку ${recipientSteamId}`,
                    createdAt
                  ],
                  function (err) {
                    if (err) {
                      return rollback(500, err.message)
                    }

                    const senderPaymentId = this.lastID

                    db.run(
                      `
                      INSERT INTO payments (steamId, amount, status, type, note, createdAt)
                      VALUES (?, ?, ?, ?, ?, ?)
                      `,
                      [
                        recipientSteamId,
                        amount,
                        "paid",
                        "transfer-in",
                        `Перевод от игрока ${senderSteamId}`,
                        createdAt
                      ],
                      function (err) {
                        if (err) {
                          return rollback(500, err.message)
                        }

                        const recipientPaymentId = this.lastID

                        db.get(
                          "SELECT balance FROM users WHERE steamId = ?",
                          [senderSteamId],
                          (err, userRow) => {
                            if (err) {
                              return rollback(500, err.message)
                            }

                            db.run("COMMIT", (err) => {
                              if (err) {
                                return res.status(500).json({ error: err.message })
                              }

                              const balance = Number(userRow?.balance || 0)
                              const senderPayment = {
                                id: senderPaymentId,
                                steamId: senderSteamId,
                                amount: -amount,
                                status: "paid",
                                type: "transfer-out",
                                note: `Перевод игроку ${recipientSteamId}`,
                                createdAt
                              }

                              res.json({
                                success: true,
                                amount,
                                balance,
                                recipientSteamId,
                                senderPayment,
                                recipientPayment: {
                                  id: recipientPaymentId,
                                  steamId: recipientSteamId,
                                  amount,
                                  status: "paid",
                                  type: "transfer-in",
                                  note: `Перевод от игрока ${senderSteamId}`,
                                  createdAt
                                }
                              })
                              sendDiscordNotification(`REDMOON: ${senderSteamId} перевел ${amount} ₽ игроку ${recipientSteamId}`)
                            })
                          }
                        )
                      }
                    )
                  }
                    )
                  }
                )
              }
            )
          }
        )
    })
  })
})

app.post("/api/purchase", (req, res) => {
  const { steamId, productName } = req.body
  const requestUser = getRequestUser(req)
  const currentSteamId = getRequestSteamId(req) || steamId
  const username = requestUser?.displayName || "Unknown"

  if (!currentSteamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  if (!productName) {
    return res.status(400).json({ error: "Некорректный товар" })
  }

  getProductPrice(productName, (err, productPrice) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    if (!productPrice) {
      return res.status(400).json({ error: "Некорректный товар" })
    }

    ensureUser(
      currentSteamId,
      username,
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message })
        }

        db.get(
          `
          SELECT balance
          FROM users
          WHERE steamId = ?
          `,
          [currentSteamId],
          (err, userRow) => {
            if (err) {
              return res.status(500).json({ error: err.message })
            }

            const currentBalance = Number(userRow?.balance || 0)

            if (currentBalance < productPrice) {
              return res.status(400).json({
                error: "Недостаточно средств на балансе",
                balance: currentBalance
              })
            }

            db.run(
              `
              UPDATE users
              SET balance = balance - ?
              WHERE steamId = ?
              `,
              [productPrice, currentSteamId],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: err.message })
                }

                const createdAt = new Date().toISOString()

                db.run(
                  `
                  INSERT INTO purchases (steamId, product, price, quantity, createdAt, status)
                  VALUES (?, ?, ?, ?, ?, ?)
                  `,
                  [currentSteamId, productName, productPrice, 1, createdAt, "Выдано"],
                  function (err) {
                    if (err) {
                      return res.status(500).json({ error: err.message })
                    }

                    const purchase = formatPurchase({
                      id: this.lastID,
                      product: productName,
                      price: productPrice,
                      quantity: 1,
                      createdAt
                    })

                    res.json({
                      success: true,
                      productName,
                      price: productPrice,
                      balance: currentBalance - productPrice,
                      purchase
                    })
                    sendDiscordNotification(`REDMOON: ${currentSteamId} купил ${productName} за ${productPrice} ₽`)
                  }
                )
              }
            )
          }
        )
      }
    )
  })
})

app.post("/api/purchase/cart", (req, res) => {
  const { steamId, items } = req.body
  const requestUser = getRequestUser(req)
  const currentSteamId = getRequestSteamId(req) || steamId
  const username = requestUser?.displayName || "Unknown"

  if (!currentSteamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  normalizeCartItems(Array.isArray(items) ? items : [], (err, normalizedItems) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    const total = normalizedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    if (normalizedItems.length === 0 || total <= 0) {
      return res.status(400).json({ error: "Корзина пуста или содержит некорректный товар" })
    }

    ensureUser(currentSteamId, username, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      db.get(
        `
        SELECT balance
        FROM users
        WHERE steamId = ?
        `,
        [currentSteamId],
        (err, userRow) => {
          if (err) {
            return res.status(500).json({ error: err.message })
          }

          const currentBalance = Number(userRow?.balance || 0)

          if (currentBalance < total) {
            return res.status(400).json({
              error: "Недостаточно средств на балансе",
              balance: currentBalance
            })
          }

          const createdAt = new Date().toISOString()
          const savedPurchases = []

          db.serialize(() => {
            db.run("BEGIN IMMEDIATE")

            db.run(
              `
              UPDATE users
              SET balance = balance - ?
              WHERE steamId = ?
              `,
              [total, currentSteamId],
              (err) => {
                if (err) {
                  db.run("ROLLBACK")
                  return res.status(500).json({ error: err.message })
                }

                const insertNextPurchase = (index) => {
                  const item = normalizedItems[index]

                  if (!item) {
                    db.run("COMMIT", (err) => {
                      if (err) {
                        return res.status(500).json({ error: err.message })
                      }

                      sendDiscordNotification(`REDMOON: ${currentSteamId} оплатил корзину на ${total} ₽`)
                      return res.json({
                        success: true,
                        total,
                        balance: currentBalance - total,
                        purchases: savedPurchases
                      })
                    })
                    return
                  }

                  db.run(
                    `
                    INSERT INTO purchases (steamId, product, price, quantity, createdAt, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    [currentSteamId, item.productName, item.price, item.quantity, createdAt, "Выдано"],
                    function (err) {
                      if (err) {
                        db.run("ROLLBACK")
                        return res.status(500).json({ error: err.message })
                      }

                      savedPurchases.push(formatPurchase({
                        id: this.lastID,
                        product: item.productName,
                        price: item.price,
                        quantity: item.quantity,
                        createdAt
                      }))

                      insertNextPurchase(index + 1)
                    }
                  )
                }

                insertNextPurchase(0)
              }
            )
          })
        }
      )
    })
  })
})

app.get("/api/roulette/drops", (req, res) => {
  getLatestRouletteDrops((err, drops) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    res.json(drops)
  })
})

app.get("/api/roulette/drops/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders?.()

  rouletteDropClients.add(res)

  getLatestRouletteDrops((err, drops) => {
    if (!err) {
      res.write(`data: ${JSON.stringify(drops)}\n\n`)
    }
  })

  req.on("close", () => {
    rouletteDropClients.delete(res)
  })
})

app.post("/api/roulette/spin", (req, res) => {
  const requestUser = getRequestUser(req)
  const steamId = getRequestSteamId(req)
  const username = requestUser?.displayName || requestUser?.username || "Игрок REDMOON"
  const avatar = requestUser?.photos?.[2]?.value || requestUser?.photos?.[0]?.value || null

  if (!steamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  getRoulettePrize((err, prize) => {
    if (err) {
      const status = err.message.includes("Нет доступных призов") ? 409 : 500

      return res.status(status).json({ error: err.message })
    }

    ensureUser(steamId, username, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      const createdAt = new Date().toISOString()

      db.serialize(() => {
        db.run("BEGIN IMMEDIATE")

        db.run(
          `
          UPDATE users
          SET balance = balance - ?
          WHERE steamId = ? AND balance >= ?
          `,
          [ROULETTE_PRICE, steamId, ROULETTE_PRICE],
          function (err) {
            if (err) {
              db.run("ROLLBACK")
              return res.status(500).json({ error: err.message })
            }

            if (this.changes === 0) {
              db.get(
                "SELECT balance FROM users WHERE steamId = ?",
                [steamId],
                (err, userRow) => {
                  if (err) {
                    console.log("Ошибка проверки баланса рулетки:", err.message)
                  }

                  const balance = Number(userRow?.balance || 0)

                  db.run("ROLLBACK", () => {
                    res.status(400).json({
                      error: "Недостаточно средств на балансе",
                      balance
                    })
                  })
                }
              )
              return
            }

            db.run(
              `
              INSERT INTO purchases (steamId, product, price, quantity, createdAt, status)
              VALUES (?, ?, ?, ?, ?, ?)
              `,
              [steamId, prize.name, 0, 1, createdAt, "Приз рулетки"],
              function (err) {
                if (err) {
                  db.run("ROLLBACK")
                  return res.status(500).json({ error: err.message })
                }

                const purchase = formatPurchase({
                  id: this.lastID,
                  product: prize.name,
                  price: 0,
                  quantity: 1,
                  status: "Приз рулетки",
                  createdAt
                })

                db.run(
                  `
                  INSERT INTO payments (steamId, amount, status, type, note, createdAt)
                  VALUES (?, ?, ?, ?, ?, ?)
                  `,
                  [
                    steamId,
                    -ROULETTE_PRICE,
                    "paid",
                    "roulette-spin",
                    `${ROULETTE_PRODUCT_NAME}: ${prize.name}`,
                    createdAt
                  ],
                  function (err) {
                    if (err) {
                      db.run("ROLLBACK")
                      return res.status(500).json({ error: err.message })
                    }

                    const payment = {
                      id: this.lastID,
                      steamId,
                      amount: -ROULETTE_PRICE,
                      status: "paid",
                      type: "roulette-spin",
                      note: `${ROULETTE_PRODUCT_NAME}: ${prize.name}`,
                      createdAt
                    }

                    db.run(
                      `
                      INSERT INTO roulette_drops (steamId, username, avatar, productName, productPrice, createdAt)
                      VALUES (?, ?, ?, ?, ?, ?)
                      `,
                      [steamId, username, avatar, prize.name, prize.price, createdAt],
                      function (err) {
                        if (err) {
                          db.run("ROLLBACK")
                          return res.status(500).json({ error: err.message })
                        }

                        const drop = {
                          id: this.lastID,
                          steamId,
                          username,
                          avatar,
                          productName: prize.name,
                          productPrice: prize.price,
                          createdAt
                        }

                        db.get(
                          "SELECT balance FROM users WHERE steamId = ?",
                          [steamId],
                          (err, userRow) => {
                            if (err) {
                              db.run("ROLLBACK")
                              return res.status(500).json({ error: err.message })
                            }

                            const balance = Number(userRow?.balance || 0)

                            db.run("COMMIT", (err) => {
                              if (err) {
                                return res.status(500).json({ error: err.message })
                              }

                              broadcastRouletteDrops()
                              sendDiscordNotification(
                                `REDMOON: ${steamId} открыл рулетку за ${ROULETTE_PRICE} ₽ и получил ${prize.name}`
                              )

                              res.json({
                                success: true,
                                cost: ROULETTE_PRICE,
                                balance,
                                prize: {
                                  name: prize.name,
                                  price: `${prize.price}₽`,
                                  priceValue: prize.price
                                },
                                purchase,
                                payment,
                                drop
                              })
                            })
                          }
                        )
                      }
                    )
                  }
                )
              }
            )
          }
        )
      })
    })
  })
})

app.post("/api/roulette/drops", (req, res) => {
  res.status(410).json({ error: "Выпадение рулетки создается только через оплату прокрутки" })
})

app.post("/api/deposit", (req, res) => {
  const steamId = getRequestSteamId(req)
  const requestUser = getRequestUser(req)
  const amount = Math.floor(toMoneyAmount(req.body.amount))
  const email = String(req.body.email || "").trim()

  if (!steamId) {
    return res.status(401).json({ error: "Войдите через Steam перед оплатой" })
  }

  if (!FREEKASSA_MERCHANT_ID || !FREEKASSA_SECRET_1 || !FREEKASSA_SECRET_2) {
    return res.status(503).json({ error: "FreeKassa еще не настроена на сервере" })
  }

  if (!amount || amount < MIN_DEPOSIT_AMOUNT) {
    return res.status(400).json({ error: `Минимальная сумма пополнения ${MIN_DEPOSIT_AMOUNT} ₽` })
  }

  if (amount > MAX_DEPOSIT_AMOUNT) {
    return res.status(400).json({ error: `Максимальная сумма пополнения ${MAX_DEPOSIT_AMOUNT} ₽` })
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Укажите корректный email для оплаты" })
  }

  const bonus = getDepositBonus(amount)
  const creditedAmount = getDepositTotal(amount)
  const note = bonus > 0
    ? `FreeKassa: ожидает оплату ${amount} ₽, к зачислению ${creditedAmount} ₽`
    : `FreeKassa: ожидает оплату ${amount} ₽`

  ensureUser(steamId, requestUser?.displayName || requestUser?.username || "Steam пользователь", (err) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    db.run(
      `
      INSERT INTO payments (
        steamId, amount, status, type, note, createdAt,
        provider, providerAmount, creditedAmount, customerEmail
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        steamId,
        creditedAmount,
        "pending",
        "freekassa",
        note,
        new Date().toISOString(),
        "freekassa",
        amount,
        creditedAmount,
        email
      ],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message })
        }

        const paymentId = this.lastID
        const paymentUrl = createFreeKassaPaymentUrl({
          paymentId,
          amount,
          email,
          steamId
        })

        res.json({
          success: true,
          paymentId,
          provider: "freekassa",
          paymentUrl,
          amount,
          bonus,
          creditedAmount
        })
      }
    )
  })
})

app.all("/api/freekassa/notify", (req, res) => {
  const payload = {
    ...req.query,
    ...req.body
  }
  const merchantId = String(payload.MERCHANT_ID || "")
  const paymentId = String(payload.MERCHANT_ORDER_ID || "").trim()
  const providerPaymentId = String(payload.intid || "")

  if (!FREEKASSA_MERCHANT_ID || !FREEKASSA_SECRET_2) {
    return res.status(503).send("FreeKassa is not configured")
  }

  if (merchantId !== String(FREEKASSA_MERCHANT_ID)) {
    return res.status(400).send("wrong merchant")
  }

  if (!paymentId || !verifyFreeKassaSignature(payload)) {
    return res.status(400).send("wrong sign")
  }

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE", (err) => {
      if (err) {
        return res.status(500).send(err.message)
      }

      db.get(
        "SELECT * FROM payments WHERE id = ?",
        [paymentId],
        (err, payment) => {
          if (err) {
            db.run("ROLLBACK")
            return res.status(500).send(err.message)
          }

          if (!payment) {
            db.run("ROLLBACK")
            return res.status(404).send("payment not found")
          }

          if (payment.status === "paid") {
            db.run("COMMIT", () => res.send("YES"))
            return
          }

          if (payment.status !== "pending") {
            db.run("ROLLBACK")
            return res.status(409).send("payment is not pending")
          }

          const expectedAmount = payment.providerAmount || payment.amount

          if (toKopecks(payload.AMOUNT) !== toKopecks(expectedAmount)) {
            db.run("ROLLBACK")
            return res.status(400).send("wrong amount")
          }

          const creditedAmount = Number(payment.creditedAmount || payment.amount || 0)
          const note = payment.providerAmount && payment.providerAmount !== creditedAmount
            ? `Пополнение FreeKassa: оплачено ${payment.providerAmount} ₽, зачислено ${creditedAmount} ₽`
            : `Пополнение FreeKassa: зачислено ${creditedAmount} ₽`

          db.run(
            `
            UPDATE payments
            SET status = ?, note = ?, providerPaymentId = ?
            WHERE id = ? AND status = ?
            `,
            ["paid", note, providerPaymentId, paymentId, "pending"],
            function (err) {
              if (err) {
                db.run("ROLLBACK")
                return res.status(500).send(err.message)
              }

              if (this.changes === 0) {
                db.run("ROLLBACK")
                return res.status(409).send("payment already processed")
              }

              db.run(
                `
                UPDATE users
                SET balance = balance + ?
                WHERE steamId = ?
                `,
                [creditedAmount, payment.steamId],
                (err) => {
                  if (err) {
                    db.run("ROLLBACK")
                    return res.status(500).send(err.message)
                  }

                  db.run("COMMIT", (err) => {
                    if (err) {
                      return res.status(500).send(err.message)
                    }

                    sendDiscordNotification(
                      `REDMOON: ${payment.steamId} пополнил баланс через FreeKassa на ${creditedAmount} ₽`
                    )
                    res.send("YES")
                  })
                }
              )
            }
          )
        }
      )
    })
  })
})

app.get("/api/freekassa/success", (req, res) => {
  res.redirect(`${FRONTEND_URL}?payment=success`)
})

app.get("/api/freekassa/fail", (req, res) => {
  res.redirect(`${FRONTEND_URL}?payment=cancel`)
})
app.get("/api/test-payment/:id", (req, res) => {
  const paymentId = req.params.id

  db.get(
    `
    SELECT * FROM payments
    WHERE id = ?
    `,
    [paymentId],
    (err, payment) => {
      if (err) {
        return res.status(500).send(err.message)
      }

      if (!payment) {
        return res.status(404).send("Платёж не найден")
      }

      if (payment.status === "paid") {
        return res.redirect(`${FRONTEND_URL}?payment=success`)
      }

      if (payment.status === "canceled") {
        return res.redirect(`${FRONTEND_URL}?payment=cancel`)
      }

      res.send(renderTestPaymentPage(payment))
    }
  )
})

app.post("/api/test-payment/:id/pay", (req, res) => {
  const paymentId = req.params.id

  db.get(
    `
    SELECT * FROM payments
    WHERE id = ?
    `,
    [paymentId],
    (err, payment) => {
      if (err) {
        return res.status(500).send(err.message)
      }

      if (!payment) {
        return res.status(404).send("Платёж не найден")
      }

      if (payment.status === "paid") {
        return res.redirect(`${FRONTEND_URL}?payment=success`)
      }

      if (payment.status === "canceled") {
        return res.redirect(`${FRONTEND_URL}?payment=cancel`)
      }

      db.run(
        `
        UPDATE payments
        SET status = ?
        WHERE id = ?
        `,
        ["paid", paymentId],
        (err) => {
          if (err) {
            return res.status(500).send(err.message)
          }

          db.run(
            `
            UPDATE users
            SET balance = balance + ?
            WHERE steamId = ?
            `,
            [payment.amount, payment.steamId],
            (err) => {
              if (err) {
                return res.status(500).send(err.message)
              }

              res.redirect(`${FRONTEND_URL}?payment=success`)
            }
          )
        }
      )
    }
  )
})

app.get("/api/test-payment/:id/cancel", (req, res) => {
  const paymentId = req.params.id

  db.run(
    `
    UPDATE payments
    SET status = ?
    WHERE id = ? AND status = ?
    `,
    ["canceled", paymentId, "pending"],
    (err) => {
      if (err) {
        return res.status(500).send(err.message)
      }

      res.redirect(`${FRONTEND_URL}?payment=cancel`)
    }
  )
})

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.redirect(FRONTEND_URL)
    })
  })
})

console.log("DEPOSIT ROUTE LOADED")

app.listen(3000, () => {
  console.log("Server started on port 3000")
})
