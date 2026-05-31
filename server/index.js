const express = require("express")
const cors = require("cors")
const session = require("express-session")
const passport = require("passport")
const SteamStrategy = require("passport-steam").Strategy
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const https = require("https")
const db = require("./database")

const app = express()

app.set("trust proxy", 1)
const FRONTEND_URL = "https://redmoon-dayz.ru"
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "https://dayz-shop.onrender.com").replace(/\/+$/, "")
const ADMIN_STEAM_IDS = new Set(["76561198722502186"])
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET || "redmoon_auth_secret"
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || ""
const FREEKASSA_MERCHANT_ID = process.env.FREEKASSA_MERCHANT_ID || ""
const FREEKASSA_SECRET_1 = process.env.FREEKASSA_SECRET_1 || ""
const FREEKASSA_SECRET_2 = process.env.FREEKASSA_SECRET_2 || ""
const FREEKASSA_CURRENCY = process.env.FREEKASSA_CURRENCY || "RUB"
const ENOT_SHOP_ID = process.env.ENOT_SHOP_ID || process.env.ENOT_SHOPID || process.env.ENOT_SHOP_UUID || ""
const ENOT_API_KEY = process.env.ENOT_API_KEY || process.env.ENOT_SECRET_KEY || process.env.ENOT_SECRET_1 || process.env.ENOT_SECRET_KEY_1 || ""
const ENOT_WEBHOOK_SECRET = process.env.ENOT_WEBHOOK_SECRET || process.env.ENOT_ADDITIONAL_KEY || process.env.ENOT_SECRET_2 || process.env.ENOT_SECRET_KEY_2 || ""
const ENOT_CURRENCY = process.env.ENOT_CURRENCY || "RUB"
const GAME_SERVER_TOKEN = process.env.REDMOON_GAME_SERVER_TOKEN || ""
const ENABLE_TEST_PAYMENTS = process.env.ENABLE_TEST_PAYMENTS === "1"
const DEFAULT_USD_TO_RUB_RATE = Number(process.env.DEFAULT_USD_TO_RUB_RATE || 71.209)
const EXCHANGE_RATE_CACHE_TTL_MS = 1000 * 60 * 60 * 3
const legacyUploadsDir = path.join(__dirname, "uploads")
const renderDiskDir = "/var/data"
const defaultPersistentDir = fs.existsSync(renderDiskDir) ? renderDiskDir : __dirname
const uploadsDir = process.env.UPLOADS_DIR || path.join(defaultPersistentDir, "uploads")
const productsBackupPath = process.env.PRODUCTS_BACKUP_PATH || path.join(defaultPersistentDir, "products-backup.json")
const rouletteDropClients = new Set()
const ROULETTE_PRODUCT_NAME = "Рулетка REDMOON"
const ROULETTE_PRICE = 0
const ROULETTE_COOLDOWN_MS = 24 * 60 * 60 * 1000
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

let usdRubRateCache = {
  rate: DEFAULT_USD_TO_RUB_RATE,
  source: "fallback",
  date: null,
  updatedAt: null,
  expiresAt: 0
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

const productNames = Object.keys(productCatalog)
const productDeliveryCatalog = {
  [productNames[0]]: {
    type: "vehicle",
    className: "Hatchback_02",
    attachments: [
      { className: "Hatchback_02_Wheel", quantity: 4 },
      { className: "Hatchback_02_Door_1_1", quantity: 1 },
      { className: "Hatchback_02_Door_1_2", quantity: 1 },
      { className: "Hatchback_02_Door_2_1", quantity: 1 },
      { className: "Hatchback_02_Door_2_2", quantity: 1 },
      { className: "Hatchback_02_Hood", quantity: 1 },
      { className: "Hatchback_02_Trunk", quantity: 1 },
      { className: "CarBattery", quantity: 1 },
      { className: "SparkPlug", quantity: 1 },
      { className: "HeadlightH7", quantity: 2 }
    ]
  },
  [productNames[1]]: { type: "item", className: "SledgeHammer" },
  [productNames[2]]: { type: "item", className: "NailBox" },
  [productNames[3]]: { type: "item", className: "Pliers" },
  [productNames[4]]: { type: "item", className: "Rope" },
  [productNames[5]]: { type: "item", className: "MetalWire" },
  [productNames[6]]: { type: "item", className: "Shovel" },
  [productNames[7]]: { type: "item", className: "BM_BuildingBag" },
  [productNames[8]]: { type: "item", className: "MetalPlate", quantity: 10 },
  [productNames[9]]: { type: "item", className: "Barrel_Green" },
  [productNames[10]]: { type: "item", className: "Hatchet" },
  [productNames[11]]: { type: "item", className: "Pickaxe" },
  [productNames[12]]: { type: "item", className: "TerritoryFlagKit" },
  [ROULETTE_PRODUCT_NAME]: { type: "service", className: "" },
  [productNames[14]]: { type: "service", className: "" }
}
const gameDeliveryProductNames = Object.entries(productDeliveryCatalog)
  .filter(([, delivery]) => delivery?.type && delivery.type !== "service")
  .map(([productName]) => productName)

fs.mkdirSync(uploadsDir, { recursive: true })
fs.mkdirSync(path.dirname(productsBackupPath), { recursive: true })

if (uploadsDir !== legacyUploadsDir && fs.existsSync(legacyUploadsDir)) {
  fs.readdirSync(legacyUploadsDir).forEach((filename) => {
    const source = path.join(legacyUploadsDir, filename)
    const target = path.join(uploadsDir, filename)

    if (fs.statSync(source).isFile() && !fs.existsSync(target)) {
      fs.copyFileSync(source, target)
    }
  })
}

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

const normalizeProductImageUrl = (image) => {
  const value = String(image || "").trim()

  if (!value) return ""

  if (value.startsWith(`${FRONTEND_URL}/uploads/`)) {
    return `${BACKEND_PUBLIC_URL}${value.slice(FRONTEND_URL.length)}`
  }

  if (value.startsWith("/uploads/")) {
    return `${BACKEND_PUBLIC_URL}${value}`
  }

  return value
}

const getImageUrl = (file) => file ? `${BACKEND_PUBLIC_URL}/uploads/${file.filename}` : null

const requestText = (url) =>
  new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 7000 }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume()
        reject(new Error(`Exchange rate request failed: ${response.statusCode}`))
        return
      }

      let data = ""

      response.setEncoding("utf8")
      response.on("data", (chunk) => {
        data += chunk
      })
      response.on("end", () => resolve(data))
    })

    request.on("timeout", () => {
      request.destroy(new Error("Exchange rate request timeout"))
    })
    request.on("error", reject)
  })

