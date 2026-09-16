'use strict';

// ─── Load .env FIRST before anything else ────────────────────────────────────
require('dotenv').config();

const express  = require('express');
const compression = require('compression');
const multer   = require('multer');
const sharp    = require('sharp');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { spawn, execSync } = require('child_process');
const session  = require('express-session');
const crypto   = require('crypto');
const { SquareClient: Client, SquareEnvironment: Environment } = require('square');

const app = express();

// ─── Config from .env ─────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT || '3000', 10);
const ADMIN_USER     = process.env.ADMIN_USER     || 'admin';
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'changeme123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const STORE_NAME     = process.env.STORE_NAME     || 'My Store';
const STORE_TAGLINE  = process.env.STORE_TAGLINE  || 'Curated Collection';
const STORE_DESC     = process.env.STORE_DESCRIPTION || 'Handpicked items, fair prices.';
const STORE_FOOTER   = process.env.STORE_FOOTER   || '© 2025 My Store — All rights reserved';
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN || '';
const SQUARE_LOCATION_ID  = process.env.SQUARE_LOCATION_ID  || '';
const SQUARE_APP_ID       = process.env.SQUARE_APP_ID       || '';
const SQUARE_WEBHOOK_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const DISCORD_NOTIFY_USER_ID = process.env.DISCORD_NOTIFY_USER_ID || '';
const SQUARE_ENVIRONMENT  = process.env.SQUARE_ENVIRONMENT  === 'Production' ? Environment.Production : Environment.Sandbox;
const SQUARE_API_VERSION  = process.env.SQUARE_API_VERSION  || '2024-12-15';
const SQUARE_API_BASE     = 'https://connect.squareup.com';
const TRUST_PROXY    = process.env.TRUST_PROXY === 'true';
const MAX_PORT_RETRIES = Math.max(0, parseInt(process.env.PORT_RETRY_COUNT || '20', 10));
const STRICT_SINGLE_INSTANCE = process.env.STRICT_SINGLE_INSTANCE === 'true';
const SINGLE_INSTANCE_MODE = String(process.env.SINGLE_INSTANCE_MODE || 'replace').trim().toLowerCase();
const INSTANCE_LOCK_FILENAME = String(process.env.INSTANCE_LOCK_FILENAME || 'server-instance.lock').trim() || 'server-instance.lock';
const API_CACHE_MAX_AGE = Math.max(0, parseInt(process.env.API_CACHE_MAX_AGE || '20', 10));
const API_CACHE_STALE_SECONDS = Math.max(0, parseInt(process.env.API_CACHE_STALE_SECONDS || '120', 10));
const SERVER_KEEP_ALIVE_TIMEOUT_MS = Math.max(1000, parseInt(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS || '65000', 10));
const SERVER_HEADERS_TIMEOUT_MS = Math.max(SERVER_KEEP_ALIVE_TIMEOUT_MS + 1000, parseInt(process.env.SERVER_HEADERS_TIMEOUT_MS || '70000', 10));
const SERVER_REQUEST_TIMEOUT_MS = Math.max(0, parseInt(process.env.SERVER_REQUEST_TIMEOUT_MS || '120000', 10));

// ─── Payment Configuration ────────────────────────────────────────────────────
const ENABLE_CARD_PAYMENTS  = process.env.ENABLE_CARD_PAYMENTS !== 'false';
const ENABLE_APPLE_PAY      = process.env.ENABLE_APPLE_PAY !== 'false';
const ENABLE_GOOGLE_PAY     = process.env.ENABLE_GOOGLE_PAY !== 'false';

// ─── Notification Configuration ───────────────────────────────────────────────
const SEND_ORDER_SMS     = process.env.SEND_ORDER_SMS === 'true';
const SUCCESS_MESSAGE_TITLE = process.env.SUCCESS_MESSAGE_TITLE || 'Order Placed!';
const SUCCESS_MESSAGE_BODY  = process.env.SUCCESS_MESSAGE_BODY || 'Thank you for your purchase!';
const SUCCESS_SHOW_ORDER_ID = process.env.SUCCESS_SHOW_ORDER_ID !== 'false';

// Initialize Square client
const squareClient = new Client({
  token: SQUARE_ACCESS_TOKEN,
  environment: SQUARE_ENVIRONMENT,
});

function verifySquareWebhookSignature(req) {
  const signatureHeader = req.headers['x-square-signature'] || req.headers['x-square-hmacsha256-signature'];
  if (!SQUARE_WEBHOOK_SIGNATURE_KEY || !signatureHeader) {
    console.warn('⚠️ Square webhook verification skipped because signature key or header is missing');
    return false;
  }

  const payload = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
  const sha256 = crypto.createHmac('sha256', SQUARE_WEBHOOK_SIGNATURE_KEY).update(payload).digest('base64');
  const sha1   = crypto.createHmac('sha1',   SQUARE_WEBHOOK_SIGNATURE_KEY).update(payload).digest('base64');

  return signatureHeader === sha256 || signatureHeader === sha1;
}

async function sendDiscordNotification({
  orderId,
  paymentId,
  productId,
  productName,
  isDebugOrder,
  listingType,
  quantity,
  unitAmount,
  totalAmount,
  selectedColor,
  selectedSecondaryColor,
  selectedVariant,
  selectedPrimaryFilament,
  selectedSecondaryFilament,
  customerName,
  customerPhone,
  customerAddress,
  customerCity,
  customerState,
  customerZip
}) {
  if (!DISCORD_WEBHOOK_URL) return;

  const addressLines = [customerAddress, `${customerCity}, ${customerState} ${customerZip}`].filter(Boolean).join('\n');
  const primaryColorDisplay = String(selectedColor || '').trim();
  const secondaryColorDisplay = String(selectedSecondaryColor || '').trim();
  const variantDisplay = String(selectedVariant || '').trim();
  const colorDisplay = [primaryColorDisplay, secondaryColorDisplay].filter(Boolean).join(' / ') || 'N/A';
  const filamentDisplay = selectedPrimaryFilament
    ? `${selectedPrimaryFilament}${selectedSecondaryFilament ? ` / ${selectedSecondaryFilament}` : ''}`
    : 'N/A';
  const listingDisplay = normalizeListingType(listingType);
  const unitPriceDisplay = Number.isFinite(unitAmount) ? `$${(unitAmount / 100).toFixed(2)}` : 'N/A';
  const totalPriceDisplay = Number.isFinite(totalAmount) ? `$${(totalAmount / 100).toFixed(2)}` : 'N/A';
  const qtyDisplay = String(quantity || 1);
  const mentionContent = DISCORD_NOTIFY_USER_ID ? `<@${DISCORD_NOTIFY_USER_ID}>` : 'New order alert';
  const orderSummary = [
    `Item: ${productName || 'Unknown'}`,
    `Type: ${listingDisplay || 'pod'}`,
    `Qty: ${qtyDisplay}`,
    `Unit: ${unitPriceDisplay}`,
    `Total: ${totalPriceDisplay}`
  ].join('\n');
  const customizationSummary = [
    `Variant: ${variantDisplay || 'N/A'}`,
    `Color: ${colorDisplay}`,
    `Filament: ${filamentDisplay}`
  ].join('\n');
  const customerSummary = [
    `Name: ${customerName || 'N/A'}`,
    `Phone: ${customerPhone || 'N/A'}`
  ].join('\n');
  const referenceSummary = [
    `Product ID: ${productId || 'N/A'}`,
    `Order ID: ${orderId || 'N/A'}`,
    `Payment ID: ${paymentId || 'N/A'}`
  ].join('\n');

  const payload = {
    content: mentionContent,
    allowed_mentions: { parse: ['users'] },
    embeds: [
      {
        title: isDebugOrder ? 'Debug Order Received' : 'Order Received',
        description: isDebugOrder ? 'A debug fake checkout was completed (no charge).' : 'A new checkout was completed.',
        color: isDebugOrder ? 15844367 : 3066993,
        fields: [
          { name: 'Mode', value: isDebugOrder ? 'DEBUG (Fake Purchase)' : 'LIVE', inline: false },
          { name: 'Order Summary', value: orderSummary, inline: false },
          { name: 'Customization', value: customizationSummary, inline: false },
          { name: 'Customer', value: customerSummary, inline: false },
          { name: 'Address', value: addressLines || 'N/A', inline: false },
          { name: 'References', value: referenceSummary, inline: false }
        ],
        footer: { text: 'No card data is included in this notification' },
        timestamp: new Date().toISOString()
      }
    ]
  };

  try {
    const resp = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      console.warn('Discord webhook failed:', resp.status, await resp.text().catch(() => '')); 
    }
  } catch (e) {
    console.warn('Discord webhook error:', e);
  }
}

