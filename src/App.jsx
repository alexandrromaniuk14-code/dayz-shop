import { useState, useEffect, useRef } from "react"
import "./App.css"
import gunterImg from "./images/gunter.png"
import bannerImg from "./images/banner.png"
import flagImage from "./images/Flag.png"
import vipImage from "./images/vip.png"
import lilaxeImg from "./images/lilaxe.png";
import kuvaldaImg from "./images/kuvalda.png";
import kirkaImg from "./images/kirka.png";
import buildingbackpackImg from "./images/buildingbackpack.png";
import bochkaImg from "./images/bochka.png";
import gvozdiImg from "./images/gvozdi.png";
import metallImg from "./images/metall.png";
import lopataImg from "./images/lopata.png";
import provolokaImg from "./images/provoloka.png";
import ploskiImg from "./images/ploski.png";
import verevkaImg from "./images/verevka.png";
const products = [
  {
    name: "Gunter-2",
    price: "250₽",
    priceValue: 250,
     image: gunterImg,
     category: "Машины и запчасти",
  },
  {
    name: "Кувалда",
    price: "30₽",
    priceValue: 30,
     image: kuvaldaImg,
     category: "Все для строительства",
  },
  {
    name: "Коробка гвоздей",
    price: "70₽",
    priceValue: 70,
     image: gvozdiImg,
     category: "Все для строительства",
  },
  {
    name: "Плоскогубцы",
    price: "45₽",
    priceValue: 45,
     image: ploskiImg,
     category: "Все для строительства",
  },
  {
    name: "Веревка",
    price: "20₽",
    priceValue: 20,
     image: verevkaImg,
     category: "Все для строительства",
  },
  {
    name: "Проволока",
    price: "65₽",
    priceValue: 65,
     image: provolokaImg,
     category: "Все для строительства",
  },
  {
    name: "Лопата",
    price: "40₽",
    priceValue: 40,
     image: lopataImg,
     category: "Все для строительства",
  },
  {
    name: "Строительный рюзкак",
    price: "160₽",
    priceValue: 160,
     image: buildingbackpackImg,
     category: "Все для строительства",
  },
  {
    name: "10 листов металла",
    price: "130₽",
    priceValue: 130,
     image: metallImg,
     category: "Все для строительства",
  },
  {
    name: "Бочка",
    price: "150₽",
    priceValue: 150,
     image: bochkaImg,
     category: ["Все для строительства", "Фурнитура"]
  },
  { 
    name: "Топорик",
    price: "35₽",
    priceValue: 35,
     image: lilaxeImg,
     category: "Все для строительства",
  },
  { 
    name: "Кирка",
    price: "35₽",
    priceValue: 35,
     image: kirkaImg,
     category: "Все для строительства",
  },
  {
  name: "Флагшток",
  category: "Все для строительства",
  price: "300₽",
  priceValue: 300,
  image: flagImage
},
  {
    name: "Рулетка REDMOON",
    description: "Кейс с случайным предметом из магазина",
    price: "120₽",
    priceValue: 120,
    image: bannerImg,
    category: "Эксклюзив",
    type: "roulette",
  },
  {
    name: "VIP-слот",
    description: "VIP статус на 30 дней",
    price: "500₽",
    priceValue: 500,
    features: [
  "Приоритет входа на сервер",
  "Уникальный VIP-статус",
  "Цветной ник в Discord"
],
    image: vipImage,
category: "Эксклюзив",
  },
]

const ROULETTE_ITEM_WIDTH = 168
const ROULETTE_ITEM_GAP = 16
const ROULETTE_ITEM_STEP = ROULETTE_ITEM_WIDTH + ROULETTE_ITEM_GAP
const ROULETTE_LANDING_INDEX = 52
const ROULETTE_PRODUCT_NAME = "Рулетка REDMOON"
const ROULETTE_PRICE = 120
const ROULETTE_EXCLUDED_PRODUCT_NAMES = new Set([ROULETTE_PRODUCT_NAME, "VIP-слот"])
const API_BASE_URL = "https://dayz-shop.onrender.com"
const AUTH_TOKEN_STORAGE_KEY = "redmoonAuthToken"
const STEAM_ID_STORAGE_KEY = "redmoonSteamId"
const ADMIN_STEAM_ID = "76561198722502186"

const getStoredAuthToken = () => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)

const getAuthHeaders = () => {
  const token = getStoredAuthToken()

  return token ? { Authorization: `Bearer ${token}` } : {}
}

const authorizedFetch = (url, options = {}) => {
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {})
  }

  return fetch(url, {
    credentials: "include",
    ...options,
    headers
  })
}

const normalizeUser = (data) => {
  const steamId = data?.id || data?.steamId

  if (!steamId) return null

  return {
    ...data,
    id: String(steamId),
    steamId: String(steamId),
    displayName: data.displayName || data.username || "Steam пользователь",
    isAdmin: data.isAdmin || String(steamId) === ADMIN_STEAM_ID
  }
}

const normalizePayment = (payment) => ({
  id: payment.id,
  amount: Number(payment.amount || 0),
  status: payment.status || "pending",
  type: payment.type || "payment",
  note: payment.note || "Операция по балансу",
  createdAt: payment.createdAt,
  date: payment.createdAt
    ? new Date(payment.createdAt).toLocaleString("ru-RU")
    : "Дата не указана"
})

const isRoulettePrizeProduct = (product) => {
  const priceValue = Number(product?.priceValue || product?.oldPriceValue || 0)

  if (!product?.name || priceValue <= 0) return false

  return !ROULETTE_EXCLUDED_PRODUCT_NAMES.has(product.name)
}

const getRoulettePrizePool = (items) =>
  items.filter(isRoulettePrizeProduct)

const buildRouletteItems = (prizePool) => {
  if (!prizePool.length) return []

  return Array.from({ length: 70 }, () => prizePool[Math.floor(Math.random() * prizePool.length)])
}

function App() {
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [activeCategory, setActiveCategory] = useState("Все")
  const [searchQuery, setSearchQuery] = useState("")
  const [user, setUser] = useState(null)
  const [balance, setBalance] = useState(0) 
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [page, setPage] = useState("shop")
  const [depositAmount, setDepositAmount] = useState("")
const [depositBonus, setDepositBonus] = useState(0)
const [cart, setCart] = useState([])
const [cartOpen, setCartOpen] = useState(false)
const [message, setMessage] = useState(null)
const [isHeaderCompact, setIsHeaderCompact] = useState(false)
const [profileTab, setProfileTab] = useState("info")
const [promoCode, setPromoCode] = useState("")
const [transferSteamId, setTransferSteamId] = useState("")
const [transferAmount, setTransferAmount] = useState("")
const [purchaseHistory, setPurchaseHistory] = useState([])
const [paymentHistory, setPaymentHistory] = useState([])
const [isTransferSubmitting, setIsTransferSubmitting] = useState(false)
const [rouletteItems, setRouletteItems] = useState([])
const [rouletteOffset, setRouletteOffset] = useState(0)
const [isRouletteSpinning, setIsRouletteSpinning] = useState(false)
const [isRouletteOpening, setIsRouletteOpening] = useState(false)
const [roulettePrize, setRoulettePrize] = useState(null)
const [rouletteDrops, setRouletteDrops] = useState([])
const [rouletteSettled, setRouletteSettled] = useState(false)
const [isPurchasing, setIsPurchasing] = useState(false)
const [customProducts, setCustomProducts] = useState([])
const [adminProducts, setAdminProducts] = useState([])
const [adminUsers, setAdminUsers] = useState([])
const [adminPurchases, setAdminPurchases] = useState([])
const [adminPayments, setAdminPayments] = useState([])
const [adminLogs, setAdminLogs] = useState([])
const [adminPromocodes, setAdminPromocodes] = useState([])
const [adminTopProducts, setAdminTopProducts] = useState([])
const [adminSummary, setAdminSummary] = useState(null)
const [adminTab, setAdminTab] = useState("products")
const [adminSearch, setAdminSearch] = useState("")
const [editingProductId, setEditingProductId] = useState(null)
const [adminBalanceForm, setAdminBalanceForm] = useState({
  steamId: "",
  amount: "",
  note: "Boosty",
  mode: "add"
})
const [adminPromocodeForm, setAdminPromocodeForm] = useState({
  code: "",
  amount: "",
  maxUses: "1",
  expiresAt: ""
})
const [adminProductForm, setAdminProductForm] = useState({
  name: "",
  description: "",
  category: "Все для строительства",
  price: "",
  discountPercent: "",
  sortOrder: "",
  image: null,
  imagePreview: "",
  isActive: "1"
})
const [isAdminCategoryOpen, setIsAdminCategoryOpen] = useState(false)
const [isAdminImageDragging, setIsAdminImageDragging] = useState(false)
const rouletteViewportRef = useRef(null)
const spinStartTimerRef = useRef(null)
const spinResultTimerRef = useRef(null)

const getRouletteDropImage = (drop) =>
  [...customProducts, ...products].find((product) => product.name === drop.productName)?.image || bannerImg

const isAdmin = user?.isAdmin || user?.id === ADMIN_STEAM_ID

const resetAdminProductForm = () => {
  setEditingProductId(null)
  setAdminProductForm({
    name: "",
    description: "",
    category: "Все для строительства",
    price: "",
    discountPercent: "",
    sortOrder: "",
    image: null,
    imagePreview: "",
    isActive: "1"
  })
}

const formatRouletteDropTime = (createdAt) => {
  if (!createdAt) return "только что"

  const diffMs = Date.now() - new Date(createdAt).getTime()
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0)

  if (diffMinutes < 1) return "только что"
  if (diffMinutes < 60) return `${diffMinutes} мин. назад`

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) return `${diffHours} ч. назад`

  return new Date(createdAt).toLocaleDateString("ru-RU")
}