const fetchUsdRubRateFromCbr = async () => {
  const xml = await requestText("https://www.cbr.ru/scripts/XML_daily.asp")
  const usdBlock = (xml.match(/<Valute[^>]*>[\s\S]*?<\/Valute>/g) || [])
    .find((block) => block.includes("<CharCode>USD</CharCode>"))
  const rateValue = usdBlock?.match(/<Value>([^<]+)<\/Value>/)?.[1]
  const date = xml.match(/<ValCurs[^>]*Date="([^"]+)"/)?.[1] || null
  const rate = Number(String(rateValue || "").replace(",", "."))

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("USD/RUB rate not found in CBR response")
  }

  return {
    rate,
    source: "cbr.ru",
    date
  }
}

const getUsdRubRate = async () => {
  const now = Date.now()

  if (usdRubRateCache.expiresAt > now) {
    return {
      ...usdRubRateCache,
      cached: true
    }
  }

  try {
    const freshRate = await fetchUsdRubRateFromCbr()

    usdRubRateCache = {
      ...freshRate,
      updatedAt: new Date().toISOString(),
      expiresAt: now + EXCHANGE_RATE_CACHE_TTL_MS
    }
  } catch (err) {
    console.log("USD/RUB RATE ERROR:", err.message)

    usdRubRateCache = {
      ...usdRubRateCache,
      source: usdRubRateCache.updatedAt ? usdRubRateCache.source : "fallback",
      expiresAt: now + 1000 * 60 * 15
    }
  }

  return {
    ...usdRubRateCache,
    cached: false
  }
}

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

const requireOwnSteamIdOrAdmin = (req, res, next) => {
  const requestedSteamId = String(req.params.steamId || "").trim()
  const currentSteamId = getRequestSteamId(req)

  if (!currentSteamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  if (requestedSteamId !== currentSteamId && !isAdminSteamId(currentSteamId)) {
    return res.status(403).json({ error: "Можно смотреть только свои операции" })
  }

  next()
}

const getAdminTargetSteamId = (req) =>
  String(req.body?.steamId || req.body?.targetSteamId || getRequestSteamId(req) || "").trim()

const requireAdmin = (req, res, next) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "Доступ только для администратора" })
  }

  next()
}

const getGameTokenFromRequest = (req) =>
  String(req.get("x-redmoon-token") || req.query.token || "").trim()

const isMatchingSecret = (actual, expected) => {
  if (!actual || !expected || actual.length !== expected.length) return false

  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

const requireGameServer = (req, res, next) => {
  if (!GAME_SERVER_TOKEN) {
    return res.status(503).json({ error: "REDMOON_GAME_SERVER_TOKEN is not configured" })
  }

  if (!isMatchingSecret(getGameTokenFromRequest(req), GAME_SERVER_TOKEN)) {
    return res.status(403).json({ error: "Forbidden" })
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

const rateLimitBuckets = new Map()

const getRateLimitIdentity = (req) => {
  const steamId = getRequestSteamId(req)
  const forwardedFor = String(req.get("x-forwarded-for") || "").split(",")[0].trim()

  return steamId || forwardedFor || req.ip || req.socket?.remoteAddress || "unknown"
}

const createRateLimiter = ({ windowMs, max, keyPrefix, message }) => (req, res, next) => {
  const now = Date.now()
  const identity = getRateLimitIdentity(req)
  const key = `${keyPrefix}:${identity}`
  const timestamps = (rateLimitBuckets.get(key) || []).filter((time) => now - time < windowMs)

  if (timestamps.length >= max) {
    console.warn(`RATE LIMIT: ${keyPrefix}`, {
      identity,
      method: req.method,
      path: req.originalUrl
    })

    return res.status(429).json({
      error: message || "Слишком много запросов. Попробуйте чуть позже."
    })
  }

  timestamps.push(now)
  rateLimitBuckets.set(key, timestamps)

  next()
}

const purchaseRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 12,
  keyPrefix: "purchase",
  message: "Слишком много попыток покупки. Подождите минуту."
})

const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 8,
  keyPrefix: "payment",
  message: "Слишком много попыток оплаты. Подождите минуту."
})

const promocodeRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 8,
  keyPrefix: "promocode",
  message: "Слишком много попыток активации промокода. Попробуйте позже."
})

const transferRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 6,
  keyPrefix: "transfer",
  message: "Слишком много переводов. Подождите минуту."
})

const adminMutationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "admin-mutation",
  message: "Слишком много админ-действий. Подождите минуту."
})

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

const sortObjectKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = sortObjectKeys(value[key])
      return result
    }, {})
  }

  return value
}

const createHmacSha256 = (value, secret) =>
  crypto.createHmac("sha256", String(secret)).update(String(value), "utf8").digest("hex")