// Trust proxy for Tailscale Funnel (gets real client IPs, correct https detection)
if (TRUST_PROXY) app.set('trust proxy', 1);

if (ADMIN_PASS === 'changeme123') {
  console.warn('⚠️ ADMIN_PASS is still using the default value; set a strong password in .env');
}
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️ SESSION_SECRET is not set; add one in .env so sessions survive restarts');
}

function normalizeClientIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return null;
  const ip = rawIp.split(',')[0].trim();
  if (!ip || ip === 'unknown') return null;
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

app.use((req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const sourceIp = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || req.ip;
  req.clientIp = normalizeClientIp(sourceIp || req.ip);
  next();
});

// ─── File paths ───────────────────────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const PRIVATE_DATA_DIR = process.env.PRIVATE_DATA_DIR || path.join(os.tmpdir(), 'store-v2-private');
const UPLOAD_DIR    = path.join(__dirname, 'uploads');
const IMAGE_CACHE_DIR = path.join(UPLOAD_DIR, 'cache');
const TMP_UPLOAD_DIR = path.join(PRIVATE_DATA_DIR, 'tmp-uploads');
const INSTANCE_LOCK_FILE = path.join(PRIVATE_DATA_DIR, path.basename(INSTANCE_LOCK_FILENAME));
const resizeInFlight = new Map();
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const COLORS_FILE   = path.join(DATA_DIR, 'colors.json');
const FILAMENTS_FILE = path.join(DATA_DIR, 'filaments.json');
const ANALYTICS_FILE = path.join(PRIVATE_DATA_DIR, 'analytics.json');
const SETTINGS_FILE  = path.join(DATA_DIR, 'settings.json');
const CONTACT_FILE   = path.join(PRIVATE_DATA_DIR, 'contact.json');
const MATERIALS_FILE = path.join(DATA_DIR, 'materials.json');
const LOGS_FILE       = path.join(PRIVATE_DATA_DIR, 'logs.json');