const normalizePurchase = (purchase) => ({
  id: purchase.id || `${purchase.name}-${purchase.createdAt || Date.now()}`,
  name: purchase.name || purchase.productName || purchase.product,
  priceValue: Number(purchase.priceValue || purchase.price || 0),
  quantity: Number(purchase.quantity || 1),
  createdAt: purchase.createdAt,
  date: purchase.date || (
    purchase.createdAt
      ? new Date(purchase.createdAt).toLocaleString("ru-RU")
      : new Date().toLocaleString("ru-RU")
  )
})

const addPurchasesToHistory = (purchases) => {
  const nextPurchases = (Array.isArray(purchases) ? purchases : [purchases])
    .filter(Boolean)
    .map(normalizePurchase)

  setPurchaseHistory((currentHistory) => {
    const currentIds = new Set(currentHistory.map((item) => item.id))
    const uniquePurchases = nextPurchases.filter((item) => !currentIds.has(item.id))

    return [
      ...uniquePurchases,
      ...currentHistory
    ]
  })
}

const addPaymentsToHistory = (payments) => {
  const nextPayments = (Array.isArray(payments) ? payments : [payments])
    .filter(Boolean)
    .map(normalizePayment)

  setPaymentHistory((currentHistory) => {
    const currentIds = new Set(currentHistory.map((item) => item.id))
    const uniquePayments = nextPayments.filter((item) => !currentIds.has(item.id))

    return [
      ...uniquePayments,
      ...currentHistory
    ]
  })
}

const loadShopProducts = () =>
  fetch(`${API_BASE_URL}/api/products`)
    .then((res) => res.json())
    .then((items) => {
      if (Array.isArray(items)) {
        setCustomProducts(items)
      }

      return items
    })
    .catch((err) => {
      console.log("PRODUCTS LOAD ERROR:", err)
      return []
    })

const refreshProductCatalog = () =>
  loadShopProducts()

const hydrateRoulettePrize = (prize) => {
  const prizeName = prize?.name || prize?.productName
  const matchedProduct = [...customProducts, ...products].find((product) => product.name === prizeName)
  const priceValue = Number(prize?.priceValue || prize?.productPrice || matchedProduct?.priceValue || 0)

  return {
    ...(matchedProduct || {}),
    name: prizeName,
    price: matchedProduct?.price || prize?.price || `${priceValue}₽`,
    priceValue,
    image: matchedProduct?.image || bannerImg
  }
}

const spinRoulette = () => {
  if (isRouletteSpinning || isRouletteOpening) return

  if (!user?.id) {
    showProfileNotice("Войдите через Steam перед рулеткой", "error")
    return
  }

  if (!hasRoulettePrizes) {
    showProfileNotice("В рулетке пока нет доступных призов", "error")
    return
  }

  if (balance < ROULETTE_PRICE) {
    showProfileNotice("Недостаточно средств для рулетки", "error")
    setDepositAmount(ROULETTE_PRICE)
    setDepositBonus(0)
    setPage("deposit")
    window.scrollTo({ top: 0, behavior: "smooth" })
    return
  }

  setIsRouletteOpening(true)

  authorizedFetch(`${API_BASE_URL}/api/roulette/spin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  })
    .then((res) =>
      res.json().then((data) => ({
        ok: res.ok,
        data
      }))
    )
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось открыть рулетку", "error")

        if ((data.error || "").includes("Недостаточно")) {
          setBalance(data.balance ?? balance)
          setDepositAmount(ROULETTE_PRICE)
          setDepositBonus(0)
          setPage("deposit")
          window.scrollTo({ top: 0, behavior: "smooth" })
        }

        return
      }

      const prize = hydrateRoulettePrize(data.prize)
      const nextItems = buildRouletteItems(roulettePrizePool)
      nextItems[ROULETTE_LANDING_INDEX] = prize

      const targetOffset =
        ROULETTE_LANDING_INDEX * ROULETTE_ITEM_STEP +
        ROULETTE_ITEM_WIDTH / 2

      clearTimeout(spinStartTimerRef.current)
      clearTimeout(spinResultTimerRef.current)

      setBalance(data.balance)
      addPurchasesToHistory(data.purchase)
      addPaymentsToHistory(data.payment)

      if (data.drop?.id) {
        setRouletteDrops((currentDrops) => [
          data.drop,
          ...currentDrops.filter((item) => item.id !== data.drop.id)
        ].slice(0, 7))
      }

      setRoulettePrize(null)
      setRouletteSettled(false)
      setRouletteItems(nextItems)
      setRouletteOffset(0)
      setIsRouletteSpinning(false)

      spinStartTimerRef.current = setTimeout(() => {
        setIsRouletteSpinning(true)
        setRouletteOffset(Math.max(targetOffset, 0))
      }, 80)

      spinResultTimerRef.current = setTimeout(() => {
        setIsRouletteSpinning(false)
        setRoulettePrize(prize)
        setRouletteSettled(true)
        showProfileNotice(`${prize.name} выпал как приз рулетки`)
      }, 5400)
    })
    .catch((err) => {
      console.log("ROULETTE SPIN ERROR:", err)
      showProfileNotice("Ошибка при открытии рулетки", "error")
    })
    .finally(() => {
      setIsRouletteOpening(false)
    })
}

useEffect(() => {
  return () => {
    clearTimeout(spinStartTimerRef.current)
    clearTimeout(spinResultTimerRef.current)
  }
}, [])

useEffect(() => {
  refreshProductCatalog()
}, [])

useEffect(() => {
  fetch("https://dayz-shop.onrender.com/api/roulette/drops")
    .then((res) => res.json())
    .then((drops) => {
      if (Array.isArray(drops)) {
        setRouletteDrops(drops)
      }
    })
    .catch((err) => {
      console.log("ROULETTE DROPS LOAD ERROR:", err)
    })

  const dropsStream = new EventSource("https://dayz-shop.onrender.com/api/roulette/drops/stream", {
    withCredentials: true
  })

  dropsStream.onmessage = (event) => {
    try {
      const drops = JSON.parse(event.data)

      if (Array.isArray(drops)) {
        setRouletteDrops(drops)
      }
    } catch (err) {
      console.log("ROULETTE STREAM PARSE ERROR:", err)
    }
  }

  dropsStream.onerror = (err) => {
    console.log("ROULETTE STREAM ERROR:", err)
  }

  return () => {
    dropsStream.close()
  }
}, [])

useEffect(() => {
  if (selectedProduct) {
    document.body.style.overflow = "hidden"
  } else {
    document.body.style.overflow = "auto"
  }

  return () => {
    document.body.style.overflow = "auto"
  }
}, [selectedProduct])
useEffect(() => {
  const handleHeaderScroll = () => {
    setIsHeaderCompact(window.scrollY > 24)
  }

  handleHeaderScroll()
  window.addEventListener("scroll", handleHeaderScroll, { passive: true })

  return () => {
    window.removeEventListener("scroll", handleHeaderScroll)
  }
}, [])
useEffect(() => {
  console.log("CURRENT URL:", window.location.href)
  console.log("SEARCH:", window.location.search)

  const params = new URLSearchParams(window.location.search)

  if (params.get("payment") === "success") {
    console.log("PAYMENT SUCCESS FOUND")
    setMessage({
      type: "success",
      text: "Оплата успешна. Баланс пополнен"
    })
    params.delete("payment")

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`

    window.history.replaceState({}, "", nextUrl)

    setTimeout(() => {
      setMessage(null)
    }, 2500)
  }

  if (params.get("payment") === "cancel") {
    setMessage({
      type: "error",
      text: "Оплата отменена"
    })
    params.delete("payment")

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`

    window.history.replaceState({}, "", nextUrl)

    setTimeout(() => {
      setMessage(null)
    }, 2500)
  }
}, [])
   const [backendMessage, setBackendMessage] = useState("")
   useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const authTokenFromUrl = params.get("authToken")
  const steamIdFromUrl = params.get("steamId")

  if (authTokenFromUrl) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authTokenFromUrl)
  }

  if (steamIdFromUrl) {
    localStorage.setItem(STEAM_ID_STORAGE_KEY, steamIdFromUrl)
  }

  if (authTokenFromUrl || steamIdFromUrl) {
    params.delete("authToken")
    params.delete("steamId")

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`

    window.history.replaceState({}, "", nextUrl)
  }

  const loadPurchaseHistory = (steamId) => {
    authorizedFetch(`${API_BASE_URL}/api/purchases/${steamId}`)
      .then((res) => res.json())
      .then((purchases) => {
        if (Array.isArray(purchases)) {
          setPurchaseHistory(purchases.map(normalizePurchase))
        }
      })
      .catch((err) => {
        console.log("PURCHASE HISTORY ERROR:", err)
      })
  }

  const loadPaymentHistory = (steamId) => {
    authorizedFetch(`${API_BASE_URL}/api/payments/${steamId}`)
      .then((res) => res.json())
      .then((payments) => {
        if (Array.isArray(payments)) {
          setPaymentHistory(payments.map(normalizePayment))
        }
      })
      .catch((err) => {
        console.log("PAYMENT HISTORY ERROR:", err)
      })
  }

  const loadUserBySteamId = (steamId) => {
    if (!steamId) {
      setUser(null)
      return
    }

    authorizedFetch(`https://dayz-shop.onrender.com/api/user/${steamId}`)
      .then((res) => res.json())
      .then((dbUser) => {
        const normalizedUser = normalizeUser(dbUser)

        setUser(normalizedUser)

        if (dbUser?.balance !== undefined) {
          setBalance(dbUser.balance)
        }
      })
      .catch((err) => {
        console.log("USER FALLBACK LOAD ERROR:", err)
        setUser(null)
      })

    loadPurchaseHistory(steamId)
    loadPaymentHistory(steamId)
  }

  authorizedFetch("https://dayz-shop.onrender.com/api/user")
    .then((res) => res.json())
    .then((data) => {
  console.log("USER FROM BACKEND:", data)
  const normalizedUser = normalizeUser(data)
  const savedSteamId = steamIdFromUrl || localStorage.getItem(STEAM_ID_STORAGE_KEY)

  setUser(normalizedUser)

      if (normalizedUser?.id) {
  localStorage.setItem(STEAM_ID_STORAGE_KEY, normalizedUser.id)

  authorizedFetch(`https://dayz-shop.onrender.com/api/user/${normalizedUser.id}`)
    .then((res) => res.json())
    .then((dbUser) => {
      if (dbUser?.balance !== undefined) {
        setBalance(dbUser.balance)
      }
    })

  loadPurchaseHistory(normalizedUser.id)
  loadPaymentHistory(normalizedUser.id)
} else if (savedSteamId) {
  loadUserBySteamId(savedSteamId)
}
    })
    .catch((err) => {
      console.log("USER LOAD ERROR:", err)
      loadUserBySteamId(steamIdFromUrl || localStorage.getItem(STEAM_ID_STORAGE_KEY))
    })
}, [])