const stringifyJsonWithSpaces = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stringifyJsonWithSpaces).join(", ")}]`
  }

  return `{${Object.keys(value).map((key) => `${JSON.stringify(key)}: ${stringifyJsonWithSpaces(value[key])}`).join(", ")}}`
}

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

const formatRub = (value) => `${value} RUB`

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

const createEnotInvoice = async ({ paymentId, amount, email, steamId, creditedAmount }) => {
  const response = await fetch("https://api.enot.io/invoice/create", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": ENOT_API_KEY
    },
    body: JSON.stringify({
      amount: toMoneyAmount(amount),
      order_id: String(paymentId),
      email,
      currency: ENOT_CURRENCY,
      shop_id: ENOT_SHOP_ID,
      hook_url: `${BACKEND_PUBLIC_URL}/api/enot/notify`,
      success_url: `${BACKEND_PUBLIC_URL}/api/enot/success`,
      fail_url: `${BACKEND_PUBLIC_URL}/api/enot/fail`,
      custom_fields: JSON.stringify({
        steamId: String(steamId),
        creditedAmount
      }),
      comment: `REDMOON balance ${formatRub(creditedAmount)}`,
      expire: 300
    })
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok || data.status_check === false || !data?.data?.url) {
    throw new Error(data.error || "ENOT не вернул ссылку на оплату")
  }

  return data.data
}

const verifyEnotSignature = (payload, signature) => {
  const normalizedSignature = String(signature || "").toLowerCase()
  const sortedPayload = sortObjectKeys(payload)
  const expectedSignatures = [
    JSON.stringify(sortedPayload),
    stringifyJsonWithSpaces(sortedPayload)
  ].map((signedJson) => createHmacSha256(signedJson, ENOT_WEBHOOK_SECRET).toLowerCase())

  if (!normalizedSignature || !expectedSignatures.some((item) => item.length === normalizedSignature.length)) {
    return false
  }

  return expectedSignatures.some((expectedSignature) =>
    expectedSignature.length === normalizedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(normalizedSignature), Buffer.from(expectedSignature))
  )
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
  price: formatRub(getDiscountedPrice(product.price, product.discountPercent)),
  priceValue: getDiscountedPrice(product.price, product.discountPercent),
  image: normalizeProductImageUrl(product.image),
  isActive: Boolean(product.isActive),
  sortOrder: Number(product.sortOrder || 0),
  createdAt: product.createdAt,
  updatedAt: product.updatedAt
})

const writeProductsBackup = (reason = "products_backup") => {
  db.all(
    `
    SELECT *
    FROM products
    ORDER BY sortOrder ASC, id ASC
    `,
    [],
    (err, products) => {
      if (err) {
        console.log("PRODUCTS BACKUP READ ERROR:", err.message)
        return
      }

      const backup = {
        version: 1,
        reason,
        updatedAt: new Date().toISOString(),
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description || "",
          category: product.category || "Все для строительства",
          price: Number(product.price || 0),
          discountPercent: Number(product.discountPercent || 0),
          image: normalizeProductImageUrl(product.image),
          isActive: product.isActive ? 1 : 0,
          sortOrder: Number(product.sortOrder || 0),
          createdAt: product.createdAt || null,
          updatedAt: product.updatedAt || product.createdAt || null
        }))
      }

      fs.writeFile(productsBackupPath, JSON.stringify(backup, null, 2), "utf8", (err) => {
        if (err) {
          console.log("PRODUCTS BACKUP WRITE ERROR:", err.message)
        }
      })
    }
  )
}

const restoreProductsBackup = () => {
  if (!fs.existsSync(productsBackupPath)) return

  let backup

  try {
    backup = JSON.parse(fs.readFileSync(productsBackupPath, "utf8"))
  } catch (err) {
    console.log("PRODUCTS BACKUP PARSE ERROR:", err.message)
    return
  }

  const products = Array.isArray(backup.products) ? backup.products : []

  if (!products.length) return

  db.get("SELECT COUNT(*) AS count FROM products", [], (err, row) => {
    if (err) {
      console.log("PRODUCTS BACKUP COUNT ERROR:", err.message)
      return
    }

    if (Number(row?.count || 0) > 0) {
      writeProductsBackup("startup_sync")
      return
    }

    db.serialize(() => {
      db.run("BEGIN IMMEDIATE")

      const statement = db.prepare(
        `
        INSERT INTO products (
          name, description, category, price, discountPercent,
          image, isActive, sortOrder, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          description = excluded.description,
          category = excluded.category,
          price = excluded.price,
          discountPercent = excluded.discountPercent,
          image = excluded.image,
          isActive = excluded.isActive,
          sortOrder = excluded.sortOrder,
          updatedAt = excluded.updatedAt
        `
      )

      const now = new Date().toISOString()

      products.forEach((product, index) => {
        const name = String(product.name || "").trim()
        const price = Number(product.price || 0)

        if (!name || price <= 0) return

        statement.run(
          name,
          String(product.description || ""),
          String(product.category || "Все для строительства"),
          price,
          Math.min(Math.max(Number(product.discountPercent || 0), 0), 100),
          normalizeProductImageUrl(product.image),
          product.isActive === 0 ? 0 : 1,
          Number(product.sortOrder ?? index),
          product.createdAt || now,
          product.updatedAt || now
        )
      })

      statement.finalize((err) => {
        if (err) {
          db.run("ROLLBACK")
          console.log("PRODUCTS BACKUP RESTORE ERROR:", err.message)
          return
        }

        db.run("COMMIT", (err) => {
          if (err) {
            console.log("PRODUCTS BACKUP COMMIT ERROR:", err.message)
            return
          }

          console.log(`PRODUCTS RESTORED FROM BACKUP: ${productsBackupPath}`)
        })
      })
    })
  })
}

restoreProductsBackup()

const getDeliveryForProduct = (productName) => {
  const delivery = productDeliveryCatalog[productName]

  if (!delivery || delivery.type === "service") return null

  return delivery
}

const formatGamePurchase = (purchase) => {
  const delivery = getDeliveryForProduct(purchase.product)

  if (!delivery) return null

  const purchaseQuantity = Math.max(Number(purchase.quantity || 1), 1)
  const deliveryQuantity = Math.max(Number(delivery.quantity || 1), 1)

  return {
    id: purchase.id,
    name: purchase.product,
    description: "",
    type: delivery.type,
    status: purchase.status === "Приз рулетки" ? "Ожидает выдачи" : purchase.status,
    className: delivery.className || "",
    quantity: deliveryQuantity * purchaseQuantity,
    stack: Number(delivery.stack || 0),
    liquid: Number(delivery.liquid || 0),
    attachments: Array.isArray(delivery.attachments) ? delivery.attachments : []
  }
}

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

const getRouletteCatalogProducts = (callback) => {
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

const normalizeRouletteItem = (product, settingsMap, hasSettings) => {
  const setting = settingsMap.get(product.name)
  const defaultActive = hasSettings ? false : true
  const isActive = setting ? Boolean(setting.isActive) : defaultActive
  const weight = Math.max(Number(setting?.weight || 10), 1)
  const price = getDiscountedPrice(product.price, product.discountPercent)

  return {
    ...product,
    price,
    priceValue: price,
    isRouletteActive: isActive,
    rouletteWeight: weight
  }
}

const getRoulettePrizeProducts = (callback) => {
  getRouletteCatalogProducts((err, products) => {
    if (err) {
      callback(err)
      return
    }

    db.all("SELECT productName, isActive, weight FROM roulette_items", [], (err, settings) => {
      if (err) {
        callback(err)
        return
      }

      const settingsMap = new Map((settings || []).map((item) => [item.productName, item]))
      const hasSettings = settingsMap.size > 0
      const prizes = products
        .map((product) => normalizeRouletteItem(product, settingsMap, hasSettings))
        .filter((product) => product.isRouletteActive && product.rouletteWeight > 0)

      callback(null, prizes)
    })
  })
}

const getRoulettePrize = (callback) => {
  getRoulettePrizeProducts((err, products) => {
    if (err) {
      callback(err)
      return
    }

    const weightedPrizes = products.flatMap((product) => {
      const weight = Math.max(Number(product.rouletteWeight || 1), 1)

      return Array.from({ length: weight }, () => ({
        name: product.name,
        price: product.priceValue ?? getDiscountedPrice(product.price, product.discountPercent)
      }))
    })

    if (weightedPrizes.length === 0) {
      callback(new Error("Нет доступных призов для рулетки"))
      return
    }

    callback(null, weightedPrizes[Math.floor(Math.random() * weightedPrizes.length)])
  })
}

const getRouletteCooldown = (steamId, callback) => {
  db.get(
    `
    SELECT createdAt
    FROM roulette_spins
    WHERE steamId = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [steamId],
    (err, row) => {
      if (err) {
        callback(err)
        return
      }

      if (!row?.createdAt) {
        callback(null, { allowed: true, remainingMs: 0, nextAvailableAt: null })
        return
      }

      const lastSpinAt = new Date(row.createdAt).getTime()
      const nextSpinAt = lastSpinAt + ROULETTE_COOLDOWN_MS
      const remainingMs = nextSpinAt - Date.now()

      callback(null, {
        allowed: remainingMs <= 0,
        remainingMs: Math.max(remainingMs, 0),
        nextAvailableAt: new Date(nextSpinAt).toISOString(),
        lastSpinAt: row.createdAt
      })
    }
  )
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
        <strong>${formatRub(Number(payment.amount))}</strong>
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

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  next()
})