[DATA_DIR, PRIVATE_DATA_DIR, UPLOAD_DIR, IMAGE_CACHE_DIR, TMP_UPLOAD_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readInstanceLock() {
  try {
    if (!fs.existsSync(INSTANCE_LOCK_FILE)) return null;
    const raw = fs.readFileSync(INSTANCE_LOCK_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeInstanceLock(port) {
  const payload = {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(INSTANCE_LOCK_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn('⚠️ Failed to write instance lock file:', err && err.message ? err.message : err);
  }
}

function clearInstanceLock() {
  try {
    const lock = readInstanceLock();
    if (!lock || lock.pid === process.pid) {
      fs.rmSync(INSTANCE_LOCK_FILE, { force: true });
    }
  } catch {
    // Best-effort cleanup only.
  }
}

function enforceSingleInstance() {
  if (!STRICT_SINGLE_INSTANCE) return;

  if (SINGLE_INSTANCE_MODE !== 'replace' && SINGLE_INSTANCE_MODE !== 'reuse') {
    console.error(`❌ Invalid SINGLE_INSTANCE_MODE="${SINGLE_INSTANCE_MODE}". Use "replace" or "reuse".`);
    process.exit(1);
    return;
  }

  const lock = readInstanceLock();
  if (lock && Number.isInteger(lock.pid) && lock.pid !== process.pid) {
    if (!isProcessAlive(lock.pid)) {
      clearInstanceLock();
    } else if (SINGLE_INSTANCE_MODE === 'reuse') {
      console.log(`ℹ️ Store server already running (pid ${lock.pid}) on port ${lock.port || 'unknown'}. Reusing existing instance.`);
      process.exit(0);
      return;
    } else {
      try {
        process.kill(lock.pid, 'SIGTERM');
        console.warn(`⚠️ Stopped existing store process pid ${lock.pid} to start a fresh instance.`);
      } catch (err) {
        console.warn(`⚠️ Could not stop existing store process pid ${lock.pid}:`, err && err.message ? err.message : err);
      }
    }
  }

  const pidsOnPort = findPidsListeningOnPort(PORT).filter(pid => pid !== process.pid);
  if (!pidsOnPort.length) return;

  if (SINGLE_INSTANCE_MODE === 'reuse') {
    console.log(`ℹ️ Port ${PORT} is already in use by pid(s) ${pidsOnPort.join(', ')}. Reusing existing instance.`);
    process.exit(0);
    return;
  }

  if (SINGLE_INSTANCE_MODE === 'replace') {
    pidsOnPort.forEach(pid => {
      try {
        process.kill(pid, 'SIGTERM');
        console.warn(`⚠️ Stopped existing process pid ${pid} listening on port ${PORT}.`);
      } catch (err) {
        console.warn(`⚠️ Could not stop pid ${pid} on port ${PORT}:`, err && err.message ? err.message : err);
      }
    });
    return;
  }
}

function findPidsListeningOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync('netstat -ano -p TCP', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const portPattern = new RegExp(`^\\s*TCP\\s+[^\\s]+:${port}\\s+[^\\s]+\\s+LISTENING\\s+(\\d+)`, 'im');
      const match = output.match(portPattern);
      return match ? [parseInt(match[1], 10)] : [];
    }

    const out = execSync(`ss -ltnp 'sport = :${port}' 2>/dev/null || true`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const matches = out.match(/pid=(\d+)/g) || [];
    const pids = matches
      .map(token => parseInt(token.replace('pid=', ''), 10))
      .filter(pid => Number.isInteger(pid) && pid > 0);
    return Array.from(new Set(pids));
  } catch {
    return [];
  }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function parseJSONValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function setPublicApiCache(res) {
  res.setHeader('Cache-Control', `public, max-age=${API_CACHE_MAX_AGE}, stale-while-revalidate=${API_CACHE_STALE_SECONDS}`);
}

function normalizeListingType(value) {
  if (value === 'etsy') return 'etsy';
  if (value === 'limited' || value === 'inventory') return 'limited';
  return 'pod';
}

function normalizeQuantity(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, parsed);
}

function normalizeEtsyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, '')}`;
}

function normalizeVariants(value) {
  let source = value;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      source = trimmed.split(/\r?\n|,/g);
    }
  }

  const items = Array.isArray(source) ? source : [];
  const out = [];
  const seen = new Set();
  items.forEach(item => {
    const name = String(item || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out;
}

function normalizeProductRecord(product = {}) {
  const listingType = normalizeListingType(product.listingType);
  const price = Number.parseFloat(product.price);
  const quantity = listingType === 'limited' ? normalizeQuantity(product.quantity) : null;
  const images = Array.isArray(product.images) ? product.images.filter(image => typeof image === 'string' && image.trim()) : [];
  const variants = normalizeVariants(product.variants);

  return {
    ...product,
    id: String(product.id || Date.now()),
    name: String(product.name || '').trim(),
    price: Number.isFinite(price) ? price : 0,
    description: String(product.description || ''),
    notes: String(product.notes || ''),
    variants,
    images,
    hasColors: product.hasColors === true || product.hasColors === 'true',
    hasSecondaryColor: product.hasSecondaryColor === true || product.hasSecondaryColor === 'true',
    hasFilaments: product.hasFilaments === true || product.hasFilaments === 'true',
    material: String(product.material || '').trim(),
    filamentType: String(product.filamentType || '').trim(),
    primaryFilament: String(product.primaryFilament || '').trim(),
    secondaryFilament: String(product.secondaryFilament || '').trim(),
    listingType,
    quantity,
    etsyUrl: listingType === 'etsy' ? normalizeEtsyUrl(product.etsyUrl) : ''
  };
}

function loadProducts() {
  const raw = loadJSON(PRODUCTS_FILE, []);
  if (!Array.isArray(raw)) return [];
  const normalized = raw.map(normalizeProductRecord);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) saveProducts(normalized);
  return normalized;
}

function saveProducts(data) {
  saveJSON(PRODUCTS_FILE, Array.isArray(data) ? data.map(normalizeProductRecord) : []);
}

function loadColors() {
  return loadJSON(COLORS_FILE, []);
}

function saveColors(data) {
  saveJSON(COLORS_FILE, data);
}

// Ensure colors are objects: { name: string, defaultFilament: 'PLA' }
function loadColorsMigrated() {
  const raw = loadColors();
  // If array of strings, migrate to objects
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'string') {
    const migrated = raw.map(s => ({ name: String(s || '').trim(), defaultFilament: 'PLA' }));
    saveColors(migrated);
    return migrated;
  }
  // If array of objects, ensure fields exist
  if (Array.isArray(raw)) {
    const fixed = raw.map(c => {
      if (typeof c === 'string') return { name: String(c).trim(), defaultFilament: 'PLA' };
      return { name: String((c && c.name) || '').trim(), defaultFilament: (c && c.defaultFilament) || 'PLA' };
    });
    // If any had missing defaultFilament, save back
    if (JSON.stringify(fixed) !== JSON.stringify(raw)) saveColors(fixed);
    return fixed;
  }
  return [];
}
function loadFilaments() {
  return loadJSON(FILAMENTS_FILE, []);
}

function saveFilaments(data) {
  saveJSON(FILAMENTS_FILE, data);
}

function loadAnalytics() {
  const data = loadJSON(ANALYTICS_FILE, {
    products: {},
    totalViews: 0,
    uniqueVisitors: {},
    visitorLog: [],
    lastReset: new Date().toISOString()
  });
  // Ensure fields exist for migration
  if (!data.uniqueVisitors) data.uniqueVisitors = {};
  if (!data.visitorLog) data.visitorLog = [];
  return data;
}

function saveAnalytics(data) {
  saveJSON(ANALYTICS_FILE, data);
}

function loadSettings() {
  const defaults = {
    storeOpen: true,
    publicMessage: '',
    wallpaperUrl: '',
    frostedOverlay: false,
    enableApplePay: ENABLE_APPLE_PAY,
    enableGooglePay: ENABLE_GOOGLE_PAY,
    debugFakePurchase: false
  };
  return { ...defaults, ...loadJSON(SETTINGS_FILE, {}) };
}

function saveSettings(data) {
  saveJSON(SETTINGS_FILE, data);
}

function loadContact() {
  const defaults = {
    name: 'Miles Hollingsworth',
    role: 'Maker, technologist, and high school senior',
    bio: 'I build, test, and improve practical technology projects across IT, networking, engineering, electronics, robotics, and 3D fabrication. I am graduating from Grant High School in 2027 and building a portfolio of work I am proud of.',
    avatar: '', email: 'odinandmilo@proton.me', phone: '',
    links: [
      { label: 'YouTube', url: 'https://youtube.com/@LocalhostWasTaken' },
      { label: 'GitHub', url: 'https://github.com/LocalhostCMD' }
    ],
    resume: { enabled: false, title: 'Resume', summary: '', url: '' }, youtubeEnabled: false,
    interests: ['IT & Networking', 'Engineering & Making', 'Robotics', '3D Printing & Modeling', 'Electronics & PCB Design', 'Laser Cutting & Fabrication', 'Homelabs & Servers', 'Self-hosting & Web Projects', 'CNC Machining'],
    email: 'odinandmilo@proton.me', phone: '', instagram: '', etsy: '', youtube: '', github: '', custom: ''
  };
  const loaded = loadJSON(CONTACT_FILE, {});
  return {
    ...defaults,
    ...loaded,
    name: String(loaded.name || defaults.name),
    role: String(loaded.role || defaults.role),
    bio: String(loaded.bio || defaults.bio),
    email: String(loaded.email || defaults.email),
    links: (Array.isArray(loaded.links) ? loaded.links : defaults.links).filter(link => String(link && link.label || '').trim().toLowerCase() !== 'website'),
    interests: Array.isArray(loaded.interests) ? loaded.interests : defaults.interests,
    resume: { ...defaults.resume, ...(loaded.resume && typeof loaded.resume === 'object' ? loaded.resume : {}) },
    youtubeEnabled: loaded.youtubeEnabled === true
  };
}

function saveContact(data) {
  saveJSON(CONTACT_FILE, data);
}

function loadMaterials() {
  return loadJSON(MATERIALS_FILE, null);
}

function saveMaterials(data) {
  saveJSON(MATERIALS_FILE, data);
}

function loadLogs() {
  const raw = loadJSON(LOGS_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function saveLogs(data) {
  saveJSON(LOGS_FILE, Array.isArray(data) ? data.slice(0, 500) : []);
}

function serializeError(err) {
  if (!err) return { message: 'Unknown error' };
  if (err instanceof Error) {
    return {
      message: err.message || 'Error',
      stack: err.stack || '',
      name: err.name || 'Error'
    };
  }
  if (typeof err === 'object') return { ...err };
  return { message: String(err) };
}

function appendLogEntry(level, category, message, details = {}) {
  try {
    const logs = loadLogs();
    logs.unshift({
      id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details
    });
    saveLogs(logs.slice(0, 500));
  } catch (err) {
    console.error('Failed to write log entry:', err);
  }
}

function getReferencedUploadNames() {
  const referenced = new Set();

  loadProducts().forEach(product => {
    (Array.isArray(product.images) ? product.images : []).forEach(image => {
      if (typeof image !== 'string') return;
      const cleaned = image.split('?')[0];
      const basename = path.basename(cleaned);
      if (basename) referenced.add(basename);
    });
  });

  const settings = loadSettings();
  if (settings && typeof settings.wallpaperUrl === 'string' && settings.wallpaperUrl.startsWith('/uploads/')) {
    const wallpaperName = path.basename(settings.wallpaperUrl.split('?')[0]);
    if (wallpaperName) referenced.add(wallpaperName);
  }

  return referenced;
}

function deleteCacheVariantsFor(fileName) {
  const baseName = path.parse(fileName).name;
  const cacheFiles = fs.readdirSync(IMAGE_CACHE_DIR).filter(entry => entry.startsWith(`${baseName}-`));
  cacheFiles.forEach(entry => {
    try {
      fs.unlinkSync(path.join(IMAGE_CACHE_DIR, entry));
    } catch (err) {
      console.warn('Failed to delete cached image variant:', entry, err);
    }
  });
}

function normalizeFilamentEntries(entries) {
  const normalized = [];
  const seen = new Set();
  const mapped = {};

  (Array.isArray(entries) ? entries : []).forEach(entry => {
    const parts = String(entry || '').split(':');
    const material = String(parts[0] || '').trim().toUpperCase();
    const color = String(parts.slice(1).join(':') || '').trim();
    if (!material || !color) return;
    const key = `${material}::${color.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(`${material}: ${color}`);
    if (!mapped[material]) mapped[material] = [];
    mapped[material].push(color);
  });

  return { normalized, mapped };
}

// Ensure materials mapping exists; if not, derive from colors' defaultFilament
function ensureMaterialsFile() {
  let mats = loadMaterials();
  if (mats && typeof mats === 'object') return mats;
  const colors = loadColorsMigrated();
  const obj = {};
  colors.forEach(c => {
    const mat = (c.defaultFilament || 'PLA') || 'PLA';
    if (!obj[mat]) obj[mat] = [];
    if (!obj[mat].includes(c.name)) obj[mat].push(c.name);
  });
  saveMaterials(obj);
  return obj;
}

// ─── Image processing (multer + sharp) ───────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(String(file.originalname || '')).toLowerCase().replace(/[^.a-z0-9]/g, '') || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
  }),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 20
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos; some mobile browsers send octet-stream for media files.
    const originalName = String(file.originalname || '');
    const mediaExt = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?|mp4|mov|m4v|webm|ogg|ogv)$/i;
    const looksLikeMediaByExt = mediaExt.test(originalName);
    const isImageOrVideoMime = /^image\//.test(file.mimetype) || /^video\//.test(file.mimetype);
    const isGenericMime = !file.mimetype || file.mimetype === 'application/octet-stream';

    if (isImageOrVideoMime || (isGenericMime && looksLikeMediaByExt)) return cb(null, true);
    cb(new Error('Only image and video files are allowed (jpeg, png, webp, heic, gif, mp4, mov, webm).'));
  }
});

async function cacheResizedImage(imagePath, targetName, width, format = 'webp', quality = 80) {
  const cacheFilename = `${targetName}-${width}-${quality}.${format}`;
  const cachePath = path.join(IMAGE_CACHE_DIR, cacheFilename);
  if (fs.existsSync(cachePath)) return;

  let transformer = sharp(imagePath).resize(width, null, { fit: 'inside', withoutEnlargement: true });
  if (format === 'webp') transformer = transformer.webp({ quality });
  else if (format === 'avif') transformer = transformer.avif({ quality });
  else transformer = transformer.jpeg({ quality });

  const buffer = await transformer.toBuffer();
  fs.writeFileSync(cachePath, buffer);
}