const categories = [
  "Все",
  "Машины и запчасти",
  "Все для строительства",
  "Одежда",
  "Медицина и еда",
  "Эксклюзив",
  "Фурнитура"
]

const allProducts = [...products, ...customProducts]
const roulettePrizePool = getRoulettePrizePool(allProducts)
const hasRoulettePrizes = roulettePrizePool.length > 0

const shopCategories = [
  ...categories,
  ...customProducts
    .map((product) => product.category)
    .filter((category) => category && !categories.includes(category))
]

const adminCategoryOptions = shopCategories.filter((category) => category !== "Все")
const adminSearchValue = adminSearch.trim().toLowerCase()
const filteredAdminUsers = adminUsers.filter((item) =>
  [item.steamId, item.username].some((value) =>
    String(value || "").toLowerCase().includes(adminSearchValue)
  )
)
const filteredAdminPurchases = adminPurchases.filter((item) =>
  [item.steamId, item.username, item.name, item.status].some((value) =>
    String(value || "").toLowerCase().includes(adminSearchValue)
  )
)

const filteredProducts = allProducts.filter((product) => {
  const matchesCategory =
  activeCategory === "Все" ||
  (
    Array.isArray(product.category)
      ? product.category.includes(activeCategory)
      : product.category === activeCategory
  )

  const matchesSearch =
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.description || "").toLowerCase().includes(searchQuery.toLowerCase())

  return matchesCategory && matchesSearch
})

useEffect(() => {
  if (isRouletteSpinning || isRouletteOpening || rouletteSettled) return

  setRouletteItems(buildRouletteItems(roulettePrizePool))
}, [customProducts, isRouletteOpening, isRouletteSpinning, rouletteSettled])

const cartTotal = cart.reduce(
  (sum, item) => sum + item.priceValue * (item.quantity || 1),
  0
)
const hasRouletteFunds = balance >= ROULETTE_PRICE

const depositOptions = [
  { amount: 100, bonus: 0 },
  { amount: 300, bonus: 50 },
  { amount: 500, bonus: 100 },
  { amount: 1000, bonus: 250 },
]

const depositValue = Number(depositAmount || 0)
const depositTotal = depositValue + depositBonus

const profileMenu = [
  { id: "info", label: "Информация" },
  { id: "purchases", label: "Покупки" },
  { id: "payments", label: "Платежи" },
  { id: "promocodes", label: "Промокоды" },
  { id: "transfer", label: "Перевод средств" },
]

const profileStats = [
  { label: "Баланс", value: `${balance} ₽` },
  { label: "Корзина", value: `${cart.length} шт.` },
  { label: "Покупки", value: `${purchaseHistory.length}` },
]

const showProfileNotice = (text, type = "success") => {
  setMessage({ type, text })

  setTimeout(() => {
    setMessage(null)
  }, 2500)
}

const handleDepositPayment = () => {
  if (!user?.id) {
    showProfileNotice("Войдите через Steam перед оплатой", "error")
    return
  }

  if (!depositValue || depositValue <= 0) {
    showProfileNotice("Выберите или введите сумму пополнения", "error")
    return
  }

  fetch("https://dayz-shop.onrender.com/api/deposit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      steamId: user.id,
      amount: depositValue
    })
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl
      } else {
        showProfileNotice("Сервер не вернул ссылку на оплату", "error")
      }
    })
    .catch((err) => {
      console.log("DEPOSIT ERROR:", err)
      showProfileNotice("Ошибка при создании платежа", "error")
    })
}

const handlePromoRedeem = () => {
  if (!promoCode.trim()) {
    showProfileNotice("Введите промокод", "error")
    return
  }

  if (!user?.id) {
    showProfileNotice("Войдите через Steam", "error")
    return
  }

  fetch("https://dayz-shop.onrender.com/api/promocodes/redeem", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      steamId: user.id,
      code: promoCode
    })
  })
    .then((res) =>
      res.json().then((data) => ({
        ok: res.ok,
        data
      }))
    )
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось активировать промокод", "error")
        return
      }

      setBalance(data.balance)
      setPromoCode("")
      showProfileNotice(`Промокод активирован: +${data.amount} ₽`)
    })
    .catch((err) => {
      console.log("PROMOCODE ERROR:", err)
      showProfileNotice("Ошибка при активации промокода", "error")
    })
}

const handleTransferSubmit = () => {
  const recipientSteamId = transferSteamId.trim()
  const amount = Math.floor(Number(transferAmount || 0))

  if (isTransferSubmitting) return

  if (!user?.id) {
    showProfileNotice("Войдите через Steam перед переводом", "error")
    return
  }

  if (!/^\d{17}$/.test(recipientSteamId)) {
    showProfileNotice("Укажите корректный SteamID64 получателя", "error")
    return
  }

  if (recipientSteamId === user.id) {
    showProfileNotice("Нельзя переводить средства самому себе", "error")
    return
  }

  if (!amount || amount <= 0) {
    showProfileNotice("Введите сумму перевода", "error")
    return
  }

  if (amount > balance) {
    showProfileNotice("Недостаточно средств на балансе", "error")
    return
  }

  setIsTransferSubmitting(true)

  authorizedFetch(`${API_BASE_URL}/api/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipientSteamId,
      amount
    })
  })
    .then((res) =>
      res.json().then((data) => ({
        ok: res.ok,
        data
      }))
    )
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось выполнить перевод", "error")
        return
      }

      setBalance(data.balance)
      setTransferSteamId("")
      setTransferAmount("")
      addPaymentsToHistory(data.senderPayment)
      showProfileNotice(`Перевод выполнен: ${data.amount} ₽`)
    })
    .catch((err) => {
      console.log("TRANSFER ERROR:", err)
      showProfileNotice("Ошибка при переводе средств", "error")
    })
    .finally(() => {
      setIsTransferSubmitting(false)
    })
}

const handleProductPurchase = (product) => {
  if (isPurchasing) return

  if (!user?.id) {
    showProfileNotice("Войдите через Steam перед покупкой", "error")
    return
  }

  setIsPurchasing(true)

  fetch("https://dayz-shop.onrender.com/api/purchase", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      steamId: user.id,
      productName: product.name
    })
  })
    .then((res) =>
      res.json().then((data) => ({
        ok: res.ok,
        data
      }))
    )
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось купить предмет", "error")

        if ((data.error || "").includes("Недостаточно средств")) {
          setDepositAmount(product.priceValue)
          setDepositBonus(0)
          setSelectedProduct(null)
          setPage("deposit")
        }

        return
      }

      setBalance(data.balance)
      addPurchasesToHistory(data.purchase)
      setSelectedProduct(null)
      showProfileNotice(`${product.name} куплен. Списано ${data.price} ₽`)
    })
    .catch((err) => {
      console.log("PURCHASE ERROR:", err)
      showProfileNotice("Ошибка при покупке предмета", "error")
    })
    .finally(() => {
      setIsPurchasing(false)
    })
}

const handleCartCheckout = () => {
  if (isPurchasing) return

  if (!user?.id) {
    showProfileNotice("Войдите через Steam перед покупкой", "error")
    return
  }

  if (cart.length === 0) {
    showProfileNotice("Корзина пуста", "error")
    return
  }

  setIsPurchasing(true)

  fetch("https://dayz-shop.onrender.com/api/purchase/cart", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      steamId: user.id,
      items: cart.map((item) => ({
        productName: item.name,
        quantity: item.quantity || 1
      }))
    })
  })
    .then((res) =>
      res.json().then((data) => ({
        ok: res.ok,
        data
      }))
    )
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось оплатить корзину", "error")

        if ((data.error || "").includes("Недостаточно средств")) {
          setDepositAmount(cartTotal)
          setDepositBonus(0)
        }

        return
      }

      setBalance(data.balance)
      addPurchasesToHistory(data.purchases)
      setCart([])
      setCartOpen(false)
      showProfileNotice(`Покупка успешно оплачена. Списано ${data.total} ₽`)
    })
    .catch((err) => {
      console.log("CART PURCHASE ERROR:", err)
      showProfileNotice("Ошибка при оплате корзины", "error")
    })
    .finally(() => {
      setIsPurchasing(false)
    })
}

const loadAdminData = () => {
  if (!isAdmin) return

  Promise.all([
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/summary").then((res) => res.json()),
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/products").then((res) => res.json()),
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/users").then((res) => res.json()),
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/purchases").then((res) => res.json()),
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/payments").then((res) => res.json()),
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/logs").then((res) => res.json()),
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/promocodes").then((res) => res.json()),
    authorizedFetch("https://dayz-shop.onrender.com/api/admin/top-products").then((res) => res.json())
  ])
    .then(([summary, productsList, usersList, purchasesList, paymentsList, logsList, promocodesList, topProductsList]) => {
      if (!summary.error) setAdminSummary(summary)
      if (Array.isArray(productsList)) setAdminProducts(productsList)
      if (Array.isArray(usersList)) setAdminUsers(usersList)
      if (Array.isArray(purchasesList)) setAdminPurchases(purchasesList)
      if (Array.isArray(paymentsList)) setAdminPayments(paymentsList)
      if (Array.isArray(logsList)) setAdminLogs(logsList)
      if (Array.isArray(promocodesList)) setAdminPromocodes(promocodesList)
      if (Array.isArray(topProductsList)) setAdminTopProducts(topProductsList)
    })
    .catch((err) => {
      console.log("ADMIN LOAD ERROR:", err)
      showProfileNotice("Не удалось загрузить админ-панель", "error")
    })
}

const handleAdminProductSubmit = (event) => {
  event.preventDefault()

  if (!isAdmin) {
    showProfileNotice("Нет доступа к админ-панели", "error")
    return
  }

  if (!adminProductForm.name.trim()) {
    showProfileNotice("Введите название товара", "error")
    return
  }

  if (!adminProductForm.price || Number(adminProductForm.price) <= 0) {
    showProfileNotice("Введите цену товара", "error")
    return
  }

  if (!editingProductId && !adminProductForm.image) {
    showProfileNotice("Добавьте картинку товара", "error")
    return
  }

  const formData = new FormData()
  formData.append("name", adminProductForm.name)
  formData.append("description", adminProductForm.description)
  formData.append("category", adminProductForm.category)
  formData.append("price", adminProductForm.price)
  formData.append("discountPercent", adminProductForm.discountPercent.trim() === "" ? "0" : adminProductForm.discountPercent)
  formData.append("sortOrder", adminProductForm.sortOrder || "0")
  formData.append("isActive", adminProductForm.isActive)

  if (adminProductForm.image) {
    formData.append("image", adminProductForm.image)
  }

  authorizedFetch(
    editingProductId
      ? `https://dayz-shop.onrender.com/api/admin/products/${editingProductId}`
      : "https://dayz-shop.onrender.com/api/admin/products",
    {
      method: editingProductId ? "PUT" : "POST",
      credentials: "include",
      body: formData
    }
  )
    .then((res) =>
      res.json().then((data) => ({
        ok: res.ok,
        data
      }))
    )
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось сохранить товар", "error")
        return
      }

      resetAdminProductForm()
      loadAdminData()
      refreshProductCatalog()

      showProfileNotice(editingProductId ? "Товар обновлен" : "Товар добавлен")
    })
    .catch((err) => {
      console.log("ADMIN PRODUCT SAVE ERROR:", err)
      showProfileNotice("Ошибка при сохранении товара", "error")
    })
}