app.use(express.json({ limit: "64kb" }))
app.use(express.urlencoded({ extended: false, limit: "64kb" }))
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

app.get("/api/user/:steamId", requireOwnSteamIdOrAdmin, (req, res) => {
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

app.get("/api/exchange-rate/usd", async (req, res) => {
  try {
    const rateData = await getUsdRubRate()

    res.json({
      base: "USD",
      quote: "RUB",
      rate: rateData.rate,
      label: `1 USD = ${rateData.rate} RUB`,
      source: rateData.source,
      date: rateData.date,
      updatedAt: rateData.updatedAt,
      cached: rateData.cached
    })
  } catch (err) {
    res.status(500).json({
      error: "Не удалось получить курс валют",
      rate: DEFAULT_USD_TO_RUB_RATE,
      label: `1 USD = ${DEFAULT_USD_TO_RUB_RATE} RUB`
    })
  }
})

app.post("/api/promocodes/redeem", promocodeRateLimiter, (req, res) => {
  const { code } = req.body
  const normalizedCode = String(code || "").trim().toUpperCase()
  const currentSteamId = getRequestSteamId(req)
  const requestUser = getRequestUser(req)
  const username = requestUser?.displayName || requestUser?.username || "Unknown"

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

    res.json(products.map((product) => ({
      ...formatProduct({
        ...product,
        price: product.oldPriceValue || product.priceValue || product.price,
        discountPercent: 0
      }),
      price: formatRub(product.priceValue),
      priceValue: product.priceValue,
      rouletteWeight: product.rouletteWeight
    })))
  })
})

app.get("/api/roulette/status", (req, res) => {
  const steamId = getRequestSteamId(req)

  if (!steamId) {
    return res.json({ authenticated: false, allowed: false, remainingMs: 0, nextAvailableAt: null })
  }

  getRouletteCooldown(steamId, (err, cooldown) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    res.json({
      authenticated: true,
      ...cooldown
    })
  })
})

app.get("/api/admin/roulette", requireAdmin, (req, res) => {
  getRouletteCatalogProducts((err, products) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    db.all("SELECT productName, isActive, weight FROM roulette_items", [], (err, settings) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      const settingsMap = new Map((settings || []).map((item) => [item.productName, item]))
      const hasSettings = settingsMap.size > 0
      const items = products.map((product) => {
        const item = normalizeRouletteItem(product, settingsMap, hasSettings)

        return {
          id: product.id,
          name: product.name,
          price: formatRub(item.priceValue),
          priceValue: item.priceValue,
          category: product.category || "Все для строительства",
          image: normalizeProductImageUrl(product.image),
          isActive: item.isRouletteActive,
          weight: item.rouletteWeight
        }
      })

      res.json({
        cooldownHours: 24,
        items
      })
    })
  })
})