function warmImageCache(imagePath, targetName) {
  Promise.allSettled([
    cacheResizedImage(imagePath, targetName, 240),
    cacheResizedImage(imagePath, targetName, 480),
    cacheResizedImage(imagePath, targetName, 720)
  ]).then(results => {
    results.forEach(result => {
      if (result.status === 'rejected') {
        console.warn('Cache resize generation failed:', result.reason);
      }
    });
  });
}

async function processImage(file) {
  const tempPath = file.path;
  const cleanupTemp = () => {
    if (!tempPath) return;
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (cleanupErr) {
      console.warn('Failed to remove temp upload file:', cleanupErr);
    }
  };

  try {
    // Handle standard images with sharp (convert to webp + cache),
    // but preserve GIFs and videos by saving raw buffers.
    const isStandardImage = /^image\//.test(file.mimetype) && file.mimetype !== 'image/gif';
    if (isStandardImage) {
      const filename = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.webp';
      const filepath = path.join(UPLOAD_DIR, filename);
      await sharp(tempPath)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(filepath);

      const targetName = path.parse(filename).name;
      setImmediate(() => warmImageCache(filepath, targetName));

      return '/uploads/' + filename;
    } else {
      // Preserve original extension for GIFs and videos
      // Some image formats can reach multer but fail conversion in sharp; keep listing flow alive.
      const rawExt = (path.extname(file.originalname || '').replace('.', '').toLowerCase() || '').replace(/[^a-z0-9]/g, '');
      const mimeExt = (file.mimetype.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const ext = rawExt || mimeExt || 'bin';
      const filename = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const filepath = path.join(UPLOAD_DIR, filename);
      fs.copyFileSync(tempPath, filepath);
      return '/uploads/' + filename;
    }
  } catch (err) {
    // Some image formats can reach multer but fail conversion in sharp; keep listing flow alive.
    console.warn('Sharp conversion failed, storing original image:', err && err.message ? err.message : err);
    appendLogEntry('warn', 'images', 'Sharp conversion failed, storing original image', serializeError(err));
    const rawExt = (path.extname(file.originalname || '').replace('.', '').toLowerCase() || '').replace(/[^a-z0-9]/g, '');
    const fallbackExt = rawExt || (file.mimetype.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const fallbackName = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + fallbackExt;
    const fallbackPath = path.join(UPLOAD_DIR, fallbackName);
    fs.copyFileSync(tempPath, fallbackPath);
    return '/uploads/' + fallbackName;
  } finally {
    cleanupTemp();
  }
}

async function processUploadBatch(files) {
  const out = [];
  const list = Array.isArray(files) ? files : [];
  for (const file of list) {
    out.push(await processImage(file));
  }
  return out;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const COMPRESS_SKIP_EXTENSIONS = /\.(?:avif|webp|png|jpe?g|gif|mp4|webm|zip|gz|br)$/i;
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (COMPRESS_SKIP_EXTENSIONS.test(req.path || '')) return false;
    return compression.filter(req, res);
  }
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Dynamic resize endpoint for upload images
app.get('/uploads/:image', async (req, res, next) => {
  const width = parseInt(req.query.w, 10);
  if (!width) return next();

  const quality = Math.min(95, Math.max(40, parseInt(req.query.q, 10) || 80));
  const imageName = path.basename(req.params.image);
  const imagePath = path.join(UPLOAD_DIR, imageName);
  if (!fs.existsSync(imagePath)) return res.status(404).send('Not found');

  const accept = (req.headers.accept || '').toLowerCase();
  const ext = path.extname(imageName).slice(1).toLowerCase();
  // Only resize common raster images. GIFs and videos are returned raw.
  const resizable = ['jpeg', 'jpg', 'png', 'webp', 'avif'].includes(ext);
  if (!resizable) {
    // send raw file for gifs/videos
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.sendFile(imagePath);
  }

  const targetFormat = req.query.f
    ? req.query.f.toLowerCase()
    : accept.includes('image/avif') ? 'avif' : accept.includes('image/webp') ? 'webp' : ext;
  const format = ['jpeg', 'jpg', 'png', 'webp', 'avif'].includes(targetFormat) ? targetFormat : 'webp';

  const cacheFilename = `${path.parse(imageName).name}-${width}-${quality}.${format}`;
  const cachePath = path.join(IMAGE_CACHE_DIR, cacheFilename);
  const contentType = `image/${format === 'jpg' ? 'jpeg' : format}`;

  if (fs.existsSync(cachePath)) {
    return res.sendFile(cachePath, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Vary': 'Accept'
      }
    });
  }

  try {
    const cacheKey = `${imagePath}|${cachePath}|${width}|${quality}|${format}`;
    let inFlight = resizeInFlight.get(cacheKey);

    if (!inFlight) {
      inFlight = (async () => {
        let transformer = sharp(imagePath).resize(width, null, { fit: 'inside', withoutEnlargement: true });
        if (format === 'webp') transformer = transformer.webp({ quality });
        else if (format === 'avif') transformer = transformer.avif({ quality });
        else transformer = transformer.jpeg({ quality });

        const buffer = await transformer.toBuffer();
        await fs.promises.writeFile(cachePath, buffer);
      })();

      resizeInFlight.set(cacheKey, inFlight);
      inFlight.finally(() => resizeInFlight.delete(cacheKey));
    }

    await inFlight;
    return res.sendFile(cachePath, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Vary': 'Accept'
      }
    });
  } catch (err) {
    console.error('Image resize failed:', err);
    appendLogEntry('error', 'images', 'Image resize failed', serializeError(err));
    return next(err);
  }
});

// Cache uploaded images for 1 week (immutable since filenames are content-hashed)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  next();
}, express.static(UPLOAD_DIR));

// Cache static assets for 1 hour
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // Force fresh HTML so inline storefront/admin scripts update immediately after deploys.
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// Apple Pay domain verification
app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => {
  const verificationFile = path.join(__dirname, '.well-known', 'apple-developer-merchantid-domain-association');
  if (fs.existsSync(verificationFile)) {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(verificationFile);
  } else {
    console.warn('⚠️  Apple Pay domain verification file not found');
    res.status(404).send('Not found');
  }
});

app.use(session({
  secret: SESSION_SECRET,
  proxy: TRUST_PROXY,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,  // 24 hours
    secure: 'auto',                // https-only cookies when the connection is secure
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/admin/login');
}

function requireAdminAction(req, res, next) {
  const isAdminFetch = req.get('X-Admin-Request') === '1';
  if (req.session.loggedIn !== true) {
    if (isAdminFetch) {
      return res.status(401).json({ error: 'Admin session expired. Please sign in again.' });
    }
    return res.redirect('/admin/login');
  }
  if (!isAdminFetch) {
    return res.status(403).json({ error: 'Invalid admin request' });
  }
  next();
}

// ─── Email utility ────────────────────────────────────────────────────────────
// ─── Store Config Endpoint ────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  setPublicApiCache(res);
  const settings = loadSettings();
  res.json({
    storeName:      STORE_NAME,
    tagline:        STORE_TAGLINE,
    description:    STORE_DESC,
    footer:         STORE_FOOTER,
    storeOpen:      settings.storeOpen,
    publicMessage:  settings.publicMessage,
    wallpaperUrl:   settings.wallpaperUrl,
    frostedOverlay: settings.frostedOverlay,
    squareAppId:    SQUARE_APP_ID,
    squareLocationId: SQUARE_LOCATION_ID,
    squareEnvironment: SQUARE_ENVIRONMENT === Environment.Production ? 'Production' : 'Sandbox',
    // Payment configuration
    enableCardPayments:  ENABLE_CARD_PAYMENTS,
    enableApplePay:      settings.enableApplePay !== false,
    enableGooglePay:     settings.enableGooglePay !== false,
    debugFakePurchase:   settings.debugFakePurchase === true,
    filamentOptions:     loadFilaments(),
    // Success message configuration
    successTitle:        SUCCESS_MESSAGE_TITLE,
    successBody:         SUCCESS_MESSAGE_BODY,
    successShowOrderId:  SUCCESS_SHOW_ORDER_ID,
  });
});

app.get('/api/settings', requireLogin, (req, res) => {
  res.json(loadSettings());
});