const handleAdminBalanceSubmit = (event) => {
  event.preventDefault()

  if (!isAdmin) {
    showProfileNotice("Нет доступа к админ-панели", "error")
    return
  }

  const endpointByMode = {
    add: "https://dayz-shop.onrender.com/api/admin/balance/add",
    subtract: "https://dayz-shop.onrender.com/api/admin/balance/subtract",
    set: "https://dayz-shop.onrender.com/api/admin/balance/set"
  }

  authorizedFetch(endpointByMode[adminBalanceForm.mode], {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(adminBalanceForm)
  })
    .then((res) =>
      res.json().then((data) => ({
        ok: res.ok,
        data
      }))
    )
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось начислить баланс", "error")
        return
      }

      setAdminBalanceForm({
        steamId: "",
        amount: "",
        note: "Boosty",
        mode: "add"
      })
      loadAdminData()
      showProfileNotice(`Баланс игрока: ${data.balance} ₽`)
    })
    .catch((err) => {
      console.log("ADMIN BALANCE ERROR:", err)
      showProfileNotice("Ошибка при начислении баланса", "error")
    })
}

const setAdminProductImage = (file) => {
  if (!file) return

  if (!file.type.startsWith("image/")) {
    showProfileNotice("Перетащи именно картинку", "error")
    return
  }

  setAdminProductForm((currentForm) => ({
    ...currentForm,
    image: file,
    imagePreview: URL.createObjectURL(file)
  }))
}

const removeAdminProductImage = () => {
  setAdminProductForm((currentForm) => ({
    ...currentForm,
    image: null,
    imagePreview: ""
  }))
}

const editAdminProduct = (product) => {
  setEditingProductId(product.id)
  setAdminProductForm({
    name: product.name,
    description: product.description || "",
    category: product.category || "Все для строительства",
    price: product.oldPriceValue || product.priceValue,
    discountPercent: product.discountPercent ? String(product.discountPercent) : "",
    sortOrder: product.sortOrder ? String(product.sortOrder) : "",
    image: null,
    imagePreview: product.image || "",
    isActive: product.isActive ? "1" : "0"
  })
  setAdminTab("products")
}

const hideAdminProduct = (productId) => {
  authorizedFetch(`https://dayz-shop.onrender.com/api/admin/products/${productId}`, {
    method: "DELETE",
    credentials: "include"
  })
    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось скрыть товар", "error")
        return
      }

      loadAdminData()
      setCustomProducts((currentProducts) =>
        currentProducts.filter((product) => product.id !== productId)
      )
      setRoulettePrizeProducts((currentProducts) =>
        currentProducts.filter((product) => product.id !== productId)
      )
      showProfileNotice("Товар скрыт из магазина")
    })
    .catch((err) => {
      console.log("ADMIN PRODUCT DELETE ERROR:", err)
      showProfileNotice("Ошибка при скрытии товара", "error")
    })
}

const moveAdminProduct = (productId, direction) => {
  const currentIndex = adminProducts.findIndex((product) => product.id === productId)
  const nextIndex = currentIndex + direction

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= adminProducts.length) return

  const nextProducts = [...adminProducts]
  const [product] = nextProducts.splice(currentIndex, 1)
  nextProducts.splice(nextIndex, 0, product)
  setAdminProducts(nextProducts)

  authorizedFetch("https://dayz-shop.onrender.com/api/admin/products/sort", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: nextProducts.map((item) => ({ id: item.id }))
    })
  }).then(refreshProductCatalog)
}

const updatePurchaseStatus = (purchaseId, status) => {
  authorizedFetch(`https://dayz-shop.onrender.com/api/admin/purchases/${purchaseId}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  })
    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось изменить статус", "error")
        return
      }

      setAdminPurchases((currentPurchases) =>
        currentPurchases.map((item) =>
          item.id === purchaseId ? { ...item, status } : item
        )
      )
      showProfileNotice(`Статус: ${status}`)
    })
}

const handleAdminPromocodeSubmit = (event) => {
  event.preventDefault()

  authorizedFetch("https://dayz-shop.onrender.com/api/admin/promocodes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(adminPromocodeForm)
  })
    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        showProfileNotice(data.error || "Не удалось создать промокод", "error")
        return
      }

      setAdminPromocodeForm({ code: "", amount: "", maxUses: "1", expiresAt: "" })
      loadAdminData()
      showProfileNotice("Промокод создан")
    })
}

const toggleAdminPromocode = (promo) => {
  authorizedFetch(`https://dayz-shop.onrender.com/api/admin/promocodes/${promo.id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: !promo.isActive })
  })
    .then(() => loadAdminData())
}

const openProductFromCard = (product) => {
  if (product.type === "roulette") {
    setPage("roulette")
    window.scrollTo({ top: 0, behavior: "smooth" })
    return
  }

  setSelectedProduct(product)
}