app.put("/api/admin/roulette", requireAdmin, adminMutationRateLimiter, (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : []

  getRouletteCatalogProducts((err, products) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    const catalogNames = new Set(products.map((product) => product.name))
    const normalizedItems = items
      .map((item) => ({
        productName: String(item.productName || item.name || "").trim(),
        isActive: item.isActive ? 1 : 0,
        weight: Math.min(Math.max(Math.floor(Number(item.weight || 1)), 1), 1000)
      }))
      .filter((item) => catalogNames.has(item.productName))

    db.serialize(() => {
      db.run("BEGIN IMMEDIATE")
      db.run("DELETE FROM roulette_items", [], (err) => {
        if (err) {
          db.run("ROLLBACK")
          return res.status(500).json({ error: err.message })
        }

        const statement = db.prepare(
          `
          INSERT INTO roulette_items (productName, isActive, weight, updatedAt)
          VALUES (?, ?, ?, ?)
          `
        )
        const updatedAt = new Date().toISOString()

        normalizedItems.forEach((item) => {
          statement.run(item.productName, item.isActive, item.weight, updatedAt)
        })

        statement.finalize((err) => {
          if (err) {
            db.run("ROLLBACK")
            return res.status(500).json({ error: err.message })
          }

          db.run("COMMIT", (err) => {
            if (err) {
              return res.status(500).json({ error: err.message })
            }

            writeAdminLog(req, "roulette_settings_update", "roulette", `${normalizedItems.length} товаров`)
            res.json({ success: true })
          })
        })
      })
    })
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

          db.get(
            `
            SELECT COALESCE(SUM(CASE
              WHEN providerAmount IS NOT NULL AND providerAmount > 0 THEN providerAmount
              ELSE amount
            END), 0) AS total
            FROM payments
            WHERE status = 'paid'
              AND amount > 0
              AND (
                type IN ('freekassa', 'enot')
                OR provider IN ('freekassa', 'enot')
              )
            `,
            (err, row) => {
              if (err) return res.status(500).json({ error: err.message })
              summary.paymentsActualTotal = row.total

              db.get("SELECT value FROM app_settings WHERE key = ?", ["admin_payments_total"], (err, settingsRow) => {
                if (err) return res.status(500).json({ error: err.message })

                const manualTotal = settingsRow ? Number(settingsRow.value) : null

                summary.paymentsTotal = Number.isFinite(manualTotal) ? manualTotal : summary.paymentsActualTotal
                summary.paymentsTotalMode = Number.isFinite(manualTotal) ? "manual" : "auto"
                res.json(summary)
              })
            }
          )
        })
      })
    })
  })
})

app.patch("/api/admin/summary/payments-total", requireAdmin, adminMutationRateLimiter, (req, res) => {
  const rawAmount = Number(req.body.amount)
  const amount = Math.max(Math.floor(rawAmount), 0)
  const updatedAt = new Date().toISOString()

  if (!Number.isFinite(rawAmount) || rawAmount < 0) {
    return res.status(400).json({ error: "Укажи сумму в рублях" })
  }

  db.run(
    `
    INSERT INTO app_settings (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt
    `,
    ["admin_payments_total", String(amount), updatedAt],
    (err) => {
      if (err) return res.status(500).json({ error: err.message })

      writeAdminLog(req, "payments_total_set", "admin_summary", { amount })
      res.json({
        success: true,
        paymentsTotal: amount,
        paymentsTotalMode: "manual",
        updatedAt
      })
    }
  )
})

app.delete("/api/admin/summary/payments-total", requireAdmin, adminMutationRateLimiter, (req, res) => {
  db.run("DELETE FROM app_settings WHERE key = ?", ["admin_payments_total"], (err) => {
    if (err) return res.status(500).json({ error: err.message })

    writeAdminLog(req, "payments_total_reset", "admin_summary")
    res.json({ success: true, paymentsTotalMode: "auto" })
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

app.post("/api/admin/products", requireAdmin, adminMutationRateLimiter, upload.single("image"), (req, res) => {
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
      writeProductsBackup("product_create")
    }
  )
})

app.put("/api/admin/products/:id", requireAdmin, adminMutationRateLimiter, upload.single("image"), (req, res) => {
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
          writeProductsBackup("product_update")
          res.json(formatProduct(product))
        })
      }
    )
  })
})

app.delete("/api/admin/products/:id", requireAdmin, adminMutationRateLimiter, (req, res) => {
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
      writeProductsBackup("product_hide")
      res.json({ success: true })
    }
  )
})