app.put('/api/settings', requireAdminAction, (req, res) => {
  const { storeOpen, publicMessage, wallpaperUrl, frostedOverlay, enableApplePay, enableGooglePay, debugFakePurchase } = req.body;
  const current = loadSettings();
  const normalizeBoolean = value => value === true || value === 'true';
  saveSettings({
    ...current,
    storeOpen: normalizeBoolean(storeOpen),
    publicMessage: String(publicMessage || ''),
    wallpaperUrl: String(wallpaperUrl || ''),
    frostedOverlay: normalizeBoolean(frostedOverlay),
    enableApplePay: normalizeBoolean(enableApplePay),
    enableGooglePay: normalizeBoolean(enableGooglePay),
    debugFakePurchase: normalizeBoolean(debugFakePurchase)
  });
  res.json({ success: true });
});

// ─── Colors API ───────────────────────────────────────────────────────────────
app.get('/api/colors', (req, res) => {
  setPublicApiCache(res);
  res.json(loadColorsMigrated());
});

app.put('/api/colors', requireAdminAction, (req, res) => {
  const { colors } = req.body;
  if (!Array.isArray(colors)) return res.status(400).json({ error: 'colors must be an array' });
  // Accept array of strings (legacy) or objects
  const prepared = colors.map(c => {
    if (typeof c === 'string') return { name: String(c).trim(), defaultFilament: 'PLA' };
    return { name: String((c && c.name) || '').trim(), defaultFilament: (c && c.defaultFilament) || 'PLA' };
  }).filter(c => c.name);
  saveColors(prepared);
  res.json({ success: true });
});

app.get('/api/filaments', (req, res) => {
  setPublicApiCache(res);
  const raw = loadFilaments();
  const { normalized } = normalizeFilamentEntries(raw);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) saveFilaments(normalized);
  res.json(normalized);
});

app.put('/api/filaments', requireAdminAction, (req, res) => {
  const { filaments } = req.body;
  if (!Array.isArray(filaments)) return res.status(400).json({ error: 'filaments must be an array' });
  const { normalized, mapped } = normalizeFilamentEntries(filaments);
  saveFilaments(normalized);
  if (Object.keys(mapped).length) saveMaterials(mapped);

  res.json({ success: true });
});

// ─── Materials API (material -> colors mapping) ───────────────────────────
app.get('/api/materials', (req, res) => {
  setPublicApiCache(res);
  try {
    const rawFilaments = loadFilaments();
    const { normalized, mapped } = normalizeFilamentEntries(rawFilaments);
    if (JSON.stringify(rawFilaments) !== JSON.stringify(normalized)) saveFilaments(normalized);
    if (Object.keys(mapped).length) {
      saveMaterials(mapped);
      return res.json(mapped);
    }

    const mats = ensureMaterialsFile();
    res.json(mats);
  } catch (e) { res.json({}); }
});

app.put('/api/materials', requireAdminAction, (req, res) => {
  const { materials } = req.body;
  if (!materials || typeof materials !== 'object') return res.status(400).json({ error: 'materials must be an object mapping material->array' });
  // sanitize values
  const out = {};
  Object.keys(materials).forEach(mat => {
    const key = String(mat || '').trim().toUpperCase();
    const arr = Array.isArray(materials[mat]) ? materials[mat].map(s => String(s || '').trim()).filter(Boolean) : [];
    const unique = [];
    arr.forEach(color => {
      if (!unique.some(existing => existing.toLowerCase() === color.toLowerCase())) unique.push(color);
    });
    if (key && unique.length) out[key] = unique;
  });
  saveMaterials(out);

  // Keep filament rolls in sync with materials mapping.
  const filaments = [];
  Object.keys(out).forEach(mat => {
    out[mat].forEach(color => filaments.push(`${mat}: ${color}`));
  });
  saveFilaments(filaments);

  res.json({ success: true });
});

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.session.loggedIn) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/admin/login', (req, res, next) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.redirect('/admin/login?error=1');
  }

  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.loggedIn = true;
    req.session.save(saveErr => {
      if (saveErr) return next(saveErr);
      res.redirect('/admin');
    });
  });
});

app.get('/admin/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/admin/login');
  });
});

// ─── Admin portal ─────────────────────────────────────────────────────────────
app.get('/admin', requireLogin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Products API ─────────────────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  setPublicApiCache(res);
  res.json(loadProducts());
});

app.post('/api/products', requireAdminAction, upload.array('images', 20), async (req, res) => {
  try {
    const uploaded = await processUploadBatch(req.files);
    const picked   = parseJSONValue(req.body.pickedImages, []);
    const hasColors = req.body.hasColors === 'true';
    const hasFilaments = req.body.hasFilaments === 'true';
    const filamentType = String(req.body.filamentType || '').trim();
    const material = String(req.body.material || req.body.primaryFilament || filamentType || '').trim();
    const listingType = normalizeListingType(req.body.listingType);
    const quantity = listingType === 'limited' ? normalizeQuantity(req.body.quantity) : null;
    const products = loadProducts();
    const hasSecondaryColor = req.body.hasSecondaryColor === 'true';
    // prefer explicit primaryFilament (select) but fall back to free-text filamentType
    const primaryFilament = String(req.body.primaryFilament || req.body.filamentType || '').trim();
    const secondaryFilament = String(req.body.secondaryFilament || '').trim();
    const notes = String(req.body.notes || '').trim();
    const variants = normalizeVariants(req.body.variants);
    const name = String(req.body.name || '').trim();
    const price = Number.parseFloat(req.body.price);

    if (!name || !Number.isFinite(price)) {
      return res.status(400).json({ error: 'Name and a valid price are required' });
    }
    if (listingType === 'limited' && quantity === null) {
      return res.status(400).json({ error: 'Limited listings require a quantity' });
    }

    const newProduct = {
      id:          Date.now().toString(),
      name,
      price,
      description: req.body.description || '',
      notes:       notes,
      images:      [...picked, ...uploaded].filter(image => typeof image === 'string' && image.trim()),
      variants,
      hasColors:   hasColors,
      hasSecondaryColor: hasSecondaryColor,
      hasFilaments: hasFilaments,
      material,
      filamentType,
      primaryFilament,
      secondaryFilament,
      listingType,
      quantity,
      etsyUrl:     listingType === 'etsy' ? normalizeEtsyUrl(req.body.etsyUrl) : ''
    };
    products.push(newProduct);
    saveProducts(products);
    res.json({ success: true, product: newProduct });
  } catch (err) {
    console.error('Add product error:', err);
    appendLogEntry('error', 'products', 'Add product error', serializeError(err));
    res.status(500).json({ error: 'Failed to process images' });
  }
});

app.put('/api/products/:id', requireAdminAction, upload.array('images', 20), async (req, res) => {
  try {
    const products = loadProducts();
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const newUploaded = await processUploadBatch(req.files);
    const keepImages  = parseJSONValue(req.body.keepImages, products[idx].images);
    const picked      = parseJSONValue(req.body.pickedImages, []);
    const hasColors   = req.body.hasColors === 'true';
    const hasFilaments = req.body.hasFilaments === 'true';
    const filamentType = String(req.body.filamentType || '').trim();
    const material = String(req.body.material || req.body.primaryFilament || filamentType || products[idx].material || '').trim();
    const listingType = normalizeListingType(req.body.listingType || products[idx].listingType);
    const quantity = listingType === 'limited' ? normalizeQuantity(req.body.quantity) : null;
    const name = String(req.body.name || '').trim();
    const price = Number.parseFloat(req.body.price);

    const hasSecondaryColor = req.body.hasSecondaryColor === 'true';
    const primaryFilament = String(req.body.primaryFilament || req.body.filamentType || '').trim();
    const secondaryFilament = String(req.body.secondaryFilament || '').trim();
    const notes = String(req.body.notes || '').trim();
    const variants = normalizeVariants(req.body.variants);

    if (!name || !Number.isFinite(price)) {
      return res.status(400).json({ error: 'Name and a valid price are required' });
    }
    if (listingType === 'limited' && quantity === null) {
      return res.status(400).json({ error: 'Limited listings require a quantity' });
    }

    products[idx] = {
      ...products[idx],
      name,
      price,
      description: req.body.description || '',
      notes:       notes,
      images:      [...keepImages, ...picked, ...newUploaded].filter(image => typeof image === 'string' && image.trim()),
      variants,
      hasColors:   hasColors,
      hasSecondaryColor: hasSecondaryColor,
      hasFilaments: hasFilaments,
      material,
      filamentType,
      primaryFilament,
      secondaryFilament,
      listingType,
      quantity,
      etsyUrl:     listingType === 'etsy' ? normalizeEtsyUrl(req.body.etsyUrl) : ''
    };
    saveProducts(products);
    res.json({ success: true, product: products[idx] });
  } catch (err) {
    console.error('Update product error:', err);
    appendLogEntry('error', 'products', 'Update product error', serializeError(err));
    res.status(500).json({ error: 'Failed to process images' });
  }
});