useEffect(() => {
  if (page === "admin") {
    loadAdminData()
  }
}, [page, isAdmin])

  return (
    <>
    <div style={{
  background: `
  linear-gradient(rgba(0,0,0,0.82), rgba(0,0,0,0.94)),
  url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop")
`,
backgroundSize: "cover",
backgroundPosition: "center",
backgroundAttachment: "fixed",
  minHeight: "100vh",
  color: "white",
  fontFamily: "Arial",
  width: "100vw",
  margin: "0",
  padding: "0",
  overflowX: "hidden"
}}>
      <header
        className={isHeaderCompact ? "site-header compact" : "site-header"}
        style={{
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: isHeaderCompact ? "10px 45px" : "22px 45px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
  backgroundColor: "rgba(10,10,10,0.75)",
  backdropFilter: "blur(10px)",
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  width: "100%",
  boxSizing: "border-box",
  zIndex: 1000
}}
      >
        <h1
  className="redmoon-logo-button"
  onClick={() => setPage("shop")}
  onMouseMove={(e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2

    e.currentTarget.style.setProperty("--logo-x", `${((x + 1) / 2) * 100}%`)
    e.currentTarget.style.setProperty("--logo-y", `${((y + 1) / 2) * 100}%`)
    e.currentTarget.style.transform =
      `perspective(720px) rotateX(${y * 7}deg) rotateY(${-x * 12}deg) translateY(-2px) scale(1.035)`
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.setProperty("--logo-x", "50%")
    e.currentTarget.style.setProperty("--logo-y", "50%")
    e.currentTarget.style.transform =
      "perspective(720px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)"
  }}
>
  REDMOON
</h1>

        <nav
          className="site-header-nav"
          style={{
  display: "flex",
  gap: "20px",
  alignItems: "center"
}}
        >
  <a
  href="https://discord.gg/KkVftnGe"
  target="_blank"
  className="discord-button"
>
  <svg
    width="24"
    height="24"
    viewBox="0 0 127.14 96.36"
    fill="currentColor"
  >
    <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21A105.73,105.73,0,0,0,32.71,96.36a77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
  </svg>
</a>
<a
  href="https://vk.com/ТВОЯ_ГРУППА"
  target="_blank"
  className="vk-button"
>
  VK
</a>
<a
  href="https://t.me/ТВОЙ_КАНАЛ"
  target="_blank"
  className="tg-button"
>
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M21.5 2.5L2.9 9.7c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.7c.2.6.1.8.8.8.5 0 .7-.2 1-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8L23 4c.3-1.4-.5-2-1.5-1.5zm-12 9.7l9.2-5.8c.5-.3.9-.1.5.2l-7.6 6.8-.3 3.4-1.8-4.6z"/>
  </svg>
</a>

{user && (
  <button
    onClick={() => setPage("deposit")}
    style={{
  display: "flex",
  alignItems: "center",
  justifyContent: "center",

  minWidth: "78px",
  height: "46px",

  padding: "0 18px",

  borderRadius: "14px",

  background:
    "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",

  border: "1px solid rgba(255,255,255,0.10)",

  backdropFilter: "blur(12px)",

  color: "white",
  fontWeight: "bold",
  fontSize: "15px",

  boxShadow: `
    inset 0 1px 0 rgba(255,255,255,0.10),
    0 0 18px rgba(255,59,79,0.10)
  `,

  transition: "0.25s ease",
  cursor: "pointer"
}}
onMouseEnter={(e) => {
  e.currentTarget.style.transform = "scale(1.05)"
  e.currentTarget.style.boxShadow =
    "inset 0 1px 0 rgba(255,255,255,0.14), 0 0 26px rgba(255,59,79,0.22)"
}}

onMouseLeave={(e) => {
  e.currentTarget.style.transform = "scale(1)"
  e.currentTarget.style.boxShadow =
    "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 18px rgba(255,59,79,0.10)"
}}
  >
    {balance} ₽
  </button>
)}
<div
  onClick={() => setCartOpen(true)}
  style={{
  display: "flex",
  alignItems: "center",
  justifyContent: "center",

  minWidth: "78px",
  height: "46px",

  padding: "0 18px",

  borderRadius: "14px",

  background:
    "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",

  border: "1px solid rgba(255,255,255,0.10)",

  backdropFilter: "blur(12px)",

  color: "white",
  fontWeight: "bold",
  fontSize: "15px",

  boxShadow: `
    inset 0 1px 0 rgba(255,255,255,0.10),
    0 0 18px rgba(255,59,79,0.10)
  `,

  transition: "0.25s ease",
  cursor: "pointer"
}}
  onMouseEnter={(e) => {
  e.currentTarget.style.transform = "scale(1.05)"
  e.currentTarget.style.boxShadow =
    "inset 0 1px 0 rgba(255,255,255,0.14), 0 0 26px rgba(255,59,79,0.22)"
}}

onMouseLeave={(e) => {
  e.currentTarget.style.transform = "scale(1)"
  e.currentTarget.style.boxShadow =
    "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 18px rgba(255,59,79,0.10)"
}}
>
  🛒 {cart.length}
</div>
{isAdmin && (
  <button
    className="admin-header-button"
    onClick={() => setPage("admin")}
  >
    Админ
  </button>
)}
{paymentSuccess && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.75)",
      zIndex: 9999,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "20px",
paddingTop: "120px"
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: "430px",
        background: "linear-gradient(135deg, #151515, #0b0b0b)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "24px",
        padding: "32px",
        textAlign: "center",
        boxShadow: "0 0 40px rgba(255,59,79,0.35)",
        color: "white"
      }}
    >
      <div
        style={{
          fontSize: "54px",
          marginBottom: "12px"
        }}
      >
        ✅
      </div>

      <h2
        style={{
          fontSize: "32px",
          marginBottom: "12px",
          color: "#ff3b4f"
        }}
      >
        Оплата успешна
      </h2>

      <p
        style={{
          fontSize: "17px",
          color: "rgba(255,255,255,0.75)",
          marginBottom: "28px"
        }}
      >
        Баланс пополнен. Средства уже зачислены на аккаунт.
      </p>

      <button
        onClick={() => {
          setPaymentSuccess(false)
          setPage("shop")
        }}
        style={{
          width: "100%",
          padding: "14px",
          border: "none",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #f13b4f, #b11226)",
          color: "white",
          fontWeight: "bold",
          fontSize: "16px",
          cursor: "pointer"
        }}
      >
        Вернуться в магазин
      </button>
    </div>
  </div>
)}
{user ? (
  <button
    className="profile-avatar-button"
    onClick={() => setPage("profile")}
    title={user.displayName}
  >
    <img
      src={user.photos?.[2]?.value || user.photos?.[0]?.value}
      alt="Профиль"
    />
  </button>
) : (
  <button
    className="login-button"
    onClick={() => {
      window.location.href = "https://dayz-shop.onrender.com/auth/steam"
    }}
  >
    Авторизоваться
  </button>
)}
</nav>
      </header>
      {page === "admin" && (
  <main className="admin-page">
    {!isAdmin ? (
      <section className="admin-denied">
        <span>REDMOON ADMIN</span>
        <h2>Доступ только для владельца</h2>
        <p>Войди через Steam аккаунт с ID 76561198722502186.</p>
        <button
          onClick={() => {
            window.location.href = "https://dayz-shop.onrender.com/auth/steam"
          }}
        >
          Авторизоваться
        </button>
      </section>
    ) : (
      <section className="admin-shell">
        <div className="admin-head">
          <div>
            <span>REDMOON CONTROL</span>
            <h2>Админ-панель</h2>
          </div>
          <button onClick={loadAdminData}>Обновить</button>
        </div>

        <div className="admin-stats-grid">
          <div>
            <span>Игроки</span>
            <strong>{adminSummary?.users ?? 0}</strong>
          </div>
          <div>
            <span>Покупки</span>
            <strong>{adminSummary?.purchases ?? 0}</strong>
          </div>
          <div>
            <span>Товары админки</span>
            <strong>{adminSummary?.products ?? 0}</strong>
          </div>
          <div>
            <span>Пополнено</span>
            <strong>{adminSummary?.paymentsTotal ?? 0} ₽</strong>
          </div>
        </div>

        <div className="admin-tabs">
          {[
            ["products", "Товары"],
            ["balance", "Начислить баланс"],
            ["users", "Игроки"],
            ["purchases", "Покупки"],
            ["payments", "Платежи"],
            ["top", "Топ товаров"],
            ["promocodes", "Промокоды"],
            ["logs", "Логи"]
          ].map(([id, label]) => (
            <button
              key={id}
              className={adminTab === id ? "active" : ""}
              onClick={() => setAdminTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {(adminTab === "users" || adminTab === "purchases") && (
          <input
            className="admin-search-input"
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder="Поиск по SteamID, нику, товару или статусу"
          />
        )}

        {adminTab === "products" && (
          <div className="admin-grid admin-products-grid">
            <form className="admin-card admin-product-form" onSubmit={handleAdminProductSubmit}>
              <h3>{editingProductId ? "Редактировать товар" : "Добавить товар"}</h3>

              <input
                value={adminProductForm.name}
                onChange={(e) => setAdminProductForm({ ...adminProductForm, name: e.target.value })}
                placeholder="Название товара"
                required
              />

              <input
                type="number"
                min="1"
                value={adminProductForm.price}
                onChange={(e) => setAdminProductForm({ ...adminProductForm, price: e.target.value })}
                placeholder="Цена в рублях"
                required
              />

              <input
                type="number"
                min="0"
                max="100"
                value={adminProductForm.discountPercent}
                onChange={(e) => setAdminProductForm({ ...adminProductForm, discountPercent: e.target.value })}
                placeholder="Скидка, %"
              />

              <input
                type="number"
                value={adminProductForm.sortOrder}
                onChange={(e) => setAdminProductForm({ ...adminProductForm, sortOrder: e.target.value })}
                placeholder="Порядок сортировки"
              />

              <div
                className="admin-category-field"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsAdminCategoryOpen(false)
                  }
                }}
              >
                <input
                  value={adminProductForm.category}
                  onFocus={() => setIsAdminCategoryOpen(true)}
                  onChange={(e) => {
                    setAdminProductForm({ ...adminProductForm, category: e.target.value })
                    setIsAdminCategoryOpen(true)
                  }}
                  placeholder="Категория"
                />

                <button
                  type="button"
                  className={isAdminCategoryOpen ? "admin-category-arrow open" : "admin-category-arrow"}
                  aria-label="Показать категории"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setIsAdminCategoryOpen((isOpen) => !isOpen)}
                >
                  ⌄
                </button>

                {isAdminCategoryOpen && (
                  <div className="admin-category-menu">
                    {adminCategoryOptions.map((category) => (
                      <button
                        type="button"
                        key={category}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setAdminProductForm({ ...adminProductForm, category })
                          setIsAdminCategoryOpen(false)
                        }}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <textarea
                value={adminProductForm.description}
                onChange={(e) => setAdminProductForm({ ...adminProductForm, description: e.target.value })}
                placeholder="Описание товара"
              />

              <div className="admin-file-wrap">
                <label
                  className={isAdminImageDragging ? "admin-file-field dragging" : "admin-file-field"}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setIsAdminImageDragging(true)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()

                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setIsAdminImageDragging(false)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsAdminImageDragging(false)
                    setAdminProductImage(e.dataTransfer.files?.[0])
                  }}
                >
                  <span>{adminProductForm.image ? adminProductForm.image.name : "Выбрать или перетащить картинку"}</span>
                  <em>Обязательно: PNG, JPG, WEBP до 20 МБ</em>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setAdminProductImage(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                </label>

                {adminProductForm.imagePreview && (
                  <button
                    type="button"
                    className="admin-remove-image-button"
                    onClick={removeAdminProductImage}
                  >
                    Удалить картинку
                  </button>
                )}
              </div>

              <select
                value={adminProductForm.isActive}
                onChange={(e) => setAdminProductForm({ ...adminProductForm, isActive: e.target.value })}
              >
                <option value="1">Показывать в магазине</option>
                <option value="0">Скрыть из магазина</option>
              </select>

              <div className="admin-form-actions">
                <button type="submit">
                  {editingProductId ? "Сохранить" : "Добавить"}
                </button>
                {editingProductId && (
                  <button type="button" onClick={resetAdminProductForm}>
                    Отмена
                  </button>
                )}
              </div>

              <div className="admin-product-preview">
                <span>Предпросмотр</span>
                {adminProductForm.imagePreview && (
                  <img src={adminProductForm.imagePreview} alt="Предпросмотр товара" />
                )}
                <strong>{adminProductForm.name || "Название товара"}</strong>
                <em>
                  {Math.max(Math.round(Number(adminProductForm.price || 0) * (100 - Number(adminProductForm.discountPercent || 0)) / 100), 0)} ₽
                </em>
              </div>
            </form>

            <div className="admin-card">
              <h3>Товары из админки</h3>
              {adminProducts.length === 0 ? (
                <div className="profile-empty-state">Пока нет добавленных товаров.</div>
              ) : (
                <div className="admin-products-list">
                  {adminProducts.map((product) => (
                    <div className="admin-product-row" key={product.id}>
                      <img src={product.image} alt={product.name} />
                      <div>
                        <strong>{product.name}</strong>
                        <span>
                          {product.category} · {product.priceValue} ₽
                          {product.discountPercent ? ` · скидка ${product.discountPercent}%` : ""}
                          · {product.isActive ? "виден" : "скрыт"}
                        </span>
                      </div>
                      <button onClick={() => moveAdminProduct(product.id, -1)}>↑</button>
                      <button onClick={() => moveAdminProduct(product.id, 1)}>↓</button>
                      <button onClick={() => editAdminProduct(product)}>Изм.</button>
                      <button onClick={() => hideAdminProduct(product.id)}>Скрыть</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {adminTab === "balance" && (
          <div className="admin-grid">
            <form className="admin-card admin-product-form" onSubmit={handleAdminBalanceSubmit}>
              <h3>Начислить баланс</h3>

              <select
                value={adminBalanceForm.mode}
                onChange={(e) => setAdminBalanceForm({ ...adminBalanceForm, mode: e.target.value })}
              >
                <option value="add">Начислить</option>
                <option value="subtract">Списать</option>
                <option value="set">Установить точный баланс</option>
              </select>

              <input
                value={adminBalanceForm.steamId}
                onChange={(e) => setAdminBalanceForm({ ...adminBalanceForm, steamId: e.target.value })}
                placeholder="SteamID игрока"
              />

              <input
                type="number"
                value={adminBalanceForm.amount}
                onChange={(e) => setAdminBalanceForm({ ...adminBalanceForm, amount: e.target.value })}
                placeholder="Сумма в рублях"
              />

              <input
                value={adminBalanceForm.note}
                onChange={(e) => setAdminBalanceForm({ ...adminBalanceForm, note: e.target.value })}
                placeholder="Комментарий, например Boosty или номер чека"
              />

              <div className="admin-form-actions">
                <button type="submit">
                  {adminBalanceForm.mode === "add" ? "Начислить" : adminBalanceForm.mode === "subtract" ? "Списать" : "Установить"}
                </button>
              </div>
            </form>

            <div className="admin-card">
              <h3>Последние платежи</h3>
              <div className="profile-table-wrap">
                <table className="profile-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>SteamID</th>
                      <th>Сумма</th>
                      <th>Тип</th>
                      <th>Комментарий</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminPayments.slice(0, 8).map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.steamId}</td>
                        <td>{item.amount} ₽</td>
                        <td>{item.type || "payment"}</td>
                        <td>{item.note || "-"}</td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {adminTab === "users" && (
          <div className="admin-card">
            <h3>Игроки</h3>
            <div className="profile-table-wrap">
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>SteamID</th>
                    <th>Ник</th>
                    <th>Баланс</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminUsers.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.steamId}</td>
                      <td>{item.username}</td>
                      <td>{item.balance} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === "purchases" && (
          <div className="admin-card">
            <h3>Последние покупки</h3>
            <div className="profile-table-wrap">
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Игрок</th>
                    <th>SteamID</th>
                    <th>Товар</th>
                    <th>Цена</th>
                    <th>Кол-во</th>
                    <th>Дата</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminPurchases.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.username}</td>
                      <td>{item.steamId}</td>
                      <td>{item.name}</td>
                      <td>{item.priceValue} ₽</td>
                      <td>{item.quantity}</td>
                      <td>{item.date}</td>
                      <td>
                        <select
                          value={item.status || "Ожидает выдачи"}
                          onChange={(e) => updatePurchaseStatus(item.id, e.target.value)}
                        >
                          <option value="Ожидает выдачи">Ожидает</option>
                          <option value="Выдано">Выдано</option>
                          <option value="Отменено">Отменено</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === "payments" && (
          <div className="admin-card">
            <h3>Платежи</h3>
            <div className="profile-table-wrap">
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Игрок</th>
                    <th>SteamID</th>
                    <th>Сумма</th>
                    <th>Тип</th>
                    <th>Комментарий</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {adminPayments.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.username || "Unknown"}</td>
                      <td>{item.steamId}</td>
                      <td>{item.amount} ₽</td>
                      <td>{item.type || "payment"}</td>
                      <td>{item.note || "-"}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === "top" && (
          <div className="admin-card">
            <h3>Топ товаров по покупкам</h3>
            <div className="profile-table-wrap">
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Товар</th>
                    <th>Куплено</th>
                    <th>Покупок</th>
                    <th>Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  {adminTopProducts.map((item, index) => (
                    <tr key={item.name}>
                      <td>{index + 1}</td>
                      <td>{item.name}</td>
                      <td>{item.totalQuantity || 0} ед.</td>
                      <td>{item.totalPurchases || 0}</td>
                      <td>{item.totalRevenue || 0} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {adminTab === "promocodes" && (
          <div className="admin-grid">
            <form className="admin-card admin-product-form" onSubmit={handleAdminPromocodeSubmit}>
              <h3>Создать промокод</h3>
              <input
                value={adminPromocodeForm.code}
                onChange={(e) => setAdminPromocodeForm({ ...adminPromocodeForm, code: e.target.value })}
                placeholder="Код, например BOOSTY100"
              />
              <input
                type="number"
                value={adminPromocodeForm.amount}
                onChange={(e) => setAdminPromocodeForm({ ...adminPromocodeForm, amount: e.target.value })}
                placeholder="Сумма"
              />
              <input
                type="number"
                value={adminPromocodeForm.maxUses}
                onChange={(e) => setAdminPromocodeForm({ ...adminPromocodeForm, maxUses: e.target.value })}
                placeholder="Лимит активаций"
              />
              <input
                type="date"
                value={adminPromocodeForm.expiresAt}
                onChange={(e) => setAdminPromocodeForm({ ...adminPromocodeForm, expiresAt: e.target.value })}
              />
              <div className="admin-form-actions">
                <button type="submit">Создать</button>
              </div>
            </form>

            <div className="admin-card">
              <h3>Промокоды</h3>
              <div className="admin-products-list">
                {adminPromocodes.map((promo) => (
                  <div className="admin-product-row" key={promo.id}>
                    <div>
                      <strong>{promo.code}</strong>
                      <span>{promo.amount} ₽ · лимит {promo.maxUses} · {promo.isActive ? "активен" : "выключен"}</span>
                    </div>
                    <button onClick={() => toggleAdminPromocode(promo)}>
                      {promo.isActive ? "Выключить" : "Включить"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {adminTab === "logs" && (
          <div className="admin-card">
            <h3>История действий</h3>
            <div className="profile-table-wrap">
              <table className="profile-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Админ</th>
                    <th>Действие</th>
                    <th>Цель</th>
                    <th>Детали</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLogs.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.adminSteamId}</td>
                      <td>{item.action}</td>
                      <td>{item.target}</td>
                      <td>{item.details}</td>
                      <td>{item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    )}
  </main>
)}
      {page === "profile" && (
  <main className="profile-page">
    <section className="profile-shell">
      <div className="profile-main">
        <div className="profile-hero-card">
          <div className="profile-user-row">
            <img
              src={user.photos?.[2]?.value || user.photos?.[0]?.value}
              alt="avatar"
              className="profile-avatar"
            />

            <div className="profile-user-copy">
              <span>Steam профиль</span>
              <h2>{user.displayName}</h2>
              <p>{user.id}</p>
            </div>

            <button
              className="profile-primary-action"
              onClick={() => setPage("deposit")}
            >
              Пополнить баланс
            </button>
          </div>

          <div className="profile-stats-grid">
            {profileStats.map((item) => (
              <div className="profile-stat-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-content-card">
          {profileTab === "info" && (
            <>
              <h3>Информация</h3>
              <div className="profile-info-table">
                <div>
                  <span>Пользователь</span>
                  <strong>{user.displayName}</strong>
                </div>
                <div>
                  <span>SteamID</span>
                  <strong>{user.id}</strong>
                </div>
                <div>
                  <span>Баланс</span>
                  <strong>{balance} ₽</strong>
                </div>
                <div>
                  <span>Статус аккаунта</span>
                  <strong>Steam подключен</strong>
                </div>
              </div>
            </>
          )}

          {profileTab === "purchases" && (
            <>
              <h3>Мои покупки</h3>
              {purchaseHistory.length === 0 ? (
                <div className="profile-empty-state">
                  Покупок пока нет. После оплаты корзины товары появятся здесь.
                </div>
              ) : (
                <div className="profile-table-wrap">
                  <table className="profile-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Товар</th>
                        <th>Цена</th>
                        <th>Количество</th>
                        <th>Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseHistory.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1}</td>
                          <td>{item.name}</td>
                          <td>{item.priceValue} ₽</td>
                          <td>{item.quantity} ед.</td>
                          <td>{item.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {profileTab === "payments" && (
            <>
              <h3>Платежи</h3>
              {paymentHistory.length === 0 ? (
                <div className="profile-empty-state">
                  Операций пока нет. Пополнения, переводы и ручные начисления появятся здесь.
                </div>
              ) : (
                <div className="profile-table-wrap">
                  <table className="profile-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Операция</th>
                        <th>Сумма</th>
                        <th>Статус</th>
                        <th>Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1}</td>
                          <td>{item.note}</td>
                          <td>{item.amount > 0 ? `+${item.amount}` : item.amount} ₽</td>
                          <td>{item.status}</td>
                          <td>{item.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                className="profile-inline-button"
                onClick={() => setPage("deposit")}
              >
                Перейти к пополнению
              </button>
            </>
          )}

          {profileTab === "promocodes" && (
            <>
              <h3>Активация промокода</h3>
              <div className="profile-form-row">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Введите промокод"
                />
                <button
                  onClick={handlePromoRedeem}
                >
                  Применить
                </button>
              </div>
              <div className="profile-promo-hint">
                Доступные тестовые промокоды: RedMoonStart, RedMoonSummer, BAK10. Каждый можно активировать один раз на аккаунт.
              </div>
            </>
          )}

          {profileTab === "transfer" && (
            <>
              <h3>Перевод средств</h3>
              <div className="profile-form-grid">
                <input
                  value={transferSteamId}
                  onChange={(e) => setTransferSteamId(e.target.value)}
                  placeholder="SteamID получателя"
                />
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="Сумма"
                />
                <button
                  onClick={handleTransferSubmit}
                  disabled={isTransferSubmitting}
                >
                  {isTransferSubmitting ? "Отправляем..." : "Отправить"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <aside className="profile-sidebar">
        <button
          className="profile-sidebar-title"
          onClick={() => setProfileTab("info")}
        >
          Личный кабинет
        </button>

        {profileMenu.map((item) => (
          <button
            key={item.id}
            className={profileTab === item.id ? "profile-tab active" : "profile-tab"}
            onClick={() => setProfileTab(item.id)}
          >
            {item.label}
          </button>
        ))}

        <button
          className="profile-logout"
          onClick={() => {
            localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
            localStorage.removeItem(STEAM_ID_STORAGE_KEY)
            window.location.href = "https://dayz-shop.onrender.com/auth/logout"
          }}
        >
          Выйти
        </button>
      </aside>
    </section>
  </main>
)}
{page === "shop" && (
  <main
    style={{
      textAlign: "center",
      padding: "120px 40px 80px"
    }}
  >

  <div
  style={{
    width: "100%",
    maxWidth: "1600px",
    margin: "0 auto",
    height: "520px",
    overflow: "hidden",
    borderRadius: "24px",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 0 35px rgba(0,0,0,0.45)",
    marginBottom: "25px"
  }}
>
  <img
    src={bannerImg}
    alt="REDMOON banner"
    style={{
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center 24%",
      transition: "transform 0.4s ease"
    }}
    onMouseMove={(e) => {
  const rect = e.currentTarget.getBoundingClientRect()

  const x = ((e.clientX - rect.left) / rect.width) * 100
  const y = ((e.clientY - rect.top) / rect.height) * 100

  e.currentTarget.style.transformOrigin = `${x}% ${y}%`
  e.currentTarget.style.transform = "scale(1.08)"
}}

onMouseLeave={(e) => {
  e.currentTarget.style.transformOrigin = "center center"
  e.currentTarget.style.transform = "scale(1)"
}}
  />
</div>
<div
  style={{
    display: "flex",
    justifyContent: "center",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "70px"
  }}
>
  <input
  type="text"
  placeholder="Поиск товара..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  style={{
    width: "100%",
    maxWidth: "520px",
    padding: "16px 20px",
    marginBottom: "25px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(15,15,15,0.75)",
    color: "white",
    fontSize: "16px",
    outline: "none",
    boxShadow: "0 0 25px rgba(255,59,79,0.12)"
  }}
/>
<div
  style={{
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    justifyContent: "center"
  }}
>
<div
  style={{
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: "16px",
    marginTop: "25px"
  }}
  ></div>
{shopCategories.map((category) => (
  <button
    key={category}
    onClick={() => setActiveCategory(category)}
    style={{
      padding: "12px 18px",
      borderRadius: "12px",
      border: activeCategory === category
        ? "1px solid #ff3b4f"
        : "1px solid rgba(255,255,255,0.15)",
      background: activeCategory === category
        ? "rgba(255,59,79,0.18)"
        : "rgba(20,20,20,0.65)",
      color: "white",
      cursor: "pointer",
      fontWeight: "bold"
    }}
  >
    {category}
  </button>
))}
</div>
</div>
        <div style={{
  marginTop: "100px",
  display: "flex",
  justifyContent: "center",
  gap: "30px",
  flexWrap: "wrap"
}}>

  {filteredProducts.map((product) => (
    <div
  key={product.name}
  className="product-card"
    >
      {product.image && (
  <img
  className="product-image"
  src={product.image}
    alt={product.name}
    role="button"
    tabIndex={0}
    onClick={() => openProductFromCard(product)}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        openProductFromCard(product)
      }
    }}
    style={{
  width: "1400px",
maxWidth: "95%",
display: "block",
margin: "0 auto",
}}
  />
)}
      <h3 style={{
  fontSize: "18px",
  fontWeight: "600",
  lineHeight: "1.15",
  marginBottom: "12px",
  letterSpacing: "-0.5px"
}}>
  {product.name}
</h3>

      <p style={{color: "#999"}}>
        {product.description}
      </p>

      <div className="price-tag">
  {product.discountPercent ? (
    <span className="old-price-tag">{product.oldPriceValue}₽</span>
  ) : null}
  {product.price}
</div>

      <button
  className="buy-button"
  onClick={() => {
    openProductFromCard(product)
  }}
  style={{
    width: "100%",
    padding: "12px",
    backgroundColor: "#e63946",
    border: "none",
    color: "white",
    borderRadius: "8px",
    cursor: "pointer"
  }}
>
  {product.type === "roulette" ? `Открыть за ${product.price}` : "Купить"}
</button>
    </div>
  ))}

</div>
      </main>
      )}
      {page === "roulette" && (
  <main className="roulette-page">
    <button
      className="roulette-back-button"
      onClick={() => setPage("shop")}
    >
      Назад в магазин
    </button>

    <section className="roulette-hero">
      <div className="roulette-moon" />
      <h2>РУЛЕТКА</h2>
      <p>Испытай удачу и получи крутые призы!</p>
    </section>

    <section className="roulette-panel">
      <div
        className={rouletteSettled ? "roulette-window settled" : "roulette-window"}
        ref={rouletteViewportRef}
      >
        <div className="roulette-pointer roulette-pointer-top" />
        <div className="roulette-pointer roulette-pointer-bottom" />
        <div className="roulette-center-lines" />
        {rouletteItems.length === 0 && (
          <div className="roulette-empty">
            В рулетке пока нет активных призов
          </div>
        )}
        <div
          className="roulette-track"
          style={{
            transform: `translate3d(-${rouletteOffset}px, 0, 0)`,
            transition: isRouletteSpinning
              ? "transform 5.2s cubic-bezier(0.12, 0.72, 0.08, 1)"
              : "none"
          }}
        >
          {rouletteItems.map((product, index) => (
            <div
              className={
                rouletteSettled && index === ROULETTE_LANDING_INDEX
                  ? "roulette-item landed"
                  : "roulette-item"
              }
              key={`${product.name}-${index}`}
            >
              <div className="roulette-item-image">
                <img src={product.image} alt={product.name} />
              </div>
              <h3>{product.name}</h3>
              <div className="roulette-price">{product.price}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="roulette-controls-row">
        <div className="roulette-cost-card">
          <span>СТОИМОСТЬ КРУТКИ</span>
          <strong>{ROULETTE_PRICE} ₽</strong>
          <button
            className="roulette-spin-button"
            onClick={spinRoulette}
            disabled={isRouletteSpinning || isRouletteOpening || !hasRoulettePrizes}
          >
            {isRouletteOpening
              ? "ОТКРЫВАЕМ..."
              : isRouletteSpinning
                ? "КРУТИТСЯ..."
                : !hasRoulettePrizes
                  ? "НЕТ ПРИЗОВ"
                  : !user?.id
                  ? "ВОЙТИ ЧЕРЕЗ STEAM"
                  : hasRouletteFunds
                    ? `КРУТИТЬ ЗА ${ROULETTE_PRICE} ₽`
                    : "ПОПОЛНИТЬ БАЛАНС"}
          </button>
          <em>
            {hasRouletteFunds
              ? `У вас: ${balance} ₽`
              : `У вас: ${balance} ₽. Нужно ${ROULETTE_PRICE} ₽`}
          </em>
        </div>

      </div>

      {roulettePrize && (
        <div className="roulette-result">
          <div className="roulette-result-copy">
            <span>Выпало</span>
            <strong>{roulettePrize.name}</strong>
            <em>{roulettePrize.price}</em>
          </div>
          <div className="roulette-prize-note">
            Приз уже записан в покупки. Доплачивать за него не нужно.
          </div>
        </div>
      )}

      <div className="roulette-history">
        <h3>ПОСЛЕДНИЕ ВЫПАДЕНИЯ</h3>
        {rouletteDrops.length === 0 ? (
          <div className="roulette-history-empty">
            Пока нет реальных выпадений. Первый прокрут начнет историю.
          </div>
        ) : (
          <div className="roulette-history-list">
            {rouletteDrops.map((drop) => (
              <div className="roulette-history-item" key={drop.id}>
                <img src={getRouletteDropImage(drop)} alt={drop.productName} />
                <div>
                  <strong>{drop.username || "Игрок REDMOON"}</strong>
                  <span>{drop.productName}</span>
                  <em>{formatRouletteDropTime(drop.createdAt)}</em>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  </main>
)}
      {page === "deposit" && (
  <main className="deposit-page">
    <section className="deposit-shell">
      <div className="deposit-main-card">
        <div className="deposit-heading">
          <span>REDMOON BALANCE</span>
          <h2>Пополнение баланса</h2>
          <p>Выберите готовую сумму или введите свою. Средства зачисляются на Steam аккаунт после оплаты.</p>
        </div>

        <div className="deposit-options">
          {depositOptions.map((item) => (
            <button
              key={item.amount}
              className={Number(depositAmount) === item.amount ? "deposit-option active" : "deposit-option"}
              onClick={() => {
                setDepositAmount(item.amount)
                setDepositBonus(item.bonus)
              }}
            >
              <strong>{item.amount} ₽</strong>
              <span>{item.bonus > 0 ? `+${item.bonus} бонус` : "Без бонуса"}</span>
            </button>
          ))}
        </div>

        <label className="deposit-custom-field">
          <span>Своя сумма</span>
          <input
            type="number"
            min="1"
            placeholder="Например, 750"
            value={depositAmount}
            onChange={(e) => {
              setDepositAmount(e.target.value)
              setDepositBonus(0)
            }}
          />
        </label>

        <div className="deposit-actions">
          <button
            className="deposit-pay-button"
            onClick={handleDepositPayment}
          >
            Перейти к оплате
          </button>

          <button
            className="deposit-back-button"
            onClick={() => setPage("profile")}
          >
            Назад в кабинет
          </button>
        </div>
      </div>

      <aside className="deposit-summary-card">
        <span>К зачислению</span>
        <strong>{depositTotal} ₽</strong>
        <div className="deposit-summary-line">
          <p>Сумма</p>
          <b>{depositValue} ₽</b>
        </div>
        <div className="deposit-summary-line">
          <p>Бонус</p>
          <b>{depositBonus} ₽</b>
        </div>
        <div className="deposit-user-card">
          <img src={user?.photos?.[2]?.value || user?.photos?.[0]?.value} alt="avatar" />
          <div>
            <p>{user?.displayName || "Steam пользователь"}</p>
            <span>{balance} ₽ на балансе</span>
          </div>
        </div>
      </aside>
    </section>
  </main>
)}
{selectedProduct && (
  <div style={{
    position: "fixed",
    animation: "overlayFade 0.22s ease",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.75)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    overscrollBehavior: "contain",
  }}>
    <div style={{
      maxHeight: "90vh",
      animation: "modalAppear 0.22s ease",
overflowY: "auto",
  width: "620px",
  maxWidth: "92vw",
  background: "rgba(18,18,18,0.96)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "26px",
  padding: "28px",
  boxShadow: "0 0 55px rgba(255,59,79,0.28)",
  color: "white",
  textAlign: "center"
}}>
      <h2
  style={{
    fontSize: "42px",
    marginBottom: "8px"
  }}
>
  {selectedProduct.name}
</h2>
      {selectedProduct.image && (
  <img
    src={selectedProduct.image}
    alt={selectedProduct.name}
    style={{
      width: "100%",
      height: "300px",
      objectFit: "contain",
      borderRadius: "20px",
      background: "rgba(255,255,255,0.04)",
      margin: "18px 0"
    }}
  />
)}
      <p style={{color: "#999"}}>{selectedProduct.description}</p>
      {selectedProduct.features && (
  <div
    style={{
      marginTop: "18px",
      textAlign: "left",
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    }}
  >
    {selectedProduct.features.map((feature, index) => (
      <div
        key={index}
        style={{
          color: "#d6d6d6",
          fontSize: "15px",
          background: "rgba(255,255,255,0.05)",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.06)"
        }}
      >
        ✓ {feature}
      </div>
    ))}
  </div>
)}
      <h1
  style={{
    fontSize: "52px",
    color: "#ff3b4f",
    marginBottom: "22px"
  }}
>
  {selectedProduct.price}
</h1>

      <button
        onClick={() => handleProductPurchase(selectedProduct)}
        disabled={isPurchasing}
        style={{
        width: "100%",
        padding: "12px",
        backgroundColor: "#e63946",
        border: "none",
        color: "white",
        borderRadius: "8px",
        cursor: "pointer",
        marginBottom: "10px"
      }}
      >
        {isPurchasing ? "Покупка..." : "Перейти к оплате"}
      </button>

      <button
        onClick={() => setSelectedProduct(null)}
       style={{
  width: "100%",
  padding: "14px",
  background: "linear-gradient(135deg, #ff3b4f, #b11226)",
  border: "none",
  color: "white",
  borderRadius: "10px",
  cursor: "pointer",
  fontWeight: "bold",
  marginTop: "15px",
  boxShadow: "0 0 20px rgba(255,59,79,0.25)"
}}
      >
        Закрыть
      </button>
    </div>
  </div>
)}
    </div>

{cartOpen && (
  <div style={{
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999
  }}>
    <div style={{
      width: "520px",
      maxHeight: "80vh",
      overflowY: "auto",
      background: "rgba(18,18,18,0.96)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "22px",
      padding: "28px",
      boxShadow: "0 0 45px rgba(255,59,79,0.25)"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px"
      }}>
        <h2 style={{
  fontSize: "32px",
  color: "white",
  textShadow: "0 0 18px rgba(255,59,79,0.45)",
  fontWeight: "bold"
}}>
  Корзина
</h2>

        <button
          onClick={() => setCartOpen(false)}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "none",
            color: "white",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: "18px"
          }}
        >
          ✕
        </button>
      </div>

      {cart.length === 0 ? (
        <div style={{
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "20px",
  padding: "50px 0"
}}>

  <p style={{
    color: "#999",
    fontSize: "20px",
    fontWeight: "bold"
  }}>
    Корзина пуста
  </p>

  <button
    onClick={() => {
      setCartOpen(false)
      setPage("shop")
    }}
    style={{
      padding: "14px 28px",
      borderRadius: "14px",
      border: "1px solid rgba(255,59,79,0.35)",
      background: "linear-gradient(135deg, #ff3b4f, #b11226)",
      color: "white",
      fontWeight: "bold",
      fontSize: "16px",
      cursor: "pointer",
      boxShadow: "0 0 20px rgba(255,59,79,0.25)",
      transition: "0.25s"
    }}

    onMouseEnter={(e) => {
      e.currentTarget.style.transform = "scale(1.05)"
    }}

    onMouseLeave={(e) => {
      e.currentTarget.style.transform = "scale(1)"
    }}
  >
    Вернуться в магазин
  </button>

</div>
      ) : (
        <>
          {cart.map((item, index) => (
            <div key={index} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "15px",
              background: "rgba(255,255,255,0.04)",
              padding: "14px",
              borderRadius: "14px",
              marginBottom: "12px"
            }}>
              <div style={{
  display: "flex",
  flexDirection: "column",
  gap: "6px"
}}>
  <h3 style={{
    fontSize: "20px",
    color: "white",
    fontWeight: "bold",
    textShadow: "0 0 12px rgba(255,59,79,0.25)"
  }}>
    {item.name}
  </h3>
  <div style={{
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "8px",
  marginTop: "10px"
}}>

  <span style={{
    color: "#999",
    fontSize: "13px",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "1px"
  }}>
    Кол-во
  </span>

  <div style={{
    display: "flex",
    alignItems: "center",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,59,79,0.35)",
    borderRadius: "12px",
    overflow: "hidden"
  }}>

    <button
      onClick={() => {
        if ((item.quantity || 1) > 1) {
          setCart(
            cart.map((cartItem) =>
              cartItem.name === item.name
                ? {
                    ...cartItem,
                    quantity: (cartItem.quantity || 1) - 1
                  }
                : cartItem
            )
          )
        }
      }}
      style={{
        width: "48px",
        height: "48px",
        border: "none",
        background: "transparent",
        color: "white",
        fontSize: "28px",
        cursor: "pointer"
      }}
    >
      -
    </button>

    <div style={{
      width: "70px",
      textAlign: "center",
      color: "white",
      fontWeight: "bold",
      fontSize: "22px",
      borderLeft: "1px solid rgba(255,59,79,0.25)",
      borderRight: "1px solid rgba(255,59,79,0.25)",
      height: "48px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      {item.quantity || 1}
    </div>

    <button
      onClick={() => {
        setCart(
          cart.map((cartItem) =>
            cartItem.name === item.name
              ? {
                  ...cartItem,
                  quantity: (cartItem.quantity || 1) + 1
                }
              : cartItem
          )
        )
      }}
      style={{
        width: "48px",
        height: "48px",
        border: "none",
        background: "transparent",
        color: "white",
        fontSize: "28px",
        cursor: "pointer"
      }}
    >
      +
    </button>

  </div>
</div>

  <div style={{
    display: "inline-block",
    background: "rgba(255,59,79,0.12)",
    border: "1px solid rgba(255,59,79,0.35)",
    padding: "6px 12px",
    borderRadius: "999px",
    color: "#ff5a6b",
    fontWeight: "bold",
    fontSize: "15px",
    width: "fit-content"
  }}>
    {item.price}
  </div>
</div>

              <button
                onClick={() => setCart(cart.filter((_, i) => i !== index))}
                style={{
                  background: "rgba(255,59,79,0.18)",
                  border: "1px solid rgba(255,59,79,0.4)",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                Удалить
              </button>
            </div>
          ))}

          <button
onClick={handleCartCheckout}
disabled={isPurchasing}
           style={{
            width: "100%",
            padding: "15px",
            marginTop: "18px",
            border: "none",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #ff3b4f, #b11226)",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "16px"
          }}>
            {isPurchasing ? "Оплата..." : "Оплатить"}
            <div style={{
  marginTop: "18px",
  marginBottom: "14px",
  padding: "14px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.05)",
  display: "flex",
  justifyContent: "space-between",
  fontWeight: "bold"
}}>
  <span>Итого:</span>
  <span>{cartTotal} ₽</span>
</div>
          </button>
        </>
      )}
    </div>
  </div>
)}
{message && (
  <div className={`toast-notification ${message.type === "success" ? "success" : "error"}`}>
    <div className="toast-glow" />
    <div className="toast-icon">
      {message.type === "success" ? "✓" : "!"}
    </div>
    <div className="toast-copy">
      <span>{message.type === "success" ? "Успешно" : "Внимание"}</span>
      <strong>{message.text}</strong>
    </div>
    <div className="toast-progress" />
  </div>
)}
</>
)
}

export default App