app.post("/api/admin/products/sort", requireAdmin, adminMutationRateLimiter, (req, res) => {
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
      writeProductsBackup("product_sort")
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

app.patch("/api/admin/purchases/:id/status", requireAdmin, adminMutationRateLimiter, (req, res) => {
  const id = req.params.id
  const status = String(req.body.status || "").trim()
  const allowedStatuses = ["Ожидает выдачи", "Выдача в игре", "Выдано", "Ошибка выдачи", "Отменено", "Приз рулетки"]

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

app.get("/api/game/purchases", requireGameServer, (req, res) => {
  const steamId = String(req.query.steamId || "").trim()

  if (!steamId) {
    return res.status(400).json({ error: "steamId is required" })
  }

  if (gameDeliveryProductNames.length === 0) {
    return res.json({ items: [] })
  }

  db.all(
    `
    SELECT *
    FROM purchases
    WHERE steamId = ?
      AND status IN ('Ожидает выдачи', 'Приз рулетки', 'Ошибка выдачи')
      AND product IN (${gameDeliveryProductNames.map(() => "?").join(",")})
    ORDER BY id ASC
    `,
    [steamId, ...gameDeliveryProductNames],
    (err, purchases) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      const items = purchases
        .map(formatGamePurchase)
        .filter(Boolean)

      res.json({ items })
    }
  )
})

app.get("/api/game/claim/start", requireGameServer, (req, res) => {
  const steamId = String(req.query.steamId || "").trim()
  const purchaseId = Number(req.query.purchaseId || 0)

  if (!steamId || !Number.isInteger(purchaseId) || purchaseId <= 0) {
    return res.status(400).json({ error: "steamId and purchaseId are required" })
  }

  const updatedAt = new Date().toISOString()

  if (gameDeliveryProductNames.length === 0) {
    return res.status(409).json({ error: "No delivery mapping configured" })
  }

  db.run(
    `
    UPDATE purchases
    SET status = ?, updatedAt = ?
    WHERE id = ?
      AND steamId = ?
      AND status IN ('Ожидает выдачи', 'Приз рулетки', 'Ошибка выдачи')
      AND product IN (${gameDeliveryProductNames.map(() => "?").join(",")})
    `,
    ["Выдача в игре", updatedAt, purchaseId, steamId, ...gameDeliveryProductNames],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      if (this.changes === 0) {
        return res.status(409).json({ error: "Purchase is not available for claim" })
      }

      db.get(
        "SELECT * FROM purchases WHERE id = ? AND steamId = ?",
        [purchaseId, steamId],
        (err, purchase) => {
          if (err) {
            return res.status(500).json({ error: err.message })
          }

          const item = formatGamePurchase({
            ...purchase,
            status: "Ожидает выдачи"
          })

          if (!item) {
            return res.status(409).json({ error: "Purchase has no delivery mapping" })
          }

          res.json({
            claimId: `${purchaseId}-${Date.now()}`,
            item
          })
        }
      )
    }
  )
})

app.get("/api/game/claim/finish", requireGameServer, (req, res) => {
  const steamId = String(req.query.steamId || "").trim()
  const claimId = String(req.query.claimId || "").trim()
  const status = String(req.query.status || "").trim()
  const purchaseId = Number(claimId.split("-")[0] || 0)
  const nextStatus = status === "success" ? "Выдано" : status === "error" ? "Ошибка выдачи" : ""

  if (!steamId || !claimId || !Number.isInteger(purchaseId) || purchaseId <= 0 || !nextStatus) {
    return res.status(400).json({ error: "steamId, claimId and status=success|error are required" })
  }

  db.run(
    `
    UPDATE purchases
    SET status = ?, updatedAt = ?
    WHERE id = ?
      AND steamId = ?
      AND status = 'Выдача в игре'
    `,
    [nextStatus, new Date().toISOString(), purchaseId, steamId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      if (this.changes === 0) {
        return res.status(409).json({ error: "Claim is not active" })
      }

      res.json({
        success: true,
        purchaseId,
        status: nextStatus
      })
    }
  )
})

app.get("/api/admin/payments", requireAdmin, (req, res) => {
  const hasPagination = req.query.page !== undefined || req.query.limit !== undefined
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100)
  const offset = (page - 1) * limit

  const paymentsSql = `
    SELECT payments.*, users.username
    FROM payments
    LEFT JOIN users ON users.steamId = payments.steamId
    ORDER BY payments.id DESC
    ${hasPagination ? "LIMIT ? OFFSET ?" : "LIMIT 100"}
  `
  const paymentsParams = hasPagination ? [limit, offset] : []

  db.get("SELECT COUNT(*) AS total FROM payments", [], (err, countRow) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    db.all(
      paymentsSql,
      paymentsParams,
      (err, payments) => {
        if (err) {
          return res.status(500).json({ error: err.message })
        }

        if (!hasPagination) {
          return res.json(payments)
        }

        const total = Number(countRow?.total || 0)

        res.json({
          items: payments,
          total,
          page,
          limit,
          totalPages: Math.max(Math.ceil(total / limit), 1)
        })
      }
    )
  })
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

app.post("/api/admin/balance/add", requireAdmin, adminMutationRateLimiter, (req, res) => {
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
                sendDiscordNotification(`REDMOON: вручную начислено ${formatRub(amount)} игроку ${steamId}. ${note || ""}`)
              }
            )
          }
        )
      }
    )
  })
})