// Reorder products (drag-and-drop on storefront admin)
app.put('/api/products/reorder', requireAdminAction, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  const products = loadProducts();
  const reordered = ids.map(id => products.find(p => p.id === id)).filter(Boolean);
  // Append any products not in the reorder list (safety net)
  const missing = products.filter(p => !ids.includes(p.id));
  saveProducts([...reordered, ...missing]);
  res.json({ success: true });
});

app.delete('/api/products/:id', requireAdminAction, (req, res) => {
  let products = loadProducts();
  products = products.filter(p => p.id !== req.params.id);
  saveProducts(products);
  res.json({ success: true });
});

// ─── Image library API ────────────────────────────────────────────────────────
app.get('/api/images', requireLogin, (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => /\.(webp|jpg|jpeg|png|gif|mp4|webm)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(UPLOAD_DIR, f));
        return { url: '/uploads/' + f, filename: f, modified: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json(files);
  } catch { res.json([]); }
});

app.post('/api/images', requireAdminAction, upload.array('images', 20), async (req, res) => {
  try {
    const uploaded = await processUploadBatch(req.files);
    res.json({ success: true, images: uploaded });
  } catch (err) {
    console.error('Image upload error:', err);
    appendLogEntry('error', 'images', 'Image upload error', serializeError(err));
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// Delete an image from the library
app.delete('/api/images/:filename', requireAdminAction, (req, res) => {
  const filename = path.basename(req.params.filename); // sanitize
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filepath);
  deleteCacheVariantsFor(filename);
  res.json({ success: true });
});

app.post('/api/images/clear-unused', requireAdminAction, (req, res) => {
  try {
    const referenced = getReferencedUploadNames();
    const files = fs.readdirSync(UPLOAD_DIR).filter(entry => entry !== 'cache' && fs.statSync(path.join(UPLOAD_DIR, entry)).isFile());
    const deleted = [];

    files.forEach(filename => {
      if (referenced.has(filename)) return;
      const filepath = path.join(UPLOAD_DIR, filename);
      try {
        fs.unlinkSync(filepath);
        deleteCacheVariantsFor(filename);
        deleted.push(filename);
      } catch (err) {
        console.warn('Failed to delete unused upload:', filename, err);
      }
    });

    if (deleted.length) {
      appendLogEntry('info', 'images', 'Cleared unused library images', { deletedCount: deleted.length, deleted });
    }

    res.json({ success: true, deletedCount: deleted.length, deleted });
  } catch (err) {
    console.error('Clear unused images error:', err);
    appendLogEntry('error', 'images', 'Clear unused images error', serializeError(err));
    res.status(500).json({ error: 'Failed to clear unused images' });
  }
});

// ─── Analytics API ────────────────────────────────────────────────────────────

// Helper: parse user-agent into human-readable device + browser strings
function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', deviceType: 'Unknown' };

  // OS detection
  let os = 'Unknown';
  if (/Windows NT 10/i.test(ua))        os = 'Windows 10/11';
  else if (/Windows NT 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua))         os = 'Windows';
  else if (/iPhone OS ([\d_]+)/i.test(ua)) os = 'iOS ' + ua.match(/iPhone OS ([\d_]+)/i)[1].replace(/_/g, '.');
  else if (/iPad.*OS ([\d_]+)/i.test(ua))  os = 'iPadOS ' + ua.match(/OS ([\d_]+)/i)[1].replace(/_/g, '.');
  else if (/Android ([\d.]+)/i.test(ua))   os = 'Android ' + ua.match(/Android ([\d.]+)/i)[1];
  else if (/Mac OS X ([\d_]+)/i.test(ua))  os = 'macOS ' + ua.match(/Mac OS X ([\d_]+)/i)[1].replace(/_/g, '.');
  else if (/CrOS/i.test(ua))           os = 'ChromeOS';
  else if (/Linux/i.test(ua))          os = 'Linux';

  // Device type
  let deviceType = 'Desktop';
  if (/iPhone/i.test(ua))                          deviceType = 'iPhone';
  else if (/iPad/i.test(ua))                        deviceType = 'iPad';
  else if (/Android.*Mobile/i.test(ua))             deviceType = 'Android Phone';
  else if (/Android/i.test(ua))                     deviceType = 'Android Tablet';
  else if (/Mobile|BlackBerry|IEMobile/i.test(ua))  deviceType = 'Mobile';

  // Browser detection (order matters — Edge/OPR must come before Chrome)
  let browser = 'Unknown';
  if (/Edg\/([\d.]+)/i.test(ua))        browser = 'Edge ' + ua.match(/Edg\/([\d.]+)/i)[1].split('.')[0];
  else if (/OPR\/([\d.]+)/i.test(ua))   browser = 'Opera ' + ua.match(/OPR\/([\d.]+)/i)[1].split('.')[0];
  else if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium/i.test(ua))
                                         browser = 'Chrome ' + ua.match(/Chrome\/([\d.]+)/i)[1].split('.')[0];
  else if (/Firefox\/([\d.]+)/i.test(ua)) browser = 'Firefox ' + ua.match(/Firefox\/([\d.]+)/i)[1].split('.')[0];
  else if (/Version\/([\d.]+).*Safari/i.test(ua))   browser = 'Safari ' + ua.match(/Version\/([\d.]+)/i)[1].split('.')[0];
  else if (/Chromium\/([\d.]+)/i.test(ua)) browser = 'Chromium ' + ua.match(/Chromium\/([\d.]+)/i)[1].split('.')[0];
  else if (/MSIE ([\d.]+)|Trident.*rv:([\d.]+)/i.test(ua)) browser = 'IE';

  return { browser, os, deviceType };
}

// Record a product view (called by storefront)
app.post('/api/analytics/view/:id', (req, res) => {
  const { id } = req.params;
  const analytics = loadAnalytics();
  if (!analytics.products[id]) {
    analytics.products[id] = { views: 0, firstSeen: new Date().toISOString(), lastSeen: null };
  }
  analytics.products[id].views++;
  analytics.products[id].lastSeen = new Date().toISOString();
  analytics.totalViews = (analytics.totalViews || 0) + 1;

  const ip = req.clientIp;
  if (ip) analytics.uniqueVisitors[ip] = (analytics.uniqueVisitors[ip] || 0) + 1;

  // Build visitor log entry
  const ua = req.headers['user-agent'] || '';
  const { browser, os, deviceType } = parseUserAgent(ua);
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip: ip || 'unknown',
    productId: id,
    page: req.headers['referer'] || '/',
    deviceType,
    os,
    browser,
    rawUserAgent: ua,
  };
  if (!analytics.visitorLog) analytics.visitorLog = [];
  analytics.visitorLog.unshift(logEntry);           // newest first
  if (analytics.visitorLog.length > 500) analytics.visitorLog.length = 500; // cap at 500 entries

  saveAnalytics(analytics);
  res.json({ success: true });
});

// Get analytics (admin only)
app.get('/api/analytics', requireLogin, (req, res) => {
  const analytics = loadAnalytics();
  const products  = loadProducts();
  // Attach product names to analytics
  const enriched = Object.entries(analytics.products).map(([id, data]) => {
    const product = products.find(p => p.id === id);
    return {
      id,
      name:      product ? product.name : '(deleted product)',
      price:     product ? product.price : null,
      image:     product && product.images[0] ? product.images[0] : null,
      ...data
    };
  }).sort((a, b) => b.views - a.views);

  // Attach product names to visitor log entries
  const visitorLog = (analytics.visitorLog || []).map(entry => {
    const product = products.find(p => p.id === entry.productId);
    return { ...entry, productName: product ? product.name : '(deleted product)' };
  });

  const totalViews = analytics.totalViews || 0;
  res.json({
    totalViews,
    totalProducts: enriched.length,
    uniqueVisitors: Object.keys(analytics.uniqueVisitors || {}).length,
    lastReset: analytics.lastReset,
    products: enriched,
    visitorLog,
  });
});

// Return the admin's own IP so the UI can badge "You" on matching log entries
app.get('/api/analytics/my-ip', requireLogin, (req, res) => {
  res.json({ ip: req.clientIp || 'unknown' });
});

app.post('/api/square/checkout', async (req, res) => {
  const { productId, quantity = 1, color = '', variant = '' } = req.body;
  if (!productId) return res.status(400).json({ error: 'Missing productId' });

  const product = loadProducts().find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const listingType = normalizeListingType(product.listingType);
  if (listingType === 'etsy') {
    return res.status(400).json({ error: 'Etsy items use an external shop link' });
  }

  if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
    return res.status(500).json({ error: 'Square checkout is not configured' });
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  if (listingType === 'limited' && product.quantity != null && qty > Math.max(0, parseInt(product.quantity, 10) || 0)) {
    return res.status(400).json({ error: 'Not enough inventory available' });
  }
  const price = Math.round(Number(product.price) * 100);
  if (!price || Number.isNaN(price) || price < 1) {
    return res.status(400).json({ error: 'Invalid product price' });
  }

  try {
    const siteUrl = `${req.protocol}://${req.get('host')}`;
    const safeVariant = String(variant || '').trim();
    const safeColor = String(color || '').trim();
    const parts = [safeVariant, safeColor].filter(Boolean);
    const itemName = parts.length ? `${product.name} (${parts.join(' / ')})` : product.name;
    const formattedTotal = (price / 100).toFixed(2);
    const redirectParams = new URLSearchParams({
      checkout: 'complete',
      itemName,
      quantity: String(qty),
      total: formattedTotal
    });
    const paymentLink = await squareClient.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      description: product.description || 'Store purchase',
      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [{
          name: itemName,
          quantity: String(qty),
          basePriceMoney: {
            amount: BigInt(price),
            currency: 'USD'
          }
        }]
      },
      checkoutOptions: {
        redirectUrl: `${siteUrl}/?${redirectParams.toString()}`
      }
    });

    const url = paymentLink.paymentLink?.url;
    if (!url) {
      console.error('Square payment link error:', paymentLink);
      return res.status(500).json({ error: 'Square checkout URL not returned' });
    }

    res.json({ checkoutUrl: url });
  } catch (err) {
    console.error('Square checkout error:', err);
    appendLogEntry('error', 'payments', 'Square checkout error', serializeError(err));
    res.status(500).json({ error: 'Unable to create Square checkout session' });
  }
});

// ─── Payment Processing ──────────────────────────────────────────────────────
app.post('/pay', async (req, res) => {
  const {
    token,
    productId,
    quantity = 1,
    customerName,
    customerAddress,
    customerCity,
    customerState,
    customerZip,
    customerPhone,
    selectedColor,
    selectedSecondaryColor,
    selectedVariant,
    selectedPrimaryFilament,
    selectedSecondaryFilament
  } = req.body;

  if (!token || !productId) {
    return res.status(400).json({ error: 'Missing token or productId' });
  }

  const product = loadProducts().find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const listingType = normalizeListingType(product.listingType);
  if (listingType === 'etsy') {
    return res.status(400).json({ error: 'Etsy items must be purchased through Etsy' });
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  if (listingType === 'limited' && product.quantity != null && qty > Math.max(0, parseInt(product.quantity, 10) || 0)) {
    return res.status(400).json({ error: 'Not enough inventory available' });
  }
  const unitAmount = Math.round(Number(product.price) * 100);
  if (!unitAmount || Number.isNaN(unitAmount) || unitAmount < 1) {
    return res.status(400).json({ error: 'Invalid product price' });
  }
  const totalAmount = unitAmount * qty;
  const safeColor = String(selectedColor || '').trim();
  const safeSecondaryColor = String(selectedSecondaryColor || '').trim();
  const safeVariant = String(selectedVariant || '').trim();
  const safePrimaryFilament = String(selectedPrimaryFilament || '').trim();
  const safeSecondaryFilament = String(selectedSecondaryFilament || '').trim();
  const colorPair = [safeColor, safeSecondaryColor].filter(Boolean).join(' / ');
  const itemOptions = [safeVariant, colorPair].filter(Boolean).join(' / ');
  const lineItemName = itemOptions ? `${product.name} (${itemOptions})` : product.name;

  try {
    const orderResult = await squareClient.orders.create({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [{
          name:          lineItemName || 'Product',
          quantity:      String(qty),
          basePriceMoney: {
            amount:   BigInt(unitAmount),
            currency: 'USD'
          }
        }],
      }
    });

    const orderId = orderResult.order?.id || orderResult.data?.order?.id;
    if (!orderId) {
      console.error('Square order error: no order ID returned', JSON.stringify(orderResult));
      return res.status(500).json({ error: 'Failed to create order' });
    }

    const paymentResult = await squareClient.payments.create({
      sourceId:       token,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount:   BigInt(totalAmount),
        currency: 'USD'
      },
      orderId,
      locationId: SQUARE_LOCATION_ID,
      note: `${lineItemName} × ${qty}${customerName ? ' — ' + customerName : ''}${customerPhone ? ' • ' + customerPhone : ''}${safePrimaryFilament ? ` • ${safePrimaryFilament}${safeSecondaryFilament ? ' / ' + safeSecondaryFilament : ''}` : ''}`,
      billingAddress: {
        addressLine1: customerAddress || undefined,
        locality: customerCity || undefined,
        administrativeDistrictLevel1: customerState || undefined,
        postalCode: customerZip || undefined,
        country: 'US'
      }
    });

    const paymentId = paymentResult.payment?.id || paymentResult.data?.payment?.id;
    console.log(`✅ Payment success: ${product.name} × ${qty} — Order ${orderId} / Payment ${paymentId}`);

    sendDiscordNotification({
      orderId,
      paymentId,
      productId: product.id,
      productName: product.name,
      isDebugOrder: false,
      listingType,
      quantity: qty,
      unitAmount,
      customerName,
      customerPhone,
      customerAddress,
      customerCity,
      customerState,
      customerZip,
      selectedColor: safeColor,
      selectedSecondaryColor: safeSecondaryColor,
      selectedVariant: safeVariant,
      selectedPrimaryFilament: safePrimaryFilament,
      selectedSecondaryFilament: safeSecondaryFilament,
      totalAmount
    }).catch(err => console.warn('Discord notify failed:', err));

    if (listingType === 'limited' && product.quantity != null) {
      const products = loadProducts();
      const idx = products.findIndex(p => p.id === productId);
      if (idx !== -1) {
        const currentQty = Math.max(0, parseInt(products[idx].quantity, 10) || 0);
        products[idx].quantity = Math.max(0, currentQty - qty);
        saveProducts(products);
      }
    }

    res.json({ success: true, orderId, paymentId });
  } catch (err) {
    console.error('Payment error:', err);
    appendLogEntry('error', 'payments', 'Payment error', serializeError(err));
    res.status(500).json({ error: err?.message || 'Payment failed' });
  }
});