app.post("/api/admin/balance/subtract", requireAdmin, adminMutationRateLimiter, (req, res) => {
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

app.post("/api/admin/balance/set", requireAdmin, adminMutationRateLimiter, (req, res) => {
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

app.post("/api/admin/promocodes", requireAdmin, adminMutationRateLimiter, (req, res) => {
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

app.patch("/api/admin/promocodes/:id", requireAdmin, adminMutationRateLimiter, (req, res) => {
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

app.get("/api/purchases/:steamId", requireOwnSteamIdOrAdmin, (req, res) => {
  const steamId = String(req.params.steamId || "").trim()

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

app.get("/api/payments/:steamId", requireOwnSteamIdOrAdmin, (req, res) => {
  const requestedSteamId = String(req.params.steamId || "")

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

app.post("/api/transfer", transferRateLimiter, (req, res) => {
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
                              sendDiscordNotification(`REDMOON: ${senderSteamId} перевел ${formatRub(amount)} игроку ${recipientSteamId}`)
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

app.post("/api/purchase", purchaseRateLimiter, (req, res) => {
  const { productName } = req.body
  const requestUser = getRequestUser(req)
  const currentSteamId = getRequestSteamId(req)
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
              WHERE steamId = ? AND balance >= ?
              `,
              [productPrice, currentSteamId, productPrice],
              function (err) {
                if (err) {
                  return res.status(500).json({ error: err.message })
                }

                if (this.changes === 0) {
                  return res.status(400).json({
                    error: "Недостаточно средств на балансе",
                    balance: currentBalance
                  })
                }

                const createdAt = new Date().toISOString()

                db.run(
                  `
                  INSERT INTO purchases (steamId, product, price, quantity, createdAt, status)
                  VALUES (?, ?, ?, ?, ?, ?)
                  `,
                  [currentSteamId, productName, productPrice, 1, createdAt, "Ожидает выдачи"],
                  function (err) {
                    if (err) {
                      return res.status(500).json({ error: err.message })
                    }

                    const purchase = formatPurchase({
                      id: this.lastID,
                      product: productName,
                      price: productPrice,
                      quantity: 1,
                      status: "Ожидает выдачи",
                      createdAt
                    })

                    res.json({
                      success: true,
                      productName,
                      price: productPrice,
                      balance: currentBalance - productPrice,
                      purchase
                    })
                    sendDiscordNotification(`REDMOON: ${currentSteamId} купил ${productName} за ${formatRub(productPrice)}`)
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

app.post("/api/purchase/cart", purchaseRateLimiter, (req, res) => {
  const { items } = req.body
  const requestUser = getRequestUser(req)
  const currentSteamId = getRequestSteamId(req)
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
              WHERE steamId = ? AND balance >= ?
              `,
              [total, currentSteamId, total],
              function (err) {
                if (err) {
                  db.run("ROLLBACK")
                  return res.status(500).json({ error: err.message })
                }

                if (this.changes === 0) {
                  db.run("ROLLBACK")
                  return res.status(400).json({
                    error: "Недостаточно средств на балансе",
                    balance: currentBalance
                  })
                }

                const insertNextPurchase = (index) => {
                  const item = normalizedItems[index]

                  if (!item) {
                    db.run("COMMIT", (err) => {
                      if (err) {
                        return res.status(500).json({ error: err.message })
                      }

                      sendDiscordNotification(`REDMOON: ${currentSteamId} оплатил корзину на ${formatRub(total)}`)
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
                    [currentSteamId, item.productName, item.price, item.quantity, createdAt, "Ожидает выдачи"],
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
                        status: "Ожидает выдачи",
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

app.post("/api/roulette/spin", purchaseRateLimiter, (req, res) => {
  const requestUser = getRequestUser(req)
  const steamId = getRequestSteamId(req)
  const username = requestUser?.displayName || requestUser?.username || "Игрок REDMOON"
  const avatar = requestUser?.photos?.[2]?.value || requestUser?.photos?.[0]?.value || null

  if (!steamId) {
    return res.status(401).json({ error: "Войдите через Steam" })
  }

  ensureUser(steamId, username, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }

    getRouletteCooldown(steamId, (err, cooldown) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      if (!cooldown.allowed) {
        return res.status(429).json({
          error: "Бесплатная рулетка доступна раз в 24 часа",
          ...cooldown
        })
      }

      getRoulettePrize((err, prize) => {
        if (err) {
          const status = err.message.includes("Нет доступных призов") ? 409 : 500

          return res.status(status).json({ error: err.message })
        }

        const createdAt = new Date().toISOString()

        db.serialize(() => {
          db.run("BEGIN IMMEDIATE")

          db.run(
            `
            INSERT INTO roulette_spins (steamId, createdAt)
            VALUES (?, ?)
            `,
            [steamId, createdAt],
            (err) => {
              if (err) {
                db.run("ROLLBACK")
                return res.status(500).json({ error: err.message })
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
                          const nextAvailableAt = new Date(new Date(createdAt).getTime() + ROULETTE_COOLDOWN_MS).toISOString()

                          db.run("COMMIT", (err) => {
                            if (err) {
                              return res.status(500).json({ error: err.message })
                            }

                            broadcastRouletteDrops()
                            sendDiscordNotification(
                              `REDMOON: ${steamId} бесплатно открыл рулетку и получил ${prize.name}`
                            )

                            res.json({
                              success: true,
                              cost: 0,
                              balance,
                              nextAvailableAt,
                              remainingMs: ROULETTE_COOLDOWN_MS,
                              prize: {
                                name: prize.name,
                                price: formatRub(prize.price),
                                priceValue: prize.price
                              },
                              purchase,
                              payment: null,
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
        })
      })
    })
  })
})

app.post("/api/roulette/drops", (req, res) => {
  res.status(410).json({ error: "Выпадение рулетки создается только через прокрутку" })
})

app.post("/api/deposit", paymentRateLimiter, (req, res) => {
  const steamId = getRequestSteamId(req)
  const requestUser = getRequestUser(req)
  const amount = Math.floor(toMoneyAmount(req.body.amount))
  const email = String(req.body.email || "").trim()
  const provider = String(req.body.provider || "freekassa").toLowerCase()

  if (!steamId) {
    return res.status(401).json({ error: "Войдите через Steam перед оплатой" })
  }

  if (!["freekassa", "enot"].includes(provider)) {
    return res.status(400).json({ error: "Выберите доступный способ оплаты" })
  }

  if (provider === "freekassa" && (!FREEKASSA_MERCHANT_ID || !FREEKASSA_SECRET_1 || !FREEKASSA_SECRET_2)) {
    return res.status(503).json({ error: "FreeKassa еще не настроена на сервере" })
  }

  if (provider === "enot" && (!ENOT_SHOP_ID || !ENOT_API_KEY || !ENOT_WEBHOOK_SECRET)) {
    return res.status(503).json({ error: "ENOT еще не настроен на сервере" })
  }

  if (!amount || amount < MIN_DEPOSIT_AMOUNT) {
    return res.status(400).json({ error: `Минимальная сумма пополнения ${formatRub(MIN_DEPOSIT_AMOUNT)}` })
  }

  if (amount > MAX_DEPOSIT_AMOUNT) {
    return res.status(400).json({ error: `Максимальная сумма пополнения ${formatRub(MAX_DEPOSIT_AMOUNT)}` })
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Укажите корректный email для оплаты" })
  }

  const bonus = getDepositBonus(amount)
  const creditedAmount = getDepositTotal(amount)
  const providerLabel = provider === "enot" ? "ENOT" : "FreeKassa"
  const note = bonus > 0
    ? `${providerLabel}: ожидает оплату ${formatRub(amount)}, к зачислению ${formatRub(creditedAmount)}`
    : `${providerLabel}: ожидает оплату ${formatRub(amount)}`

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
        provider,
        note,
        new Date().toISOString(),
        provider,
        amount,
        creditedAmount,
        email
      ],
      async function (err) {
        if (err) {
          return res.status(500).json({ error: err.message })
        }

        const paymentId = this.lastID

        if (provider === "freekassa") {
          const paymentUrl = createFreeKassaPaymentUrl({
            paymentId,
            amount,
            email,
            steamId
          })

          return res.json({
            success: true,
            paymentId,
            provider,
            paymentUrl,
            amount,
            bonus,
            creditedAmount
          })
        }

        try {
          const invoice = await createEnotInvoice({
            paymentId,
            amount,
            email,
            steamId,
            creditedAmount
          })

          db.run(
            "UPDATE payments SET providerPaymentId = ? WHERE id = ?",
            [invoice.id || "", paymentId],
            (err) => {
              if (err) {
                return res.status(500).json({ error: err.message })
              }

              res.json({
                success: true,
                paymentId,
                provider,
                providerPaymentId: invoice.id,
                paymentUrl: invoice.url,
                amount,
                bonus,
                creditedAmount
              })
            }
          )
        } catch (err) {
          db.run(
            "UPDATE payments SET status = ?, note = ? WHERE id = ?",
            ["failed", `${providerLabel}: ошибка создания платежа`, paymentId]
          )
          res.status(502).json({ error: err.message || "Не удалось создать платеж ENOT" })
        }
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
            ? `Пополнение FreeKassa: оплачено ${formatRub(payment.providerAmount)}, зачислено ${formatRub(creditedAmount)}`
            : `Пополнение FreeKassa: зачислено ${formatRub(creditedAmount)}`

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
                      `REDMOON: ${payment.steamId} пополнил баланс через FreeKassa на ${formatRub(creditedAmount)}`
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

app.post("/api/enot/notify", (req, res) => {
  const payload = req.body || {}
  const signature = req.get("x-api-sha256-signature")
  const paymentId = String(payload.order_id || "").trim()
  const providerPaymentId = String(payload.invoice_id || "")
  const status = String(payload.status || "").toLowerCase()

  if (!ENOT_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "ENOT webhook is not configured" })
  }

  if (!paymentId || !verifyEnotSignature(payload, signature)) {
    return res.status(400).json({ error: "wrong sign" })
  }

  if (status !== "success") {
    db.run(
      `
      UPDATE payments
      SET status = ?, note = ?, providerPaymentId = COALESCE(NULLIF(?, ''), providerPaymentId)
      WHERE id = ? AND provider = ? AND status = ?
      `,
      [
        status === "refund" ? "refunded" : "failed",
        `ENOT: платеж ${status || "не оплачен"}`,
        providerPaymentId,
        paymentId,
        "enot",
        "pending"
      ],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message })
        }

        res.json({ success: true })
      }
    )
    return
  }

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE", (err) => {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      db.get(
        "SELECT * FROM payments WHERE id = ? AND provider = ?",
        [paymentId, "enot"],
        (err, payment) => {
          if (err) {
            db.run("ROLLBACK")
            return res.status(500).json({ error: err.message })
          }

          if (!payment) {
            db.run("ROLLBACK")
            return res.status(404).json({ error: "payment not found" })
          }

          if (payment.status === "paid") {
            db.run("COMMIT", () => res.json({ success: true }))
            return
          }

          if (payment.status !== "pending") {
            db.run("ROLLBACK")
            return res.status(409).json({ error: "payment is not pending" })
          }

          const expectedAmount = payment.providerAmount || payment.amount

          if (toKopecks(payload.amount) !== toKopecks(expectedAmount)) {
            db.run("ROLLBACK")
            return res.status(400).json({ error: "wrong amount" })
          }

          const creditedAmount = Number(payment.creditedAmount || payment.amount || 0)
          const note = payment.providerAmount && payment.providerAmount !== creditedAmount
            ? `Пополнение ENOT: оплачено ${formatRub(payment.providerAmount)}, зачислено ${formatRub(creditedAmount)}`
            : `Пополнение ENOT: зачислено ${formatRub(creditedAmount)}`

          db.run(
            `
            UPDATE payments
            SET status = ?, note = ?, providerPaymentId = COALESCE(NULLIF(?, ''), providerPaymentId)
            WHERE id = ? AND status = ?
            `,
            ["paid", note, providerPaymentId, paymentId, "pending"],
            function (err) {
              if (err) {
                db.run("ROLLBACK")
                return res.status(500).json({ error: err.message })
              }

              if (this.changes === 0) {
                db.run("ROLLBACK")
                return res.status(409).json({ error: "payment already processed" })
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
                    return res.status(500).json({ error: err.message })
                  }

                  db.run("COMMIT", (err) => {
                    if (err) {
                      return res.status(500).json({ error: err.message })
                    }

                    sendDiscordNotification(
                      `REDMOON: ${payment.steamId} пополнил баланс через ENOT на ${formatRub(creditedAmount)}`
                    )
                    res.json({ success: true })
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

app.get("/api/enot/success", (req, res) => {
  res.redirect(`${FRONTEND_URL}?payment=success`)
})

app.get("/api/enot/fail", (req, res) => {
  res.redirect(`${FRONTEND_URL}?payment=cancel`)
})
app.get("/api/test-payment/:id", (req, res) => {
  if (!ENABLE_TEST_PAYMENTS) {
    return res.status(404).send("Not found")
  }

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
  if (!ENABLE_TEST_PAYMENTS) {
    return res.status(404).send("Not found")
  }

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
  if (!ENABLE_TEST_PAYMENTS) {
    return res.status(404).send("Not found")
  }

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