app.post('/debug/fake-pay', async (req, res) => {
  const settings = loadSettings();
  if (settings.debugFakePurchase !== true) {
    return res.status(403).json({ error: 'Debug fake purchase mode is disabled' });
  }

  const {
    productId,
    quantity = 1,
    customerName,
    customerAddress,
    customerCity,
    customerState,
    customerZip,
    customerPhone,
    selectedColor,
    selectedSecondaryColor,
    selectedVariant,
    selectedPrimaryFilament,
    selectedSecondaryFilament
  } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Missing productId' });
  }

  const product = loadProducts().find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const listingType = normalizeListingType(product.listingType);
  if (listingType === 'etsy') {
    return res.status(400).json({ error: 'Etsy items cannot use debug fake purchase' });
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  if (listingType === 'limited' && product.quantity != null && qty > Math.max(0, parseInt(product.quantity, 10) || 0)) {
    return res.status(400).json({ error: 'Not enough inventory available' });
  }

  const unitAmount = Math.max(0, Math.round(Number(product.price) * 100));
  const totalAmount = unitAmount * qty;
  const safeColor = String(selectedColor || '').trim();
  const safeSecondaryColor = String(selectedSecondaryColor || '').trim();
  const safeVariant = String(selectedVariant || '').trim();
  const safePrimaryFilament = String(selectedPrimaryFilament || '').trim();
  const safeSecondaryFilament = String(selectedSecondaryFilament || '').trim();

  const orderId = `DEBUG-${Date.now()}`;
  const paymentId = `DEBUG-PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  await sendDiscordNotification({
    orderId,
    paymentId,
    productId: product.id,
    productName: product.name,
    isDebugOrder: true,
    listingType,
    quantity: qty,
    unitAmount,
    customerName,
    customerPhone,
    customerAddress,
    customerCity,
    customerState,
    customerZip,
    selectedColor: safeColor,
    selectedSecondaryColor: safeSecondaryColor,
    selectedVariant: safeVariant,
    selectedPrimaryFilament: safePrimaryFilament,
    selectedSecondaryFilament: safeSecondaryFilament,
    totalAmount
  });

  res.json({ success: true, orderId, paymentId, debug: true });
});

// ─── Webhook for Square Notifications ────────────────────────────────────────
app.get('/webhook', (req, res) => {
  res.send('Webhook endpoint - POST only for Square notifications');
});

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = req.body instanceof Buffer ? JSON.parse(req.body.toString('utf8')) : req.body;
  } catch (err) {
    console.error('Webhook parse error:', err);
    appendLogEntry('error', 'webhook', 'Webhook parse error', serializeError(err));
    return res.status(400).send('Invalid webhook payload');
  }
  const validSignature = verifySquareWebhookSignature(req);

  if (!validSignature) {
    console.warn('⚠️ Square webhook signature could not be verified');
    appendLogEntry('warn', 'webhook', 'Square webhook signature could not be verified');
    return res.status(401).send('Invalid webhook signature');
  }

  console.log('Received Square webhook:', event?.type || 'unknown');

  if (event?.type === 'payment.updated') {
    const payment = event?.data?.object;
    if (payment?.status === 'COMPLETED') {
      console.log('Payment completed via webhook:', payment.id);
      // Future extension: send email receipt, update order records or analytics
    }
  }

  res.status(200).send('OK');
});

// Reset analytics (admin only)
app.post('/api/analytics/reset', requireAdminAction, (req, res) => {
  saveAnalytics({
    products: {},
    totalViews: 0,
    uniqueVisitors: {},
    visitorLog: [],
    lastReset: new Date().toISOString()
  });
  res.json({ success: true });
});

// ─── Contact info API ─────────────────────────────────────────────────────────
// Public: get contact info for storefront
app.get('/api/contact', (req, res) => {
  setPublicApiCache(res);
  res.json(loadContact());
});

app.get('/healthz', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Admin: save contact info
app.put('/api/contact', requireAdminAction, (req, res) => {
  const { name, role, bio, avatar, email, phone, instagram, etsy, youtube, github, links, custom, resume, youtubeEnabled } = req.body;
  const normalizedLinks = Array.isArray(links)
    ? links.slice(0, 12).map(link => ({
      label: String(link && link.label || '').trim().slice(0, 40),
      url: String(link && link.url || '').trim().slice(0, 500)
    })).filter(link => link.label && link.url)
    : [];
  saveContact({
    name: String(name || '').trim().slice(0, 80), role: String(role || '').trim().slice(0, 100),
    bio: String(bio || '').trim().slice(0, 1000), avatar: String(avatar || '').trim().slice(0, 500),
    email: email || '', phone: phone || '', instagram: instagram || '', etsy: etsy || '',
    youtube: youtube || '', github: github || '', links: normalizedLinks, custom: custom || '', youtubeEnabled: youtubeEnabled === true,
    resume: {
      enabled: resume && (resume.enabled === true || resume.enabled === 'true'),
      title: String(resume && resume.title || 'Resume').trim().slice(0, 80),
      summary: String(resume && resume.summary || '').trim().slice(0, 300),
      url: String(resume && resume.url || '').trim().slice(0, 500)
    }
  });
  res.json({ success: true });
});

app.post('/api/contact/avatar', requireAdminAction, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose an image.' });
  try {
    const [avatarUrl] = await processUploadBatch([req.file]);
    const contact = loadContact();
    contact.avatar = avatarUrl;
    saveContact(contact);
    res.json({ success: true, avatar: avatarUrl });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Avatar upload failed.' });
  }
});

app.get('/api/logs', requireLogin, (req, res) => {
  res.json(loadLogs());
});

app.post('/api/logs/clear', requireAdminAction, (req, res) => {
  saveLogs([]);
  res.json({ success: true });
});

app.use((err, req, res, next) => {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'One of the selected files exceeds the 50MB upload limit.'
      : (err.message || 'Upload error');
    appendLogEntry('error', 'images', 'Multer upload error', {
      code: err.code,
      message,
      field: err.field,
      method: req?.method,
      path: req?.originalUrl
    });
    return res.status(400).json({ error: message });
  }

  if (typeof err.message === 'string' && err.message.includes('Only image and video files are allowed')) {
    appendLogEntry('warn', 'images', 'Rejected upload file type', {
      message: err.message,
      method: req?.method,
      path: req?.originalUrl
    });
    return res.status(400).json({ error: err.message });
  }

  return next(err);
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  appendLogEntry('error', 'express', 'Unhandled server error', {
    ...serializeError(err),
    method: req?.method,
    path: req?.originalUrl,
    ip: req?.clientIp || req?.ip || null
  });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  appendLogEntry('fatal', 'process', 'Uncaught exception', serializeError(err));
  clearInstanceLock();
  setTimeout(() => process.exit(1), 100).unref();
});

process.on('unhandledRejection', reason => {
  console.error('Unhandled rejection:', reason);
  appendLogEntry('fatal', 'process', 'Unhandled rejection', serializeError(reason));
  clearInstanceLock();
  setTimeout(() => process.exit(1), 100).unref();
});

function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  Object.values(interfaces).forEach(entries => {
    (entries || []).forEach(entry => {
      if (!entry || entry.family !== 'IPv4' || entry.internal) return;
      ips.push(entry.address);
    });
  });
  return Array.from(new Set(ips));
}

function logStartupDetails(activePort) {
  console.log(`\n✅ Store v6 running at: http://localhost:${activePort}`);
  console.log(`🔐 Admin portal at:    http://localhost:${activePort}/admin`);
  console.log(`   Username: ${ADMIN_USER}`);

  const lanIps = getLanIps();
  if (lanIps.length) {
    lanIps.forEach(ip => {
      console.log(`📱 LAN access:         http://${ip}:${activePort}`);
    });
  }

  if (TRUST_PROXY) {
    console.log('🌐 Trust proxy: ON (Tailscale Funnel / reverse-proxy mode)');
    console.log('🔒 HTTPS note: Use your proxy/Funnel HTTPS URL. Direct https://LAN_IP:PORT will show TLS warnings.');
  }

  console.log(`\n📊 Analytics, contact tab, drag-to-order — all enabled\n`);
}

function maybeStartTailscale() {
  if (process.env.START_TAILSCALE === 'true') {
    const cmd = process.env.TAILSCALE_CMD || 'tailscale';
    const args = process.env.TAILSCALE_ARGS ? process.env.TAILSCALE_ARGS.split(' ') : ['up'];
    try {
      const ts = spawn(cmd, args);
      ts.stdout.on('data', d => console.log(`[tailscale] ${d.toString().trim()}`));
      ts.stderr.on('data', d => console.error(`[tailscale] ${d.toString().trim()}`));
      ts.on('exit', code => console.log(`[tailscale] exited with code ${code}`));
      console.log('🔁 Attempting to start Tailscale...');
    } catch (e) {
      console.error('⚠️ Failed to start Tailscale:', e && e.message ? e.message : e);
    }
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
let server;
let activePort = PORT;

enforceSingleInstance();

function startServer(port, retriesLeft) {
  activePort = port;

  const candidate = app.listen(port, () => {
    writeInstanceLock(port);
    logStartupDetails(port);
    maybeStartTailscale();
  });

  candidate.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;
  candidate.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
  candidate.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;

  candidate.on('error', err => {
    if (err && err.code === 'EADDRINUSE' && retriesLeft > 0) {
      const nextPort = port + 1;
      console.warn(`⚠️ Port ${port} in use. Retrying on ${nextPort}...`);
      return startServer(nextPort, retriesLeft - 1);
    }

    if (err && err.code === 'EADDRINUSE') {
      const message = `Port ${port} is already in use and no retries remain. Stop the other process or set PORT to a free port.`;
      console.error(`❌ ${message}`);
      appendLogEntry('fatal', 'process', message, serializeError(err));
      process.exit(1);
      return;
    }

    throw err;
  });

  server = candidate;
}

startServer(PORT, MAX_PORT_RETRIES);

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInstanceLock();
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(closeErr => {
    if (closeErr) {
      console.error('Error during shutdown:', closeErr);
      return process.exit(1);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => clearInstanceLock());
