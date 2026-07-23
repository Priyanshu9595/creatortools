require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const http = require("node:http");
const { GoogleGenAI, Type } = require("@google/genai");
let ai;
try {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (e) {
  console.warn("Failed to initialize GoogleGenAI:", e.message);
}

async function generateWithGemini(prompt, schema) {
  if (!ai) throw new Error("Gemini API is not configured. Please set GEMINI_API_KEY in .env");
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.7
    }
  });
  return JSON.parse(response.text);
}

const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const OpenAI = require("openai");
const cloudinary = require("cloudinary").v2;

let openai;
try {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });
} catch (e) {
  console.warn("OpenAI init failed:", e.message);
}

let groqOpenAi;
try {
  groqOpenAi = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY || "dummy"
  });
} catch (e) {
  console.warn("Groq OpenAI init failed:", e.message);
}

cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL || "dummy"
});

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
let s3Client = null;
const objectBucketName = process.env.B2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "";
const objectPublicBaseUrl = (process.env.B2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
if (process.env.B2_ENDPOINT && process.env.B2_KEY_ID && process.env.B2_APP_KEY) {
  s3Client = new S3Client({
    region: process.env.B2_REGION || "us-west-004",
    endpoint: process.env.B2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APP_KEY,
    }
  });
} else if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  });
}

const {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  unlinkSync
} = require("node:fs");
const { basename, join, extname, normalize } = require("node:path");

if (!existsSync(join(__dirname, "uploads"))) {
  mkdirSync(join(__dirname, "uploads"));
}
const upload = multer({ dest: join(__dirname, "uploads/") });

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}
const { randomUUID, createHash } = require("node:crypto");
const { createHmac, pbkdf2Sync, timingSafeEqual } = require("node:crypto");

const DEFAULT_PORT = Number(process.env.PORT || 4173);
let activePort = DEFAULT_PORT;
const ROOT = join(__dirname, "..");
const FRONTEND = join(ROOT, "frontend");
const DATA_DIR = join(__dirname, "data");
const STORE_FILE = join(DATA_DIR, "store.json");
const USERS_FILE = join(DATA_DIR, "users.json");
const USER_STORES_DIR = join(DATA_DIR, "stores");
let creatorId = "single-creator";
let store;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac"
};

const moduleLabels = {
  script: "AI Script Writer",
  subtitle: "Subtitle Studio",
  podcast: "Podcast Manager",
  thumbnail: "Thumbnail Studio",
  storyboard: "Storyboard Builder"
};

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function defaultStore() {
  const createdAt = now();
  return {
    creator: {
      id: creatorId,
      name: "Creator",
      brand: "CreatorTools",
      email: "creator@example.com",
      timezone: "Asia/Calcutta",
      brandSettings: {
        voice: "Practical, crisp, creator-focused",
        colors: ["#7c3aed", "#2563eb", "#06b6d4"],
        logoText: "CreatorTools",
        defaultLanguage: "English"
      },
      providers: {
        text: { name: "Gemini Flash", status: "healthy", fallback: "Local structured draft" },
        transcription: { name: "Groq Whisper", status: "healthy", fallback: "Faster-Whisper self-hosted" },
        imageSearch: { name: "Unsplash", status: "healthy", fallback: "Uploaded or generated backgrounds" },
        storage: { name: "Local object store", status: "healthy", fallback: "Cloudflare R2 adapter-ready" },
        export: { name: "Browser/server export", status: "healthy", fallback: "Plain text download" }
      },
      limits: {
        maxStoryboardScenes: 10,
        storageCapMb: process.env.IS_ADMIN === 'true' ? 2048 : 200
      },
      retention: {
        trashDays: 30,
        exportExpiryDays: 14,
        jobLogDays: 30
      }
    },
    usage: {
      storageMb: 0
    },
    projects: [],
    versions: [],
    media: [],
    jobs: [],
    exports: [],
    notifications: [],
    activity: [],
    podcast: {
      id: "pod-1",
      creatorId,
      title: "",
      subtitle: "",
      slug: "",
      author: "",
      ownerName: "",
      ownerEmail: "",
      language: "en",
      country: "IN",
      category: "",
      primaryCategory: "",
      secondaryCategory: "",
      explicit: false,
      description: "",
      coverUrl: "",
      coverImageUrl: "",
      brandColor: "#7c3aed",
      websiteUrl: "",
      copyright: "",
      tagline: "",
      podcastType: "Episodic",
      defaultEpisodeAuthor: "",
      defaultEpisodeLanguage: "en",
      timezone: "Asia/Calcutta",
      accentColor: "#7c3aed",
      feedStatus: "DRAFT",
      feedHealth: "Needs attention",
      lastPublishedAt: null,
      episodes: [],
      settings: {
        maxAudioFileSizeMb: 200,
        storageLimitMb: 10240
      }
    }
  };
}

function seedProject(module, title, status, tags, date) {
  const ids = { script: "p-script", subtitle: "p-subtitle", podcast: "p-podcast", thumbnail: "p-thumb", storyboard: "p-story" };
  return {
    id: ids[module] || id("p"),
    creatorId,
    module,
    title,
    status,
    tags,
    latestVersion: 1,
    content: seedContent(module, title),
    createdAt: date,
    updatedAt: date,
    archivedAt: null,
    trashedAt: null
  };
}

function seedContent(module, title) {
  if (module === "script") return scriptFromBrief({ topic: title, platform: "YouTube", tone: "Informative", duration: 45 });
  if (module === "subtitle") return subtitlesFromBody({ title, format: "SRT" });
  if (module === "thumbnail") return thumbnailSuggestions({ title, aspectRatio: "16:9" });
  if (module === "storyboard") return storyboardFromBrief({ title, duration: 30 });
  return { note: title };
}

function episode(idValue, title, status, date, duration, bytes) {
  return {
    id: idValue,
    podcastId: "pod-1",
    creatorId,
    title,
    slug: slugify(title),
    subtitle: "",
    status,
    season: 1,
    seasonNumber: 1,
    episodeNumber: Number(idValue.replace(/\D/g, "")) || 1,
    episodeType: "Full",
    author: "",
    language: "en",
    keywords: [],
    date,
    scheduledAt: status === "SCHEDULED" ? date : null,
    publishedAt: status === "PUBLISHED" ? date : null,
    duration,
    durationSeconds: 0,
    bytes,
    audioFileSize: bytes,
    mimeType: "audio/mpeg",
    audioMimeType: "audio/mpeg",
    audioUrl: "",
    audioStorageKey: "",
    audioFileName: "",
    coverImageUrl: "",
    guid: idValue,
    explicit: false,
    description: "",
    showNotes: [],
    showNotesJson: {},
    transcript: "",
    chapters: [],
    chaptersJson: [],
    guests: [],
    createdAt: date,
    updatedAt: date
  };
}

function normalizeEpisode(item = {}) {
  const createdAt = item.createdAt || item.date || now();
  const title = clean(item.title, "");
  const audioFileSize = Number(item.audioFileSize || item.bytes || 0);
  const audioMimeType = clean(item.audioMimeType || item.mimeType, "audio/mpeg");
  return {
    ...item,
    id: item.id || id("ep"),
    podcastId: item.podcastId || "pod-1",
    creatorId: item.creatorId || creatorId,
    title,
    slug: item.slug || slugify(title || item.id || "episode"),
    subtitle: item.subtitle || "",
    status: String(item.status || "DRAFT").toUpperCase(),
    season: Number(item.season || item.seasonNumber || 1),
    seasonNumber: Number(item.seasonNumber || item.season || 1),
    episodeNumber: Number(item.episodeNumber || 1),
    episodeType: item.episodeType || "Full",
    author: item.author || store?.podcast?.defaultEpisodeAuthor || store?.podcast?.author || "",
    language: item.language || store?.podcast?.defaultEpisodeLanguage || store?.podcast?.language || "en",
    keywords: Array.isArray(item.keywords) ? item.keywords : String(item.keywords || "").split(",").map((value) => value.trim()).filter(Boolean),
    date: item.date || item.publishedAt || createdAt,
    scheduledAt: item.scheduledAt || null,
    publishedAt: item.publishedAt || (String(item.status || "").toUpperCase() === "PUBLISHED" ? item.date || createdAt : null),
    duration: item.duration || "00:00",
    durationSeconds: Number(item.durationSeconds || 0),
    bytes: audioFileSize,
    audioFileSize,
    mimeType: audioMimeType,
    audioMimeType,
    audioUrl: item.audioUrl || "",
    audioStorageKey: item.audioStorageKey || "",
    audioFileName: item.audioFileName || "",
    coverImageUrl: item.coverImageUrl || "",
    guid: item.guid || `${store?.podcast?.slug || "podcast"}-${item.id || randomUUID()}`,
    explicit: truthy(item.explicit),
    description: item.description || "",
    showNotes: Array.isArray(item.showNotes) ? item.showNotes : [],
    showNotesJson: item.showNotesJson || {},
    transcript: item.transcript || "",
    chapters: Array.isArray(item.chapters) ? item.chapters : [],
    chaptersJson: Array.isArray(item.chaptersJson) ? item.chaptersJson : item.chapters || [],
    guests: Array.isArray(item.guests) ? item.guests : [],
    createdAt,
    updatedAt: item.updatedAt || createdAt
  };
}

function job(type, projectId, status, progressPercent, provider, model, resultReference, errorCode = "") {
  return {
    id: id("job"),
    creatorId,
    type,
    projectId,
    status,
    progressPercent,
    provider,
    model,
    resultReference,
    errorCode,
    userMessage: status === "FAILED" ? "Processing failed. Review the input and retry." : "",
    retryCount: 0,
    createdAt: now(),
    updatedAt: now()
  };
}

function notification(title, message, type, referenceId) {
  return { id: id("note"), creatorId, title, message, type, referenceId, read: false, createdAt: now() };
}

function activity(type, message) {
  return { id: id("act"), creatorId, type, message, createdAt: now() };
}

function historyEntry(type, message, snapshot = {}) {
  return { id: id("hist"), creatorId, type, message, snapshot, createdAt: now() };
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
  creator: mongoose.Schema.Types.Mixed,
  usage: mongoose.Schema.Types.Mixed,
  projects: [mongoose.Schema.Types.Mixed],
  versions: [mongoose.Schema.Types.Mixed],
  media: [mongoose.Schema.Types.Mixed],
  jobs: [mongoose.Schema.Types.Mixed],
  exports: [mongoose.Schema.Types.Mixed],
  notifications: [mongoose.Schema.Types.Mixed],
  activity: [mongoose.Schema.Types.Mixed],
  podcast: mongoose.Schema.Types.Mixed
}, { minimize: false, timestamps: true, strict: false });

const StoreModel = mongoose.model('Store', StoreSchema);
const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  email: { type: String, unique: true, index: true },
  name: String,
  passwordHash: String,
  createdAt: String,
  updatedAt: String
}, { minimize: false, timestamps: true, strict: false });
const UserModel = mongoose.model('User', UserSchema);
let mongoReady = false;

function authSecret() {
  return process.env.AUTH_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET || "creator-suite-local-dev-secret";
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password, salt = randomUUID()) {
  const hash = pbkdf2Sync(String(password || ""), salt, 120000, 32, "sha256").toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored = "") {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = Buffer.from(hashPassword(password, salt).split(":")[1], "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    exp: Date.now() + (1000 * 60 * 60 * 24 * 30)
  };
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", authSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token = "") {
  const [body, signature] = String(token).split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", authSecret()).update(body).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.sub || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name || user.email };
}

function localUsers() {
  try {
    if (existsSync(USERS_FILE)) return JSON.parse(readFileSync(USERS_FILE, "utf8"));
  } catch (error) {
    console.warn("Local users could not be read:", error.message);
  }
  return [];
}

function saveLocalUsers(users) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function userStoreFile(userId) {
  return join(USER_STORES_DIR, `${String(userId).replace(/[^\w.-]+/g, "_")}.json`);
}

function storeForUser(user) {
  creatorId = user.id;
  const nextStore = defaultStore();
  nextStore.creator.id = user.id;
  nextStore.creator.email = user.email;
  nextStore.creator.name = user.name || user.email.split("@")[0] || "Creator";
  nextStore.creator.brand = nextStore.creator.name;
  nextStore.podcast.creatorId = user.id;
  return nextStore;
}

function loadLocalStore() {
  try {
    if (existsSync(STORE_FILE)) {
      return JSON.parse(readFileSync(STORE_FILE, "utf8"));
    }
  } catch (error) {
    console.warn("Local store could not be read; starting with defaults:", error.message);
  }
  const seeded = defaultStore();
  seeded.versions = seeded.projects.map((project) => versionFor(project, "Initial BRD seed"));
  return seeded;
}

function loadLocalStoreForUser(user) {
  try {
    const file = userStoreFile(user.id);
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.warn("User store could not be read; starting with defaults:", error.message);
  }
  return storeForUser(user);
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

async function initDb() {
  const useLocalStore = truthy(process.env.USE_LOCAL_STORE);
  if (process.env.MONGODB_URI && !useLocalStore) {
    try {
      const timeoutMs = Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 8000);
      await withTimeout(
        mongoose.connect(process.env.MONGODB_URI, {
          dbName: 'creatortools',
          serverSelectionTimeoutMS: timeoutMs,
          connectTimeoutMS: timeoutMs
        }),
        timeoutMs + 1000,
        "MongoDB connection timed out"
      );
      mongoReady = true;
      const doc = await StoreModel.findOne();
      if (doc) {
        store = doc.toObject();
      } else {
        store = loadLocalStore();
        await StoreModel.create(store);
      }
    } catch (error) {
      mongoReady = false;
      console.warn("MongoDB unavailable; using local JSON store:", error.message);
    }
  }
  if (!store) store = loadLocalStore();
  normalizeStore();
}

function saveStore(nextStore = store) {
  const nextCreatorId = nextStore?.creator?.id || creatorId;
  const writes = [];
  if (mongoReady) {
    const { _id, __v, ...updateDoc } = nextStore;
    writes.push(StoreModel.replaceOne({ "creator.id": nextCreatorId }, updateDoc, { upsert: true }).catch(err => console.error('MongoDB save error:', err)));
  }
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (nextCreatorId && nextCreatorId !== "single-creator") {
      if (!existsSync(USER_STORES_DIR)) mkdirSync(USER_STORES_DIR, { recursive: true });
      writeFileSync(userStoreFile(nextCreatorId), JSON.stringify(nextStore, null, 2));
    } else {
      writeFileSync(STORE_FILE, JSON.stringify(nextStore, null, 2));
    }
  } catch (error) {
    console.error("Local store save error:", error);
  }
  return Promise.allSettled(writes);
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (mongoReady) return UserModel.findOne({ email: normalized }).lean();
  return localUsers().find((user) => user.email === normalized) || null;
}

async function findUserById(userId) {
  if (!userId) return null;
  if (mongoReady) return UserModel.findOne({ id: userId }).lean();
  return localUsers().find((user) => user.id === userId) || null;
}

async function createUserRecord({ email, password, name }) {
  const normalized = normalizeEmail(email);
  const createdAt = now();
  const user = {
    id: id("user"),
    email: normalized,
    name: clean(name, normalized.split("@")[0] || "Creator"),
    passwordHash: hashPassword(password),
    createdAt,
    updatedAt: createdAt
  };
  if (mongoReady) {
    await UserModel.create(user);
  } else {
    const users = localUsers();
    users.push(user);
    saveLocalUsers(users);
  }
  const userStore = storeForUser(user);
  if (mongoReady) {
    const { _id, __v, ...updateDoc } = userStore;
    await StoreModel.replaceOne({ "creator.id": user.id }, updateDoc, { upsert: true });
  }
  saveStore(userStore);
  return user;
}

async function loadStoreForUser(user) {
  creatorId = user.id;
  if (mongoReady) {
    let doc = await StoreModel.findOne({ "creator.id": user.id });
    if (!doc) {
      doc = await StoreModel.findOne({ $or: [{ "creator.email": user.email }, { "podcast.ownerEmail": user.email }] });
    }
    if (doc) {
      store = doc.toObject();
      store.creator ??= {};
      store.creator.id = user.id;
      store.creator.email = user.email;
      store.creator.name ||= user.name || user.email.split("@")[0] || "Creator";
      store.podcast ??= defaultStore().podcast;
      store.podcast.creatorId = user.id;
    } else {
      store = storeForUser(user);
    }
  } else {
    store = loadLocalStoreForUser(user);
    store.creator.id = user.id;
    store.creator.email = user.email;
    store.creator.name ||= user.name || user.email.split("@")[0] || "Creator";
    store.podcast.creatorId = user.id;
  }
  normalizeStore();
  return store;
}

async function loadPublicStoreBySlug(slug) {
  const targetSlug = slugify(slug);
  if (mongoReady) {
    const doc = await StoreModel.findOne({ "podcast.slug": targetSlug });
    if (!doc) return null;
    store = doc.toObject();
  } else {
    const stores = [];
    try {
      stores.push(loadLocalStore());
      if (existsSync(USER_STORES_DIR)) {
        for (const file of readdirSync(USER_STORES_DIR).filter((item) => item.endsWith(".json"))) {
          stores.push(JSON.parse(readFileSync(join(USER_STORES_DIR, file), "utf8")));
        }
      }
    } catch {}
    store = stores.find((item) => item?.podcast?.slug === targetSlug) || null;
  }
  if (!store) return null;
  creatorId = store.creator?.id || "single-creator";
  normalizeStore();
  return store;
}


function normalizeStore() {
  store.creator.limits ??= {};
  store.creator.limits = {
    maxStoryboardScenes: store.creator.limits.maxStoryboardScenes || 10,
    storageCapMb: process.env.IS_ADMIN === 'true' ? 2048 : 200
  };
  const storageMb = store.usage?.storageMb || 0;
  store.usage = { storageMb };
  store.podcast ??= defaultStore().podcast;
  store.podcast.episodes ??= [];
  store.podcast.ownerName ??= store.podcast.author || "";
  store.podcast.primaryCategory ??= store.podcast.category || "";
  store.podcast.secondaryCategory ??= "";
  store.podcast.coverImageUrl ??= store.podcast.coverUrl || "";
  store.podcast.brandColor ??= store.podcast.accentColor || "#7c3aed";
  store.podcast.websiteUrl ??= "";
  store.podcast.copyright ??= "";
  store.podcast.tagline ??= "";
  store.podcast.podcastType ??= "Episodic";
  store.podcast.defaultEpisodeAuthor ??= store.podcast.author || "";
  store.podcast.defaultEpisodeLanguage ??= store.podcast.language || "en";
  store.podcast.timezone ??= store.creator.timezone || "Asia/Calcutta";
  store.podcast.settings ??= {};
  store.podcast.settings.maxAudioFileSizeMb ??= 200;
  store.podcast.settings.storageLimitMb ??= 10240;
  store.podcast.history ??= [];
  store.podcast.episodes = store.podcast.episodes.map(normalizeEpisode);
  saveStore();
}

function podcastSnapshot() {
  const {
    episodes,
    history,
    rssPreview,
    validation,
    ...profile
  } = store.podcast || {};
  return profile;
}

function podcastResponse() {
  return {
    ...store.podcast,
    stats: podcastStats(),
    validation: validatePodcastFeed(),
    feedUrl: store.podcast.slug ? `/rss/${store.podcast.slug}.xml` : "",
    publicUrl: store.podcast.slug ? `/podcast/${store.podcast.slug}` : ""
  };
}

function podcastProfileFromBody(body = {}) {
  return {
    title: clean(body.title, store.podcast.title || ""),
    subtitle: clean(body.subtitle, store.podcast.subtitle || ""),
    description: clean(body.description, store.podcast.description || ""),
    author: clean(body.author || body.ownerName, store.podcast.author || ""),
    ownerName: clean(body.ownerName || body.author, store.podcast.ownerName || ""),
    ownerEmail: clean(body.ownerEmail, store.podcast.ownerEmail || store.creator.email || ""),
    language: clean(body.language, store.podcast.language || "en"),
    country: clean(body.country, store.podcast.country || "IN"),
    category: clean(body.primaryCategory || body.category, store.podcast.category || ""),
    primaryCategory: clean(body.primaryCategory || body.category, store.podcast.primaryCategory || ""),
    secondaryCategory: clean(body.secondaryCategory, store.podcast.secondaryCategory || ""),
    websiteUrl: clean(body.websiteUrl, store.podcast.websiteUrl || ""),
    copyright: clean(body.copyright, store.podcast.copyright || ""),
    tagline: clean(body.tagline, store.podcast.tagline || ""),
    podcastType: clean(body.podcastType, store.podcast.podcastType || "Episodic"),
    explicit: truthy(body.explicit),
    coverImageUrl: clean(body.coverImageUrl || body.coverUrl, store.podcast.coverImageUrl || ""),
    coverUrl: clean(body.coverImageUrl || body.coverUrl, store.podcast.coverUrl || ""),
    brandColor: clean(body.brandColor, store.podcast.brandColor || "#7c3aed"),
    defaultEpisodeAuthor: clean(body.defaultEpisodeAuthor || body.author, store.podcast.defaultEpisodeAuthor || ""),
    defaultEpisodeLanguage: clean(body.defaultEpisodeLanguage || body.language, store.podcast.defaultEpisodeLanguage || "en"),
    timezone: clean(body.timezone, store.podcast.timezone || store.creator.timezone),
    updatedAt: now()
  };
}

function savePodcastProfile(body = {}, reason = "podcast.profile.saved") {
  store.podcast.history ??= [];
  const before = podcastSnapshot();
  Object.assign(store.podcast, podcastProfileFromBody(body));
  store.podcast.slug = slugify(body.slug || store.podcast.slug || store.podcast.title);
  store.podcast.category = store.podcast.primaryCategory || store.podcast.category;
  store.podcast.feedStatus = validatePodcastFeed().valid ? "ACTIVE" : "DRAFT";
  store.podcast.feedHealth = validatePodcastFeed().valid ? "Valid" : "Needs attention";
  const after = podcastSnapshot();
  store.podcast.history.unshift(historyEntry(reason, `Saved podcast details for ${store.podcast.title || "podcast"}.`, { before, after }));
  store.podcast.history = store.podcast.history.slice(0, 100);
  store.activity.unshift(activity(reason, `Saved podcast details for ${store.podcast.title || "podcast"}.`));
  return store.podcast;
}

function send(res, status, payload, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Correlation-Id": randomUUID(),
    "Cache-Control": "no-store"
  });
  res.end(typeof payload === "string" || Buffer.isBuffer(payload) ? payload : JSON.stringify({ ok: status < 400, data: payload }, null, 2));
}

function error(res, status, code, message, details = {}) {
  send(res, status, { error: code, message, details });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

function touchProject(project, content) {
  project.content = content;
  project.status = "READY";
  project.latestVersion = (project.latestVersion || 0) + 1;
  project.updatedAt = now();
  store.versions.unshift(versionFor(project, "Generated or edited output"));
}

function versionFor(project, reason) {
  return {
    id: id("ver"),
    creatorId,
    projectId: project.id,
    version: project.latestVersion || 1,
    reason,
    snapshot: project.content || {},
    createdAt: now()
  };
}

function createProject(module, title, content = {}) {
  const project = {
    id: id("p"),
    creatorId,
    module,
    title: title || `Untitled ${moduleLabels[module] || "Project"}`,
    status: "DRAFT",
    tags: [module],
    latestVersion: 1,
    content,
    createdAt: now(),
    updatedAt: now(),
    archivedAt: null,
    trashedAt: null
  };
  store.projects.unshift(project);
  store.versions.unshift(versionFor(project, "Project created"));
  store.activity.unshift(activity("project.created", `Created ${project.title}.`));
  saveStore();
  return project;
}

function dashboard() {
  const activeProjects = store.projects.filter((project) => !project.trashedAt);
  const storageUsed = store.usage.storageMb >= 1024
    ? `${(store.usage.storageMb / 1024).toFixed(1)} GB`
    : `${store.usage.storageMb} MB`;
  return {
    creator: store.creator,
    stats: {
      totalProjects: activeProjects.length,
      videosProcessed: store.projects.filter((project) => ["subtitle", "storyboard"].includes(project.module)).length,
      podcastEpisodes: store.podcast.episodes.length,
      storageUsed
    },
    projects: activeProjects,
    recentProjects: activeProjects.slice(0, 8),
    jobs: store.jobs.slice(0, 8),
    media: store.media.slice(0, 8),
    exports: store.exports.slice(0, 8),
    notifications: store.notifications.slice(0, 8),
    usage: store.usage,
    activity: store.activity.slice(0, 8),
    podcast: {
      title: store.podcast.title,
      feedUrl: `/rss/${store.podcast.slug}.xml`,
      publicUrl: `/podcasts/${store.podcast.slug}`,
      feedHealth: validatePodcastFeed().valid ? "Valid" : "Needs attention"
    }
  };
}

async function scriptFromBrief(body) {
  const topic = clean(body.topic, "Untitled video");
  const platform = clean(body.platform, "YouTube");
  const duration = clamp(Number(body.duration || 45), 15, 240);
  const tone = clean(body.tone, "Confident");
  const audience = clean(body.audience, "solo creators");
  const language = clean(body.language, store?.creator?.brandSettings?.defaultLanguage || "English");
  const keywords = clean(body.keywords, "");
  const example = clean(body.example, "");
  
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      platform: { type: Type.STRING },
      language: { type: Type.STRING },
      tone: { type: Type.STRING },
      audience: { type: Type.STRING },
      requestedDurationSeconds: { type: Type.INTEGER },
      estimatedDuration: { type: Type.STRING },
      warning: { type: Type.STRING },
      hook: { type: Type.STRING },
      problem: { type: Type.STRING },
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.INTEGER },
            locked: { type: Type.BOOLEAN },
            label: { type: Type.STRING },
            seconds: { type: Type.INTEGER },
            voiceOver: { type: Type.STRING },
            onScreenText: { type: Type.STRING },
            productionNote: { type: Type.STRING }
          },
          required: ["number", "locked", "label", "seconds", "voiceOver", "onScreenText", "productionNote"]
        }
      },
      caption: { type: Type.STRING },
      description: { type: Type.STRING },
      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
      cta: { type: Type.STRING },
      schemaStatus: { type: Type.STRING }
    },
    required: ["title", "platform", "language", "tone", "audience", "requestedDurationSeconds", "estimatedDuration", "warning", "hook", "problem", "scenes", "caption", "description", "hashtags", "cta", "schemaStatus"]
  };

  const prompt = `You are an expert AI script writer for ${platform}. 
Topic: ${topic}
Audience: ${audience}
Tone: ${tone}
Duration: ${duration} seconds
Language: ${language}
Keywords: ${keywords}
CTA: ${clean(body.cta, "Pick one workflow and publish")}
Lock Hook: ${Boolean(body.lockHook)}
Example Reference: ${example}

Write a high-quality, engaging video script.
Provide a captivating 'hook', clearly state the 'problem', and provide the 'cta'. 
Break down the main content into 'scenes'. If 'Lock Hook' is true, make sure the first scene has 'locked: true'.
Make sure the total seconds of all scenes equals exactly ${duration} seconds.
Write compelling voiceOver and clear onScreenText instructions.
Ensure that EVERY item in the 'hashtags' array starts with a '#' symbol.`;

  return generateWithGemini(prompt, schema);
}

async function subtitlesFromBody(body) {
  const title = clean(body.title, "Uploaded creator video");
  const language = clean(body.language, "Auto detect");
  const format = clean(body.format, "SRT");
  const source = clean(body.sourceText, "AI can help you get more done in less time. It can automate repetitive creator tasks. You can focus on what really matters. Export the result and keep editing simple.");
  
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      language: { type: Type.STRING },
      format: { type: Type.STRING },
      media: {
        type: Type.OBJECT,
        properties: {
          acceptedTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
          normalizedAudio: { type: Type.STRING },
          storage: { type: Type.STRING }
        },
        required: ["acceptedTypes", "normalizedAudio", "storage"]
      },
      job: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING },
          status: { type: Type.STRING },
          progressPercent: { type: Type.INTEGER },
          provider: { type: Type.STRING },
          model: { type: Type.STRING },
          resultReference: { type: Type.STRING }
        },
        required: ["id", "type", "status", "progressPercent", "provider", "model", "resultReference"]
      },
      segments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            start: { type: Type.STRING },
            end: { type: Type.STRING },
            text: { type: Type.STRING },
            locked: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER }
          },
          required: ["id", "start", "end", "text", "locked", "confidence"]
        }
      },
      correctionState: { type: Type.STRING },
      schemaStatus: { type: Type.STRING }
    },
    required: ["title", "language", "format", "media", "job", "segments", "correctionState", "schemaStatus"]
  };

  const prompt = `You are a Subtitle Generator AI. 
We don't have the real audio file, so generate a realistic subtitle transcription array based on this seed text:
Seed Text: "${source}"
Language: ${language}
Format: ${format}

Break the seed text into natural subtitle segments. Invent realistic start and end times in SRT format (HH:MM:SS,mmm). Give each segment an ID like "seg-1", "seg-2", etc.
Also return a mock job object indicating "Groq Whisper" was the provider.`;

  return generateWithGemini(prompt, schema);
}

async function thumbnailSuggestions(body) {
  const title = clean(body.title, "");
  if (!title) throw Object.assign(new Error("Video title is required for thumbnail generation."), { status: 400 });
  const concept = clean(body.concept, "");
  
  const schema = {
    type: Type.OBJECT,
    properties: {
      headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
      backgroundQuery: { type: Type.STRING },
      textPosition: { type: Type.STRING },
      subjectPosition: { type: Type.STRING },
      style: { type: Type.STRING },
      overlay: { type: Type.STRING }
    },
    required: ["headlines", "backgroundQuery", "textPosition", "subjectPosition", "style", "overlay"]
  };

  const prompt = `You are an expert YouTube Thumbnail Designer.
Video Title: ${title}
Concept Idea (optional): ${concept}

Generate the metadata for a highly clickable thumbnail.
Provide:
1. headlines: An array of 3 short, punchy, click-worthy headlines (1-4 words each).
2. backgroundQuery: Keywords to search for a stock photo background (e.g. "shocked software developer artificial intelligence").
3. textPosition: Recommended position for the text ("left", "right", "center", "top", "bottom").
4. subjectPosition: Recommended position for the main subject in the photo.
5. style: Overall visual style (e.g., "dramatic technology", "bright and minimal").
6. overlay: Suggested overlay gradient/color (e.g., "dark blue gradient").

Respond strictly in JSON.`;

  try {
    return await generateWithGemini(prompt, schema);
  } catch (error) {
    console.warn("Gemini thumbnail suggestions failed:", error.message);
    if (!groqOpenAi) throw error;
    const response = await groqOpenAi.chat.completions.create({
      model: process.env.GROQ_TEXT_MODEL || "llama-3.1-8b-instant",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON for a YouTube thumbnail metadata object." },
        { role: "user", content: prompt }
      ]
    });
    return JSON.parse(response.choices?.[0]?.message?.content || "{}");
  }
}

async function generateThumbnailImage(body) {
  const title = clean(body.title, "");
  if (!title) throw Object.assign(new Error("Video title is required for thumbnail generation."), { status: 400 });
  const subtitle = clean(body.subtitle, "");
  const style = clean(body.emotion || body.style, "Bold");
  const prompt = `Create a professional YouTube thumbnail background image for the video title: "${title}".
Subtitle/context: "${subtitle}".
Style: ${style}, high contrast, cinematic, modern creator economy, clickable but premium.
16:9 composition, leave the left side clean and dark for large readable overlay text.
Do not include any letters, words, captions, logos, watermark, UI text, or gibberish text inside the image.`;

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return pollinationsThumbnailImage(prompt);
  }

  const providerErrors = [];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${prompt}\nReturn only one image.` }]
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Gemini image generation failed");

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    if (!imagePart) throw new Error("No image bytes returned");

    return {
      imageUrl: `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`,
      imageProvider: "gemini-3.1-flash-image",
      imagePrompt: prompt
    };
  } catch (error) {
    console.warn("Gemini thumbnail image generation failed:", error.message);
    providerErrors.push(`Gemini image: ${error.message}`);
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" }
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Image generation failed");

    const first = data.generatedImages?.[0] || data.predictions?.[0] || {};
    const bytes = first.image?.imageBytes || first.image?.image_bytes || first.bytesBase64Encoded || first.bytes_base64_encoded;
    if (!bytes) throw new Error("No image bytes returned");

    return {
      imageUrl: `data:image/png;base64,${bytes}`,
      imageProvider: "imagen-4.0-generate-001",
      imagePrompt: prompt
    };
  } catch (error) {
    console.warn("Thumbnail image generation failed:", error.message);
    providerErrors.push(`Imagen: ${error.message}`);
    return pollinationsThumbnailImage(prompt, providerErrors);
  }
}

function pollinationsThumbnailImage(prompt, providerErrors = []) {
  const seed = createHash("sha256").update(prompt).digest("hex").slice(0, 12);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&seed=${seed}&model=flux&nologo=true&private=true&enhance=true`;
  return {
    imageUrl,
    imageProvider: "pollinations-flux",
    imagePrompt: prompt,
    imageError: providerErrors.join(" | ")
  };
}

async function storyboardFromBrief(body) {
  const title = clean(body.title, "");
  if (!title) throw Object.assign(new Error("Campaign / video idea is required for storyboard generation."), { status: 400 });
  const duration = clamp(Number(body.duration || 30), 15, 120);
  const requestedScenes = clamp(Number(body.scenes || 5), 3, store?.creator?.limits?.maxStoryboardScenes || 10);
  
  const schema = {
    type: Type.OBJECT,
    properties: {
      concept: { type: Type.STRING },
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sceneNumber: { type: Type.INTEGER },
            duration: { type: Type.INTEGER },
            title: { type: Type.STRING },
            visualDescription: { type: Type.STRING },
            cameraShot: { type: Type.STRING },
            voiceOver: { type: Type.STRING },
            onScreenText: { type: Type.STRING },
            transition: { type: Type.STRING },
            stockSearchQuery: { type: Type.STRING }
          },
          required: ["sceneNumber", "duration", "title", "visualDescription", "cameraShot", "voiceOver", "onScreenText", "transition", "stockSearchQuery"]
        }
      },
      title: { type: Type.STRING }
    },
    required: ["concept", "scenes"]
  };

  const prompt = `You are a strict, no-nonsense Commercial Video Director. 
CRITICAL RULE: The entire storyboard MUST be EXACTLY about the topic: "${title}". 
DO NOT drift into generic ads or unrelated concepts. Every single scene, voiceover, and visual must directly and exclusively focus on "${title}".
If the topic is a personal goal (like "I want to become App developer"), build the narrative around the journey, struggles, or motivation of that specific goal.

Topic: ${title}
Total Duration: ${duration} seconds
Number of Scenes: ${requestedScenes}
Video Type: ${clean(body.goal, "Video")}
Character: ${clean(body.character, "Use the best subject for the campaign")}
Product: ${clean(body.product, "Use the product or topic implied by the campaign")}
Visual Style: ${clean(body.visualStyle, "Choose a fitting cinematic style")}

Create a high-quality, scene-by-scene storyboard. Generate exactly ${requestedScenes} scenes that total exactly ${duration} seconds.
Include camera directions, visual descriptions, voiceovers, on-screen text, transitions, and image-generation search prompts.`;

  try {
    return normalizeStoryboardResult(await generateWithGemini(prompt, schema), title, duration, requestedScenes);
  } catch (error) {
    console.warn("Gemini storyboard generation failed:", error.message);
    if (!groqOpenAi) throw error;
    const response = await groqOpenAi.chat.completions.create({
      model: process.env.GROQ_TEXT_MODEL || "llama-3.1-8b-instant",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON matching a storyboard object with title, concept, and scenes." },
        { role: "user", content: prompt }
      ]
    });
    return normalizeStoryboardResult(JSON.parse(response.choices?.[0]?.message?.content || "{}"), title, duration, requestedScenes);
  }
}

function normalizeStoryboardResult(result, title, totalDuration, requestedScenes) {
  const rawScenes = Array.isArray(result?.scenes) ? result.scenes : [];
  const sceneDuration = Math.max(1, Math.round(totalDuration / requestedScenes));
  const scenes = Array.from({ length: requestedScenes }, (_, index) => {
    const scene = rawScenes[index] || {};
    const start = index * sceneDuration;
    const end = index === requestedScenes - 1 ? totalDuration : Math.min(totalDuration, start + Number(scene.duration || sceneDuration));
    const visualDescription = clean(scene.visualDescription || scene.visual || scene.onScreenText, `${title} scene ${index + 1}`);
    const normalized = {
      sceneNumber: Number(scene.sceneNumber || index + 1),
      number: Number(scene.sceneNumber || index + 1),
      duration: Math.max(1, end - start),
      start: `${start}s`,
      end: `${end}s`,
      title: clean(scene.title || scene.beat || `Scene ${index + 1}`, `Scene ${index + 1}`),
      visualDescription,
      cameraShot: clean(scene.cameraShot || scene.camera || "Medium shot", "Medium shot"),
      voiceOver: clean(scene.voiceOver || scene.vo, ""),
      onScreenText: clean(scene.onScreenText || "", ""),
      transition: clean(scene.transition || "Cut", "Cut"),
      stockSearchQuery: clean(scene.stockSearchQuery || visualDescription, visualDescription)
    };
    normalized.imageUrl = storyboardSceneImageUrl(title, normalized, index);
    normalized.thumbUrl = normalized.imageUrl;
    return normalized;
  });
  return {
    ...result,
    title: clean(result?.title, title),
    concept: clean(result?.concept, title),
    duration: totalDuration,
    scenes
  };
}

function storyboardSceneImageUrl(title, scene, index) {
  const cleanDesc = (scene.visualDescription || title).replace(/[^a-zA-Z0-9., ]/g, "").substring(0, 300);
  const prompt = `Scene ${index + 1}: ${cleanDesc}. Cinematic, no text, no logos`;
  const safePrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${safePrompt}?width=640&height=360&seed=${seed}&nologo=true`;
}

function srtTime(seconds) {
  return `00:00:${String(seconds).padStart(2, "0")},000`;
}

function mmss(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function clean(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function truthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["true", "yes", "1", "on"].includes(String(value || "").trim().toLowerCase());
}

function slugify(value) {
  return clean(value, "podcast")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "podcast";
}

function absoluteUrl(value) {
  const text = String(value || "");
  if (/^https?:\/\//i.test(text)) return text;
  const baseUrl = (process.env.APP_URL || `http://localhost:${activePort}`).replace(/\/$/, "");
  return `${baseUrl}${text.startsWith("/") ? text : `/${text}`}`;
}

function ensurePodcastChannel(seedTitle = "") {
  store.podcast.title ||= `${store.creator.brand || store.creator.name || "CreatorSuite"} Podcast`;
  store.podcast.description ||= seedTitle ? `Episodes from ${store.podcast.title}.` : "Podcast feed published from CreatorSuite.";
  store.podcast.slug ||= slugify(store.podcast.title);
  store.podcast.author ||= store.creator.name || "Creator";
  store.podcast.ownerName ||= store.podcast.author;
  store.podcast.ownerEmail ||= store.creator.email || "creator@example.com";
  store.podcast.language ||= "en";
  store.podcast.country ||= "IN";
  store.podcast.category ||= "Technology";
  store.podcast.primaryCategory ||= store.podcast.category;
  store.podcast.defaultEpisodeAuthor ||= store.podcast.author;
  store.podcast.defaultEpisodeLanguage ||= store.podcast.language;
  store.podcast.feedStatus ||= "DRAFT";
  store.podcast.feedHealth ||= "Needs attention";
}

function podcastConfigured() {
  return Boolean(store.podcast.title && store.podcast.slug && store.podcast.description && store.podcast.author && store.podcast.ownerEmail);
}

function publicEpisodeUrl(episodeItem) {
  return absoluteUrl(`/podcast/${store.podcast.slug}/${episodeItem.slug}`);
}

function findEpisode(episodeId) {
  return store.podcast.episodes.find((item) => item.id === episodeId);
}

function publishedEpisodes() {
  const nowTime = Date.now();
  return store.podcast.episodes
    .map(normalizeEpisode)
    .filter((episodeItem) => episodeItem.status === "PUBLISHED"
      && new Date(episodeItem.publishedAt || episodeItem.date).getTime() <= nowTime
      && episodeItem.audioUrl
      && episodeItem.audioFileSize
      && episodeItem.audioMimeType)
    .sort((a, b) => new Date(b.publishedAt || b.date) - new Date(a.publishedAt || a.date));
}

function podcastStats() {
  const episodes = store.podcast.episodes.map(normalizeEpisode);
  const durationSeconds = episodes.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
  const storageBytes = episodes.reduce((sum, item) => sum + Number(item.audioFileSize || item.bytes || 0), 0);
  return {
    totalEpisodes: episodes.length,
    publishedEpisodes: episodes.filter((item) => item.status === "PUBLISHED").length,
    draftEpisodes: episodes.filter((item) => item.status === "DRAFT").length,
    scheduledEpisodes: episodes.filter((item) => item.status === "SCHEDULED").length,
    processingEpisodes: episodes.filter((item) => ["UPLOADING", "PROCESSING"].includes(item.status)).length,
    totalPodcastDuration: formatDurationServer(durationSeconds),
    storageUsed: `${(storageBytes / 1024 / 1024).toFixed(1)} MB`,
    rssFeedStatus: validatePodcastFeed().valid ? "Valid" : "Needs attention"
  };
}

function formatDurationServer(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function durationSecondsFromText(value) {
  const parts = String(value || "0").split(":").map(Number);
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return Number(value) || 0;
}

function audioMetadata(filePath) {
  const wavFallback = () => {
    try {
      const buffer = readFileSync(filePath);
      if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
        return { durationSeconds: 0, duration: "00:00", bitrate: 0, formatName: "" };
      }
      const channels = buffer.readUInt16LE(22);
      const sampleRate = buffer.readUInt32LE(24);
      const bitsPerSample = buffer.readUInt16LE(34);
      const dataIndex = buffer.indexOf(Buffer.from("data"));
      const dataSize = dataIndex >= 0 ? buffer.readUInt32LE(dataIndex + 4) : Math.max(0, buffer.length - 44);
      const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
      const durationSeconds = bytesPerSecond ? dataSize / bytesPerSecond : 0;
      return {
        durationSeconds,
        duration: formatDurationServer(durationSeconds),
        bitrate: Math.round(bytesPerSecond * 8),
        formatName: "wav"
      };
    } catch {
      return { durationSeconds: 0, duration: "00:00", bitrate: 0, formatName: "" };
    }
  };
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        resolve(wavFallback());
        return;
      }
      const durationSeconds = Number(data?.format?.duration || 0);
      if (!durationSeconds) {
        resolve(wavFallback());
        return;
      }
      resolve({
        durationSeconds,
        duration: formatDurationServer(durationSeconds),
        bitrate: Number(data?.format?.bit_rate || 0),
        formatName: data?.format?.format_name || ""
      });
    });
  });
}

function episodeValidation(episodeItem) {
  const errors = [];
  if (!episodeItem.title) errors.push("Episode title is required.");
  if (!episodeItem.description) errors.push("Episode description is required.");
  if (!episodeItem.audioUrl) errors.push("Episode audio URL is required.");
  if (!episodeItem.audioFileSize) errors.push("Audio file size is required.");
  if (!episodeItem.audioMimeType || !episodeItem.audioMimeType.startsWith("audio/")) errors.push("Valid audio MIME type is required.");
  if (!episodeItem.duration && !episodeItem.durationSeconds) errors.push("Episode duration is required.");
  return errors;
}

function validatePodcastFeed() {
  const issues = [];
  const warnings = [];
  if (!store.podcast.title) issues.push("Podcast title is required.");
  if (!store.podcast.description) issues.push("Podcast description is required.");
  if (!store.podcast.language) issues.push("Podcast language is required.");
  if (!store.podcast.author) issues.push("Podcast author is required.");
  if (!store.podcast.ownerEmail) issues.push("Owner email is required.");
  if (!store.podcast.coverImageUrl && !store.podcast.coverUrl) issues.push("Podcast cover image is required for Spotify submission.");

  const guidSet = new Set();
  store.podcast.episodes.forEach((episodeItem) => {
    if (episodeItem.guid) {
      if (guidSet.has(episodeItem.guid)) issues.push(`Duplicate GUID found for ${episodeItem.title || episodeItem.id}.`);
      guidSet.add(episodeItem.guid);
    }
    if (episodeItem.status === "PUBLISHED") {
      episodeValidation(normalizeEpisode(episodeItem)).forEach((message) => issues.push(`${episodeItem.title || episodeItem.id}: ${message}`));
      if (episodeItem.publishedAt && new Date(episodeItem.publishedAt).getTime() > Date.now()) {
        issues.push(`${episodeItem.title || episodeItem.id}: future published episode is not allowed in RSS.`);
      }
    }
  });

  const results = [
    ...issues.map((message) => ({ level: "error", message })),
    ...warnings.map((message) => ({ level: "warning", message }))
  ];
  return {
    valid: issues.length === 0 && publishedEpisodes().length > 0,
    issues,
    warnings,
    results,
    passed: issues.length === 0,
    publishedEpisodeCount: publishedEpisodes().length,
    lastGeneratedAt: now()
  };
}

function publishEpisode(episodeItem, dateValue = now()) {
  const normalized = normalizeEpisode(episodeItem);
  const errors = episodeValidation(normalized);
  if (!podcastConfigured()) errors.unshift("Podcast profile is incomplete.");
  if (errors.length) throw Object.assign(new Error(errors.join(" ")), { status: 400 });
  Object.assign(episodeItem, normalized, {
    status: "PUBLISHED",
    publishedAt: dateValue,
    date: dateValue,
    scheduledAt: null,
    guid: normalized.guid || `${store.podcast.slug}-${episodeItem.id}`,
    updatedAt: now()
  });
  store.podcast.feedStatus = "ACTIVE";
  store.podcast.feedHealth = validatePodcastFeed().issues.length ? "Needs attention" : "Valid";
  store.podcast.lastPublishedAt = now();
  return episodeItem;
}

function publishDueScheduled() {
  let changed = false;
  const nowTime = Date.now();
  store.podcast.episodes.forEach((episodeItem) => {
    if (episodeItem.status === "SCHEDULED" && episodeItem.scheduledAt && new Date(episodeItem.scheduledAt).getTime() <= nowTime) {
      try {
        publishEpisode(episodeItem, episodeItem.scheduledAt);
        store.activity.unshift(activity("episode.scheduled_published", `Scheduled episode ${episodeItem.title} published.`));
        changed = true;
      } catch (error) {
        episodeItem.status = "FAILED";
        episodeItem.errorMessage = error.message;
        changed = true;
      }
    }
  });
  if (changed) saveStore();
}

async function generatePodcastJson(prompt) {
  if (!groqOpenAi) throw new Error("AI text API is not configured.");
  const response = await groqOpenAi.chat.completions.create({
    model: process.env.GROQ_TEXT_MODEL || "llama-3.1-8b-instant",
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return only valid JSON. No markdown." },
      { role: "user", content: prompt }
    ]
  });
  return JSON.parse(response.choices?.[0]?.message?.content || "{}");
}

async function receivePodcastAudio(req, res) {
  await runMiddleware(req, res, upload.single("file"));
  if (!req.file) throw Object.assign(new Error("No file uploaded"), { status: 400 });

  const fs = require("node:fs");
  const path = require("node:path");
  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowed = new Set([".mp3", ".m4a", ".wav", ".aac", ".flac"]);
  if (!allowed.has(ext)) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw Object.assign(new Error("Unsupported audio format. Upload MP3, M4A, WAV, AAC or FLAC."), { status: 400 });
  }
  const maxBytes = Number(store.podcast.settings?.maxAudioFileSizeMb || 200) * 1024 * 1024;
  if (req.file.size > maxBytes) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw Object.assign(new Error(`Audio file is too large. Maximum size is ${store.podcast.settings?.maxAudioFileSizeMb || 200} MB.`), { status: 400 });
  }

  const inferredMimeType = mimeTypes[ext] || req.file.mimetype || "audio/mpeg";
  let storedPath = req.file.path;
  if (ext && !storedPath.endsWith(ext)) {
    storedPath = `${req.file.path}${ext}`;
    fs.renameSync(req.file.path, storedPath);
  }
  const metadata = await audioMetadata(storedPath);
  const objectKey = `podcasts/${id("audio")}${ext}`;
  const hasObjectStorage = Boolean(s3Client && objectBucketName && objectPublicBaseUrl && !truthy(process.env.USE_LOCAL_UPLOADS));
  let publicUrl = `/uploads/${path.basename(storedPath)}`;
  let storageKey = "";
  let storageProvider = "local";
  let storageWarning = "";

  if (hasObjectStorage) {
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: objectBucketName,
        Key: objectKey,
        Body: fs.createReadStream(storedPath),
        ContentType: inferredMimeType
      }));
      publicUrl = `${objectPublicBaseUrl}/${objectKey}`;
      storageKey = objectKey;
      storageProvider = "object-storage";
      if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    } catch (err) {
      console.error("Object storage upload failed:", err);
      storageWarning = "Object storage upload failed; saved audio in local uploads.";
    }
  } else {
    console.warn("Object storage is not configured; keeping podcast audio in local uploads.");
    storageWarning = "Object storage is not configured; saved audio in local uploads.";
  }

  return {
    url: publicUrl,
    storageKey,
    storageProvider,
    storageWarning,
    bytes: req.file.size,
    mimeType: inferredMimeType,
    audioFileName: req.file.originalname,
    ...metadata
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function createGenerationProject(module, title, content, generationJob) {
  const project = createProject(module, title, content);
  project.status = "READY";
  project.updatedAt = now();
  if (generationJob) {
    generationJob.projectId = project.id;
    generationJob.resultReference = project.id;
    store.jobs.unshift(generationJob);
  }
  store.activity.unshift(activity(`${module}.generated`, `${moduleLabels[module]} output generated for ${project.title}.`));
  saveStore();
  return { project, result: content };
}

function rssXml() {
  publishDueScheduled();
  const published = publishedEpisodes();
  const items = published.map((episodeItem) => `
    <item>
      <title>${escapeXml(episodeItem.title)}</title>
      <description>${escapeXml(episodeItem.description)}</description>
      <link>${escapeXml(publicEpisodeUrl(episodeItem))}</link>
      <guid isPermaLink="false">${escapeXml(episodeItem.guid)}</guid>
      <pubDate>${new Date(episodeItem.publishedAt || episodeItem.date).toUTCString()}</pubDate>
      <enclosure url="${escapeXml(absoluteUrl(episodeItem.audioUrl))}" length="${episodeItem.audioFileSize}" type="${escapeXml(episodeItem.audioMimeType)}" />
      <itunes:duration>${escapeXml(episodeItem.duration)}</itunes:duration>
      <itunes:episode>${episodeItem.episodeNumber}</itunes:episode>
      <itunes:season>${episodeItem.seasonNumber}</itunes:season>
      <itunes:episodeType>${escapeXml(String(episodeItem.episodeType || "Full").toLowerCase())}</itunes:episodeType>
      <itunes:explicit>${episodeItem.explicit ? "yes" : "no"}</itunes:explicit>
      ${episodeItem.coverImageUrl ? `<itunes:image href="${escapeXml(absoluteUrl(episodeItem.coverImageUrl))}" />` : ""}
      ${episodeItem.author ? `<itunes:author>${escapeXml(episodeItem.author)}</itunes:author>` : ""}
    </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(store.podcast.title)}</title>
    <link>${escapeXml(absoluteUrl(`/podcasts/${store.podcast.slug}`))}</link>
    <atom:link href="${escapeXml(absoluteUrl(`/rss/${store.podcast.slug}.xml`))}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(store.podcast.description)}</description>
    <language>${escapeXml(store.podcast.language)}</language>
    <managingEditor>${escapeXml(store.podcast.ownerEmail)} (${escapeXml(store.podcast.author)})</managingEditor>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <copyright>${escapeXml(store.podcast.copyright || `Copyright ${new Date().getFullYear()} ${store.podcast.author || store.podcast.title}`)}</copyright>
    <category>${escapeXml(store.podcast.primaryCategory || store.podcast.category)}</category>
    <itunes:author>${escapeXml(store.podcast.author)}</itunes:author>
    <itunes:owner><itunes:name>${escapeXml(store.podcast.ownerName || store.podcast.author)}</itunes:name><itunes:email>${escapeXml(store.podcast.ownerEmail)}</itunes:email></itunes:owner>
    <itunes:category text="${escapeXml(store.podcast.primaryCategory || store.podcast.category || "Technology")}" />
    ${store.podcast.coverImageUrl || store.podcast.coverUrl ? `<image><url>${escapeXml(absoluteUrl(store.podcast.coverImageUrl || store.podcast.coverUrl))}</url><title>${escapeXml(store.podcast.title)}</title><link>${escapeXml(absoluteUrl(`/podcasts/${store.podcast.slug}`))}</link></image>` : ""}
    ${store.podcast.coverImageUrl || store.podcast.coverUrl ? `<itunes:image href="${escapeXml(absoluteUrl(store.podcast.coverImageUrl || store.podcast.coverUrl))}" />` : ""}
    <itunes:explicit>${store.podcast.explicit ? "yes" : "no"}</itunes:explicit>
    <itunes:type>${escapeXml(String(store.podcast.podcastType || "Episodic").toLowerCase())}</itunes:type>${items}
  </channel>
</rss>`;
}

function publicPodcastPage() {
  publishDueScheduled();
  const episodes = publishedEpisodes();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeXml(store.podcast.title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="public-page">
  <main class="public-shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Public podcast page</p>
        <h2>${escapeXml(store.podcast.title)}</h2>
        <p>${escapeXml(store.podcast.description)}</p>
        <p><a class="public-link" href="/rss/${store.podcast.slug}.xml">RSS Feed</a></p>
      </div>
    </section>
    <section class="panel">
      <h2>Episodes</h2>
      <div class="list">
        ${episodes.map((episodeItem) => `<article class="row"><div><strong>${escapeXml(episodeItem.title)}</strong><p class="muted">${escapeXml(episodeItem.description)}</p><audio controls src="${escapeXml(absoluteUrl(episodeItem.audioUrl))}"></audio></div><a class="badge green" href="/podcast/${store.podcast.slug}/${episodeItem.slug}">${escapeXml(episodeItem.duration)}</a></article>`).join("") || '<p class="muted">No published episodes yet.</p>'}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function publicEpisodePage(episodeItem) {
  const item = normalizeEpisode(episodeItem);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeXml(item.title)} - ${escapeXml(store.podcast.title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="public-page">
  <main class="public-shell">
    <section class="hero">
      <div>
        <p class="eyebrow">${escapeXml(store.podcast.title)}</p>
        <h2>${escapeXml(item.title)}</h2>
        <p>${escapeXml(item.description)}</p>
        <p><a class="public-link" href="/podcast/${store.podcast.slug}">Back to Podcast</a></p>
      </div>
    </section>
    <section class="panel">
      <audio controls src="${escapeXml(absoluteUrl(item.audioUrl))}" style="width:100%;"></audio>
      <div class="list" style="margin-top:24px;">
        <article class="row"><strong>Published</strong><span>${escapeXml(new Date(item.publishedAt || item.date).toLocaleDateString())}</span></article>
        <article class="row"><strong>Duration</strong><span>${escapeXml(item.duration)}</span></article>
        <article class="row"><strong>Episode</strong><span>S${item.seasonNumber} E${item.episodeNumber}</span></article>
      </div>
      ${item.showNotes?.length ? `<h2>Show Notes</h2><ul>${item.showNotes.map((note) => `<li>${escapeXml(note)}</li>`).join("")}</ul>` : ""}
      ${item.chapters?.length ? `<h2>Chapters</h2><ul>${item.chapters.map((chapter) => `<li>${escapeXml(chapter.startTime || chapter.start || chapter.timestamp || "00:00")} ${escapeXml(chapter.title || "")}</li>`).join("")}</ul>` : ""}
      ${item.transcript ? `<h2>Transcript</h2><p>${escapeXml(item.transcript)}</p>` : ""}
    </section>
  </main>
</body>
</html>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;"
  })[char]);
}

function exportText(type, data) {
  if (type === "srt") {
    return (data.segments || []).map((segment, index) => `${index + 1}\n${segment.start} --> ${segment.end}\n${segment.text}\n`).join("\n");
  }
  if (type === "vtt") {
    return `WEBVTT\n\n${(data.segments || []).map((segment) => `${segment.start.replace(",", ".")} --> ${segment.end.replace(",", ".")}\n${segment.text}\n`).join("\n")}`;
  }
  if (type === "txt") {
    return (data.segments || data.scenes || []).map((item) => item.text || item.voiceOver || item.visual || "").join("\n");
  }
  if (type === "shot-list") {
    return (data.scenes || []).map((scene) => `${scene.number}. ${scene.beat} | ${scene.start}-${scene.end} | ${scene.visual} | ${scene.camera}`).join("\n");
  }
  if (type === "voice-over") {
    return (data.scenes || []).map((scene) => `Scene ${scene.number} - ${scene.beat}\n${scene.voiceOver}`).join("\n\n");
  }
  if (type === "caption-pack") {
    return JSON.stringify({
      caption: data.caption || "Generated caption pack",
      hashtags: data.hashtags || ["#CreatorTools"],
      scenes: data.scenes || []
    }, null, 2);
  }
  return JSON.stringify(data, null, 2);
}

function createExport(type, projectId, payload) {
  const filename = `${type}-${Date.now()}.txt`;
  const exportItem = {
    id: id("exp"),
    creatorId,
    projectId,
    type,
    filename,
    status: "READY",
    content: exportText(type, payload || {}),
    createdAt: now(),
    expiresAt: addDays(store.creator.retention.exportExpiryDays)
  };
  store.exports.unshift(exportItem);
  store.jobs.unshift(job("export", projectId || "", "DONE", 100, "Local export", type, exportItem.id));
  store.notifications.unshift(notification("Export ready", `${filename} is available in Exports.`, "export", exportItem.id));
  store.activity.unshift(activity("export.created", `Created ${filename}.`));
  saveStore();
  return exportItem;
}

function routeParam(pathname, prefix) {
  return decodeURIComponent(pathname.slice(prefix.length));
}

function createPodcastEpisodeFromBody(body) {
  const title = clean(body.title, "");
  if (!title) throw Object.assign(new Error("Episode title is required."), { status: 400 });
  const status = ["DRAFT", "READY", "PUBLISHED", "SCHEDULED"].includes(String(body.status || "").toUpperCase())
    ? String(body.status).toUpperCase()
    : "DRAFT";
  if (["PUBLISHED", "SCHEDULED"].includes(status) && !body.audioUrl) {
    throw Object.assign(new Error("Audio upload is required before publishing."), { status: 400 });
  }

  if (!podcastConfigured()) ensurePodcastChannel(title);
  const episodeItem = normalizeEpisode(episode(id("ep"), title, status, body.date || now(), clean(body.duration, "00:00"), Number(body.bytes || body.audioFileSize || 0)));
  Object.assign(episodeItem, {
    slug: slugify(body.slug || title),
    subtitle: clean(body.subtitle, ""),
    description: clean(body.description, ""),
    season: Number(body.season || body.seasonNumber || 1),
    seasonNumber: Number(body.seasonNumber || body.season || 1),
    episodeNumber: Number(body.episodeNumber || store.podcast.episodes.length + 1),
    episodeType: clean(body.episodeType, "Full"),
    author: clean(body.author, store.podcast.defaultEpisodeAuthor || store.podcast.author || ""),
    language: clean(body.language, store.podcast.defaultEpisodeLanguage || store.podcast.language || "en"),
    keywords: Array.isArray(body.keywords) ? body.keywords : String(body.keywords || "").split(",").map((value) => value.trim()).filter(Boolean),
    explicit: truthy(body.explicit),
    audioUrl: clean(body.audioUrl, ""),
    audioStorageKey: clean(body.audioStorageKey || body.storageKey, ""),
    audioFileName: clean(body.audioFileName || body.fileName, ""),
    audioFileSize: Number(body.audioFileSize || body.bytes || 0),
    bytes: Number(body.audioFileSize || body.bytes || 0),
    audioMimeType: clean(body.audioMimeType || body.mimeType, "audio/mpeg"),
    mimeType: clean(body.audioMimeType || body.mimeType, "audio/mpeg"),
    duration: clean(body.duration, "00:00"),
    durationSeconds: Number(body.durationSeconds || durationSecondsFromText(body.duration)),
    coverImageUrl: clean(body.coverImageUrl, ""),
    transcript: clean(body.transcript, ""),
    showNotes: Array.isArray(body.showNotes) ? body.showNotes : [],
    showNotesJson: body.showNotesJson || {},
    chapters: Array.isArray(body.chapters) ? body.chapters : [],
    chaptersJson: Array.isArray(body.chaptersJson) ? body.chaptersJson : body.chapters || [],
    guests: Array.isArray(body.guests) ? body.guests : [],
    scheduledAt: status === "SCHEDULED" ? clean(body.scheduledAt || body.date, now()) : null,
    publishedAt: status === "PUBLISHED" ? now() : null,
    guid: body.guid || `${store.podcast.slug || "podcast"}-${id("guid")}`,
    updatedAt: now()
  });
  if (status === "PUBLISHED") publishEpisode(episodeItem);
  store.podcast.episodes.unshift(episodeItem);
  store.projects.unshift({
    id: id("p"),
    creatorId,
    module: "podcast",
    title: episodeItem.title,
    status: episodeItem.status,
    tags: ["podcast"],
    latestVersion: 1,
    content: { episodeId: episodeItem.id, ...episodeItem },
    createdAt: now(),
    updatedAt: now(),
    archivedAt: null,
    trashedAt: null
  });
  store.activity.unshift(activity("episode.created", `${status === "PUBLISHED" ? "Published" : status === "SCHEDULED" ? "Scheduled" : "Created"} podcast episode ${episodeItem.title}.`));
  saveStore();
  return episodeItem;
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

async function currentUserFromRequest(req) {
  const payload = verifyToken(bearerToken(req));
  if (!payload) return null;
  return findUserById(payload.sub);
}

async function requireApiUser(req, res) {
  const user = await currentUserFromRequest(req);
  if (!user) {
    error(res, 401, "unauthorized", "Please sign in to continue.");
    return null;
  }
  await loadStoreForUser(user);
  return user;
}

async function handleAuthApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/auth/signup") {
    const body = await parseBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(res, 400, "bad_request", "Valid email is required.");
    if (password.length < 6) return error(res, 400, "bad_request", "Password must be at least 6 characters.");
    const existing = await findUserByEmail(email);
    if (existing) return error(res, 409, "email_exists", "Account already exists. Please sign in.");
    const user = await createUserRecord({ email, password, name: body.name });
    await loadStoreForUser(user);
    return send(res, 201, { token: signToken(user), user: publicUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const user = await findUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return error(res, 401, "invalid_credentials", "Email or password is incorrect.");
    }
    await loadStoreForUser(user);
    return send(res, 200, { token: signToken(user), user: publicUser(user) });
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    const user = await currentUserFromRequest(req);
    if (!user) return error(res, 401, "unauthorized", "Please sign in to continue.");
    await loadStoreForUser(user);
    return send(res, 200, { user: publicUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    return send(res, 200, { signedOut: true });
  }

  return error(res, 404, "not_found", "Auth route not found.");
}

async function handleApi(req, res, pathname, searchParams) {
  if (pathname.startsWith("/api/auth/")) return handleAuthApi(req, res, pathname);
  const user = await requireApiUser(req, res);
  if (!user) return;
  publishDueScheduled();
  if (req.method === "GET" && pathname === "/api/dashboard") return send(res, 200, dashboard());
  if (req.method === "GET" && pathname === "/api/projects") return send(res, 200, store.projects.filter((project) => !project.trashedAt));
  if (req.method === "GET" && pathname === "/api/media") return send(res, 200, store.media);
  if (req.method === "GET" && pathname === "/api/jobs") return send(res, 200, store.jobs);
  if (req.method === "GET" && pathname === "/api/exports") return send(res, 200, store.exports);
  if (req.method === "GET" && pathname === "/api/activity") return send(res, 200, store.activity);
  if (req.method === "GET" && pathname === "/api/notifications") return send(res, 200, store.notifications);
  if (req.method === "GET" && pathname === "/api/settings") return send(res, 200, store.creator);
  if (req.method === "GET" && (pathname === "/api/podcasts" || pathname === "/api/podcasts/current")) {
    return send(res, 200, podcastResponse());
  }

  if (req.method === "POST" && pathname === "/api/podcasts") {
    const body = await parseBody(req);
    savePodcastProfile(body, "podcast.profile.created");
    await saveStore();
    return send(res, 200, podcastResponse());
  }

  if (req.method === "PATCH" && /^\/api\/podcasts\/[^/]+$/.test(pathname)) {
    const body = await parseBody(req);
    savePodcastProfile(body, "podcast.profile.updated");
    await saveStore();
    return send(res, 200, podcastResponse());
  }

  if (req.method === "DELETE" && /^\/api\/podcasts\/[^/]+$/.test(pathname)) {
    store.podcast = defaultStore().podcast;
    store.projects = store.projects.filter((item) => item.module !== "podcast");
    store.activity.unshift(activity("podcast.deleted", "Podcast profile and private episode records were reset."));
    saveStore();
    return send(res, 200, store.podcast);
  }

  if (req.method === "GET" && /^\/api\/podcasts\/[^/]+\/episodes$/.test(pathname)) {
    return send(res, 200, store.podcast.episodes.map(normalizeEpisode));
  }

  if (req.method === "POST" && /^\/api\/podcasts\/[^/]+\/episodes$/.test(pathname)) {
    try {
      return send(res, 201, createPodcastEpisodeFromBody(await parseBody(req)));
    } catch (error) {
      return send(res, error.status || 500, { message: error.message || "Episode creation failed" });
    }
  }

  if (req.method === "GET" && pathname.startsWith("/api/episodes/")) {
    const episodeId = pathname.split("/")[3];
    const episodeItem = findEpisode(episodeId);
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    return send(res, 200, normalizeEpisode(episodeItem));
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/episodes/")) {
    const episodeId = pathname.split("/")[3];
    const episodeItem = findEpisode(episodeId);
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    Object.assign(episodeItem, await parseBody(req), { updatedAt: now() });
    const normalized = normalizeEpisode(episodeItem);
    Object.assign(episodeItem, normalized);
    saveStore();
    return send(res, 200, episodeItem);
  }

  if (req.method === "DELETE" && /^\/api\/episodes\/[^/]+$/.test(pathname)) {
    const episodeId = pathname.split("/")[3];
    const before = store.podcast.episodes.length;
    store.podcast.episodes = store.podcast.episodes.filter((item) => item.id !== episodeId);
    store.projects = store.projects.filter((item) => item.content?.episodeId !== episodeId);
    saveStore();
    return send(res, 200, { deleted: before !== store.podcast.episodes.length });
  }

  if (req.method === "POST" && /^\/api\/episodes\/[^/]+\/(upload-audio|replace-audio)$/.test(pathname)) {
    const [, , , episodeId] = pathname.split("/");
    const episodeItem = findEpisode(episodeId);
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    try {
      const uploaded = await receivePodcastAudio(req, res);
      Object.assign(episodeItem, {
        audioUrl: uploaded.url,
        audioStorageKey: uploaded.storageKey,
        audioFileName: uploaded.audioFileName,
        audioFileSize: uploaded.bytes,
        bytes: uploaded.bytes,
        audioMimeType: uploaded.mimeType,
        mimeType: uploaded.mimeType,
        duration: uploaded.duration,
        durationSeconds: uploaded.durationSeconds,
        status: episodeItem.status === "PUBLISHED" ? "UNPUBLISHED" : "READY",
        updatedAt: now()
      });
      saveStore();
      return send(res, 200, normalizeEpisode(episodeItem));
    } catch (error) {
      return send(res, error.status || 500, { message: error.message || "Audio upload failed" });
    }
  }

  if (req.method === "DELETE" && /^\/api\/episodes\/[^/]+\/audio$/.test(pathname)) {
    const [, , , episodeId] = pathname.split("/");
    const episodeItem = findEpisode(episodeId);
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    if (episodeItem.audioUrl?.startsWith("/uploads/")) {
      const localPath = normalize(join(__dirname, episodeItem.audioUrl.replace(/^\/+/, "")));
      const uploadRoot = normalize(join(__dirname, "uploads"));
      try {
        if (localPath.startsWith(uploadRoot) && existsSync(localPath)) unlinkSync(localPath);
      } catch {}
    }
    Object.assign(episodeItem, {
      audioUrl: "",
      audioStorageKey: "",
      audioFileName: "",
      audioFileSize: 0,
      bytes: 0,
      duration: "00:00",
      durationSeconds: 0,
      status: episodeItem.status === "PUBLISHED" ? "UNPUBLISHED" : "DRAFT",
      updatedAt: now()
    });
    saveStore();
    return send(res, 200, normalizeEpisode(episodeItem));
  }

  if (req.method === "POST" && /^\/api\/episodes\/[^/]+\/(publish|schedule|unpublish|archive)$/.test(pathname)) {
    const [, , , episodeId, actionName] = pathname.split("/");
    const episodeItem = findEpisode(episodeId);
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    const body = await parseBody(req);
    try {
      if (actionName === "publish") publishEpisode(episodeItem);
      if (actionName === "schedule") Object.assign(episodeItem, { status: "SCHEDULED", scheduledAt: clean(body.scheduledAt, now()), updatedAt: now() });
      if (actionName === "unpublish") Object.assign(episodeItem, { status: "UNPUBLISHED", updatedAt: now() });
      if (actionName === "archive") Object.assign(episodeItem, { status: "ARCHIVED", updatedAt: now() });
      saveStore();
      return send(res, 200, normalizeEpisode(episodeItem));
    } catch (error) {
      return send(res, error.status || 500, { message: error.message || "Episode action failed" });
    }
  }

  if (req.method === "POST" && /^\/api\/episodes\/[^/]+\/transcribe$/.test(pathname)) {
    const episodeId = pathname.split("/")[3];
    const episodeItem = findEpisode(episodeId);
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    if (!episodeItem.audioUrl?.startsWith("/uploads/")) return send(res, 400, { message: "Local uploaded audio is required for transcription." });
    const fs = require("node:fs");
    const localPath = normalize(join(__dirname, episodeItem.audioUrl.replace(/^\/+/, "")));
    const uploadRoot = normalize(join(__dirname, "uploads"));
    if (!localPath.startsWith(uploadRoot) || !existsSync(localPath)) return send(res, 404, { message: "Audio file not found." });
    try {
      const transcription = await groqOpenAi.audio.transcriptions.create({
        file: fs.createReadStream(localPath),
        model: "whisper-large-v3-turbo",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"]
      });
      episodeItem.transcript = transcription.text || "";
      episodeItem.transcriptSegments = (transcription.segments || []).map((segment) => ({
        start: formatDurationServer(segment.start || 0),
        end: formatDurationServer(segment.end || 0),
        text: String(segment.text || "").trim()
      })).filter((segment) => segment.text);
      episodeItem.updatedAt = now();
      saveStore();
      return send(res, 200, { transcript: episodeItem.transcript, segments: episodeItem.transcriptSegments });
    } catch (error) {
      return send(res, 500, { message: error.message || "Transcription failed" });
    }
  }

  if (req.method === "POST" && /^\/api\/episodes\/[^/]+\/generate-(title|description|show-notes|chapters|keywords)$/.test(pathname)) {
    const [, , , episodeId, actionPart] = pathname.split("/");
    const episodeItem = findEpisode(episodeId);
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    const task = actionPart.replace("generate-", "");
    const prompt = `Podcast episode:
Title: ${episodeItem.title}
Description: ${episodeItem.description}
Transcript: ${(episodeItem.transcript || "").slice(0, 12000)}

Generate ${task} as JSON. For title return {"titles":[]}. For description return {"shortDescription":"","fullDescription":"","seoDescription":""}. For show-notes return {"summary":"","mainTopics":[],"keyTakeaways":[],"resources":[],"guestSummary":"","callToAction":""}. For chapters return {"chapters":[{"startTime":"00:00","title":"","description":""}]}. For keywords return {"keywords":[]}.`;
    try {
      const result = await generatePodcastJson(prompt);
      if (task === "description") episodeItem.description = result.fullDescription || result.shortDescription || episodeItem.description;
      if (task === "show-notes") episodeItem.showNotesJson = result;
      if (task === "chapters") episodeItem.chapters = result.chapters || [];
      if (task === "keywords") episodeItem.keywords = result.keywords || [];
      episodeItem.updatedAt = now();
      saveStore();
      return send(res, 200, result);
    } catch (error) {
      return send(res, 500, { message: error.message || "AI generation failed" });
    }
  }

  if (req.method === "GET" && /^\/api\/podcasts\/[^/]+\/rss-preview$/.test(pathname)) {
    return send(res, 200, { xml: rssXml(), validation: validatePodcastFeed() });
  }

  if (req.method === "GET" && /^\/api\/podcasts\/[^/]+\/validate-rss$/.test(pathname)) {
    return send(res, 200, validatePodcastFeed());
  }

  if (req.method === "POST" && /^\/api\/podcasts\/[^/]+\/refresh-rss$/.test(pathname)) {
    store.podcast.feedHealth = validatePodcastFeed().valid ? "Valid" : "Needs attention";
    store.podcast.lastGeneratedAt = now();
    saveStore();
    return send(res, 200, { xml: rssXml(), validation: validatePodcastFeed() });
  }

  if (req.method === "GET" && pathname.startsWith("/api/projects/")) {
    const project = store.projects.find((item) => item.id === routeParam(pathname, "/api/projects/"));
    if (!project) return error(res, 404, "not_found", "Project not found.");
    return send(res, 200, { ...project, versions: store.versions.filter((version) => version.projectId === project.id), media: store.media.filter((asset) => asset.projectId === project.id), exports: store.exports.filter((item) => item.projectId === project.id) });
  }

  if (req.method === "POST" && pathname === "/api/projects") {
    const body = await parseBody(req);
    return send(res, 201, createProject(clean(body.module, "script"), clean(body.title, "Untitled Creator Project"), body.content || {}));
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/projects/")) {
    const body = await parseBody(req);
    const project = store.projects.find((item) => item.id === routeParam(pathname, "/api/projects/"));
    if (!project) return error(res, 404, "not_found", "Project not found.");
    Object.assign(project, {
      title: body.title ?? project.title,
      status: body.status ?? project.status,
      tags: body.tags ?? project.tags,
      content: body.content ?? project.content,
      updatedAt: now()
    });
    project.latestVersion += 1;
    store.versions.unshift(versionFor(project, "Manual save"));
    store.activity.unshift(activity("project.saved", `Saved ${project.title}.`));
    saveStore();
    return send(res, 200, project);
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/projects/")) {
    const project = store.projects.find((item) => item.id === routeParam(pathname, "/api/projects/"));
    if (!project) return error(res, 404, "not_found", "Project not found.");
    project.status = "TRASH";
    project.trashedAt = now();
    store.activity.unshift(activity("project.trashed", `${project.title} moved to recoverable trash.`));
    saveStore();
    return send(res, 200, project);
  }

  if (req.method === "PATCH" && pathname === "/api/settings") {
    const body = await parseBody(req);
    store.creator = {
      ...store.creator,
      name: body.name ?? store.creator.name,
      brand: body.brand ?? store.creator.brand,
      timezone: body.timezone ?? store.creator.timezone,
      limits: { ...store.creator.limits, ...(body.limits || {}) },
      brandSettings: { ...store.creator.brandSettings, ...(body.brandSettings || {}) },
      providers: { ...store.creator.providers, ...(body.providers || {}) }
    };
    store.activity.unshift(activity("settings.updated", "Personal settings updated."));
    saveStore();
    return send(res, 200, store.creator);
  }

  if (req.method === "POST" && pathname === "/api/media") {
    const body = await parseBody(req);
    const filename = clean(body.filename, "upload.bin");
    const mimeType = clean(body.mimeType, "application/octet-stream");
    const sizeBytes = Number(body.sizeBytes || 0);
    const checksum = createHash("sha256").update(`${filename}:${sizeBytes}:${Date.now()}`).digest("hex");
    const asset = {
      id: id("asset"),
      creatorId,
      projectId: body.projectId || "",
      kind: mimeType.startsWith("audio") ? "audio" : mimeType.startsWith("video") ? "video" : mimeType.startsWith("image") ? "image" : "file",
      filename,
      objectKey: `local/${checksum.slice(0, 16)}-${filename.replace(/[^\w.-]+/g, "-")}`,
      mimeType,
      sizeBytes,
      checksum,
      dimensions: body.dimensions || "",
      duration: body.duration || "",
      status: ["audio/mpeg", "audio/wav", "audio/mp4", "video/mp4", "image/png", "image/jpeg", "text/vtt", "application/x-subrip"].includes(mimeType) ? "READY" : "NEEDS_REVIEW",
      publicUrl: body.publicUrl || "",
      createdAt: now()
    };
    store.media.unshift(asset);
    store.usage.storageMb += Math.ceil(sizeBytes / 1024 / 1024);
    store.activity.unshift(activity("media.uploaded", `${filename} registered in media library.`));
    saveStore();
    return send(res, 201, asset);
  }

  if (req.method === "POST" && pathname === "/api/scripts/generate") {
    const body = await parseBody(req);
    const result = await scriptFromBrief(body);
    return send(res, 200, createGenerationProject("script", result.title, result, job("script-generation", "", "DONE", 100, store.creator.providers.text.name, "structured-json", "script")).result);
  }

  if (req.method === "POST" && pathname === "/api/scripts/rewrite-block") {
    const body = await parseBody(req);
    const actions = {
      rewrite: "Rewrite the following text to make it sound better and more engaging.",
      shorter: "Make the following text significantly shorter and punchier without losing the core message.",
      longer: "Expand on the following text, adding more detail and context.",
      tone: "Change the tone of the following text to be more persuasive and cinematic."
    };
    const actionPrompt = actions[body.action] || actions.rewrite;
    const prompt = `You are an expert script editor.
Topic: ${body.topic}

${actionPrompt}

Text to edit:
"${body.text}"

Respond with ONLY the new text, formatted cleanly.`;

    const result = await generateWithGemini(prompt, { type: Type.OBJECT, properties: { text: { type: Type.STRING } }, required: ["text"] });
    return send(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/transcriptions/upload") {
    await runMiddleware(req, res, upload.single('file'));
    if (!req.file) return send(res, 400, { message: "No file uploaded" });

    const inputPath = req.file.path;
    let transcriptionPath = inputPath;

    try {
      const fs = require("node:fs");
      const originalExt = extname(req.file.originalname || "");
      if (originalExt && !inputPath.endsWith(originalExt)) {
        transcriptionPath = `${inputPath}${originalExt}`;
        fs.renameSync(inputPath, transcriptionPath);
      }
      if (!groqOpenAi) throw new Error("Groq API not configured.");

      const transcription = await groqOpenAi.audio.transcriptions.create({
        file: fs.createReadStream(transcriptionPath),
        model: "whisper-large-v3-turbo",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"]
      });

      const allSegments = (transcription.segments || []).map((segment, index) => {
        const start = Number(segment.start || index * 4);
        const end = Number(segment.end || start + 3);
        return {
          id: `seg-${index + 1}`,
          start: new Date(start * 1000).toISOString().substring(11, 23).replace(".", ","),
          end: new Date(end * 1000).toISOString().substring(11, 23).replace(".", ","),
          text: String(segment.text || "").trim(),
          locked: false,
          confidence: typeof segment.avg_logprob === "number" ? Math.max(0, Math.min(1, 1 + segment.avg_logprob)) : 0.9
        };
      }).filter((segment) => segment.text);

      if (!allSegments.length && transcription.text) {
        allSegments.push({
          id: "seg-1",
          start: "00:00:00,000",
          end: "00:00:04,000",
          text: transcription.text.trim(),
          locked: false,
          confidence: 0.9
        });
      }

      if (!allSegments.length) throw new Error("No speech detected in uploaded media.");

      const result = {
        title: req.file.originalname,
        mediaUrl: `/uploads/${basename(transcriptionPath)}`,
        mediaType: req.file.mimetype || "",
        mediaName: req.file.originalname || basename(transcriptionPath),
        job: job("transcription", "", "DONE", 100, store.creator.providers.transcription.name, "audio", "subtitle"),
        language: req.body.language || "Auto Detect",
        format: req.body.format || "SRT",
        correctionState: "NEEDS_REVIEW",
        segments: allSegments,
        fullText: allSegments.map((segment) => segment.text).join(" "),
        schemaStatus: "READY"
      };
      
      const created = createGenerationProject("subtitle", result.title, result, result.job);
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (transcriptionPath !== inputPath && fs.existsSync(transcriptionPath)) fs.unlinkSync(transcriptionPath);
      return send(res, 200, created.result);
    } catch (error) {
      console.error(error);
      const fs = require("node:fs");
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (transcriptionPath !== inputPath && fs.existsSync(transcriptionPath)) fs.unlinkSync(transcriptionPath);

      return send(res, 500, { message: error.message || "Transcription failed" });
    }
  }

  if (req.method === "POST" && pathname === "/api/transcriptions/translate") {
    const body = await parseBody(req);
    const targetLang = body.targetLanguage || "en";
    const libreUrl = process.env.LIBRETRANSLATE_URL || "http://localhost:5000";
    
    try {
      const translatedSegments = [];
      for (const seg of body.segments) {
        const response = await fetch(`${libreUrl}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: seg.text,
            source: "auto",
            target: targetLang
          })
        });
        
        if (!response.ok) throw new Error("Translation service error");
        const data = await response.json();
        
        translatedSegments.push({
          start: seg.start,
          end: seg.end,
          text: data.translatedText || seg.text
        });
      }
      return send(res, 200, { segments: translatedSegments });
    } catch (e) {
      console.warn("Translation failed:", e.message);
      return send(res, 500, { message: e.message || "Translation failed" });
    }
  }

  if (req.method === "POST" && pathname === "/api/transcriptions/edit") {
    const body = await parseBody(req);
    const actions = {
      "translate": "Translate the following transcript segments to English.",
      "auto-punctuate": "Add proper punctuation and capitalization to the following transcript segments.",
      "remove-fillers": "Remove filler words (um, uh, like, you know) from the following transcript segments without changing the meaning.",
      "highlight": "Wrap the most important 1-2 words in each segment with ** to highlight them."
    };
    
    const actionPrompt = actions[body.action] || actions["auto-punctuate"];
    
    const prompt = `You are an expert transcript editor. ${actionPrompt}
Maintain exactly the same number of segments and their exact start/end timestamps. Only modify the 'text' field.
Segments:
${JSON.stringify(body.segments, null, 2)}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        segments: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.STRING },
              end: { type: Type.STRING },
              text: { type: Type.STRING }
            },
            required: ["start", "end", "text"]
          }
        }
      },
      required: ["segments"]
    };

    const result = await generateWithGemini(prompt, schema);
    return send(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/transcriptions/render") {
    await runMiddleware(req, res, upload.single('file'));
    if (!req.file) return send(res, 400, { message: "No file uploaded" });

    const fs = require("node:fs");
    const segments = JSON.parse(req.body.segments || "[]");
    const style = req.body.style || "classic";
    
    try {
      const srt = segments.map((seg, i) => `${i + 1}\n${seg.start.replace(".", ",")} --> ${seg.end.replace(".", ",")}\n${seg.text}`).join("\n\n");
      const srtPath = req.file.path + ".srt";
      fs.writeFileSync(srtPath, srt);

      const srtUpload = await cloudinary.uploader.upload(srtPath, { resource_type: "raw" });
      const videoUpload = await cloudinary.uploader.upload(req.file.path, { resource_type: "video" });
      
      let transformation = [{ overlay: { resource_type: "subtitles", public_id: srtUpload.public_id } }];
      if (style === "bold") {
        transformation = [{ overlay: { resource_type: "subtitles", public_id: srtUpload.public_id, font_family: "Arial", font_size: 40, font_weight: "bold" }, color: "yellow", background: "black" }];
      } else if (style === "karaoke") {
        transformation = [{ overlay: { resource_type: "subtitles", public_id: srtUpload.public_id, font_family: "Impact", font_size: 50 }, color: "magenta" }];
      }
      
      const renderUrl = cloudinary.url(videoUpload.public_id, {
        resource_type: "video",
        transformation
      });

      if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return send(res, 200, {
        url: renderUrl,
        srtUrl: srtUpload.secure_url
      });
    } catch (err) {
      if (fs.existsSync(req.file.path + ".srt")) fs.unlinkSync(req.file.path + ".srt");
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      console.error("Render failed:", err);
      return send(res, 500, { message: err.message });
    }
  }

  if (req.method === "POST" && pathname === "/api/thumbnails/suggest") {
    const body = await parseBody(req);
    const result = await thumbnailSuggestions(body);
    return send(res, 200, createGenerationProject("thumbnail", result.title || "Thumbnail Metadata", result, job("thumbnail-suggestions", "", "DONE", 100, store.creator.providers.imageSearch.name, "stock-query", "thumbnail")).result);
  }

  if (req.method === "POST" && pathname === "/api/thumbnails/generate") {
    const body = await parseBody(req);
    const title = clean(body.title, "");
    if (!title) return send(res, 400, { message: "Video title is required for thumbnail generation." });
    const subtitle = clean(body.subtitle, "");
    const image = await generateThumbnailImage({ ...body, title, subtitle });
    let metadata = {};
    try {
      metadata = await thumbnailSuggestions({ ...body, title, concept: subtitle });
    } catch (error) {
      console.warn("Thumbnail metadata generation failed:", error.message);
      metadata = { headlines: [], backgroundQuery: "", textPosition: "left", subjectPosition: "right", style: body.emotion || "Bold", overlay: "" };
    }
    const result = {
      ...metadata,
      title,
      subtitle,
      imageUrl: image.imageUrl,
      imageProvider: image.imageProvider,
      imagePrompt: image.imagePrompt,
      imageError: image.imageError || "",
      schemaStatus: "AI image generated"
    };
    return send(res, 200, createGenerationProject("thumbnail", title, result, job("thumbnail-image", "", "DONE", 100, image.imageProvider, "16:9-image", "thumbnail")).result);
  }

  if (req.method === "GET" && pathname === "/api/thumbnails/search-backgrounds") {
    const query = searchParams.get("q");
    if (!query) return error(res, 400, "bad_request", "Missing search query 'q'.");
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey || accessKey === "your_unsplash_access_key") {
      return send(res, 200, { results: [] });
    }
    
    try {
      const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=6`, {
        headers: { "Authorization": `Client-ID ${accessKey}` }
      });
      if (!response.ok) throw new Error("Unsplash API error");
      const data = await response.json();
      const images = data.results.map(img => ({
        id: img.id,
        url: img.urls.regular,
        thumb: img.urls.small,
        authorName: img.user.name,
        authorLink: img.user.links.html
      }));
      return send(res, 200, { results: images });
    } catch (e) {
      console.warn("Unsplash fetch failed:", e.message);
      return send(res, 500, { message: "Failed to fetch backgrounds" });
    }
  }

  if (req.method === "POST" && pathname === "/api/storyboards/generate") {
    const body = await parseBody(req);
    let result;
    try {
      result = await storyboardFromBrief(body);
    } catch (error) {
      return send(res, error.status || 500, { message: error.message || "Storyboard generation failed" });
    }

    if (result && Array.isArray(result.scenes)) {
      const accessKey = process.env.UNSPLASH_ACCESS_KEY;
      if (accessKey && accessKey !== "your_unsplash_access_key") {
        await Promise.all(result.scenes.map(async (scene) => {
          if (scene.stockSearchQuery) {
            try {
              const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(scene.stockSearchQuery)}&orientation=landscape&per_page=1`, {
                headers: { "Authorization": `Client-ID ${accessKey}` }
              });
              if (res.ok) {
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                  scene.imageUrl = data.results[0].urls.regular;
                  scene.thumbUrl = data.results[0].urls.small;
                }
              }
            } catch (e) {
              console.warn("Unsplash error for scene:", e.message);
            }
          }
        }));
      }
    }

    if (Array.isArray(result.scenes)) {
      result.scenes = result.scenes.map((scene, index) => ({
        ...scene,
        imageUrl: scene.imageUrl || storyboardSceneImageUrl(result.title || body.title, scene, index),
        thumbUrl: scene.thumbUrl || scene.imageUrl || storyboardSceneImageUrl(result.title || body.title, scene, index)
      }));
    }

    return send(res, 200, createGenerationProject("storyboard", result.title || clean(body.title, "Storyboard"), result, job("storyboard-generation", "", "DONE", 100, store.creator.providers.text.name, "scene-json", "storyboard")).result);
  }

  if (req.method === "POST" && pathname === "/api/storyboards/regenerate") {
    const body = await parseBody(req);
    const current = body.current || {};
    let regenerated;
    try {
      regenerated = await storyboardFromBrief({ ...body, title: current.title, duration: current.duration, scenes: current.scenes?.length });
    } catch (error) {
      return send(res, error.status || 500, { message: error.message || "Storyboard regeneration failed" });
    }
    if (Array.isArray(current.scenes)) {
      regenerated.scenes = regenerated.scenes.map((scene, index) => current.scenes[index]?.locked ? current.scenes[index] : scene);
    }
    return send(res, 200, regenerated);
  }

  if (req.method === "POST" && pathname === "/api/exports") {
    const body = await parseBody(req);
    return send(res, 200, createExport(clean(body.type, "json"), body.projectId || "", body.payload || {}));
  }

  if (req.method === "GET" && pathname.startsWith("/api/exports/")) {
    const exportItem = store.exports.find((item) => item.id === routeParam(pathname, "/api/exports/"));
    if (!exportItem) return error(res, 404, "not_found", "Export not found.");
    return send(res, 200, exportItem.content, "text/plain; charset=utf-8");
  }

  if (req.method === "POST" && pathname === "/api/podcasts/episodes") {
    try {
      return send(res, 201, createPodcastEpisodeFromBody(await parseBody(req)));
    } catch (error) {
      return send(res, error.status || 500, { message: error.message || "Episode creation failed" });
    }
  }

  if (req.method === "POST" && pathname === "/api/podcasts/generate-metadata") {
    const body = await parseBody(req);
    const transcript = body.transcript || "";
    const title = clean(body.episodeTitle, "");
    if (!title) return send(res, 400, { message: "Episode title is required for metadata generation." });
    
    const prompt = `You are an expert podcast producer. 
Episode Title: ${title}
Transcript:
${transcript.substring(0, 15000)} // Truncating if too long

Based on the transcript, generate:
1. A short, engaging episode description (shortDescription).
2. A list of 3-5 main show notes or key takeaways (showNotes).
3. A list of 3-5 relevant keywords (keywords).
4. A list of chapters with their starting timestamps (chapters), e.g., {"timestamp": "00:00", "title": "Intro"}.

Output exclusively as JSON.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        shortDescription: { type: Type.STRING },
        showNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        chapters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              timestamp: { type: Type.STRING },
              title: { type: Type.STRING }
            },
            required: ["timestamp", "title"]
          }
        }
      },
      required: ["shortDescription", "showNotes", "keywords", "chapters"]
    };

    try {
      const result = await generateWithGemini(prompt, schema);
      return send(res, 200, result);
    } catch (e) {
      console.warn("Failed to generate metadata:", e.message);
      try {
        if (!groqOpenAi) throw e;
        const response = await groqOpenAi.chat.completions.create({
          model: process.env.GROQ_TEXT_MODEL || "llama-3.1-8b-instant",
          temperature: 0.6,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Return only valid JSON with shortDescription, showNotes, keywords, and chapters." },
            { role: "user", content: prompt }
          ]
        });
        return send(res, 200, JSON.parse(response.choices?.[0]?.message?.content || "{}"));
      } catch (fallbackError) {
        console.warn("Groq metadata generation failed:", fallbackError.message);
        return send(res, 500, { message: "AI metadata generation failed" });
      }
    }
  }

  if (req.method === "POST" && pathname === "/api/podcasts/upload-audio") {
    try {
      return send(res, 200, await receivePodcastAudio(req, res));
    } catch (error) {
      return send(res, error.status || 500, { message: error.message || "Audio upload failed" });
    }
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/podcasts/episodes/")) {
    const body = await parseBody(req);
    const episodeItem = store.podcast.episodes.find((item) => item.id === routeParam(pathname, "/api/podcasts/episodes/"));
    if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
    Object.assign(episodeItem, body, { updatedAt: now() });
    store.activity.unshift(activity("episode.updated", `Updated episode ${episodeItem.title}.`));
    saveStore();
    return send(res, 200, episodeItem);
  }

  if (req.method === "POST" && pathname.startsWith("/api/jobs/") && pathname.endsWith("/retry")) {
    const jobId = pathname.split("/")[3];
    const target = store.jobs.find((item) => item.id === jobId);
    if (!target) return error(res, 404, "not_found", "Job not found.");
    target.status = "DONE";
    target.progressPercent = 100;
    target.retryCount += 1;
    target.errorCode = "";
    target.userMessage = "";
    target.updatedAt = now();
    store.activity.unshift(activity("job.retried", `Retried ${target.type} job.`));
    saveStore();
    return send(res, 200, target);
  }

  if (req.method === "POST" && pathname === "/api/cleanup") {
    const before = store.media.length;
    store.media = store.media.filter((asset) => asset.status !== "ORPHANED");
    store.activity.unshift(activity("storage.cleanup", `Removed ${before - store.media.length} orphaned assets.`));
    saveStore();
    return send(res, 200, { removed: before - store.media.length, storageMb: store.usage.storageMb });
  }

  if (req.method === "GET" && pathname === "/api/search") {
    const query = String(searchParams.get("q") || "").toLowerCase();
    return send(res, 200, {
      projects: store.projects.filter((project) => project.title.toLowerCase().includes(query) || project.module.includes(query)),
      media: store.media.filter((asset) => asset.filename.toLowerCase().includes(query)),
      episodes: store.podcast.episodes.filter((item) => item.title.toLowerCase().includes(query))
    });
  }

  return error(res, 404, "not_found", "API route not found.");
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/uploads/")) {
    const requestedUpload = pathname.replace(/^\/uploads\//, "");
    const filePath = normalize(join(__dirname, "uploads", requestedUpload));
    const uploadRoot = normalize(join(__dirname, "uploads"));
    if (!filePath.startsWith(uploadRoot) || !existsSync(filePath)) {
      return error(res, 404, "not_found", "Media file not found.");
    }
    const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";
    const size = statSync(filePath).size;
    const range = req.headers.range;
    if (range) {
      const [startPart, endPart] = range.replace(/bytes=/, "").split("-");
      const start = Number(startPart);
      const end = endPart ? Number(endPart) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start >= size || end >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": contentType
      });
      return createReadStream(filePath, { start, end }).pipe(res);
    }
    res.setHeader("Accept-Ranges", "bytes");
    return send(res, 200, readFileSync(filePath), contentType);
  }

  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(FRONTEND, requested));
  if (!filePath.startsWith(FRONTEND) || !existsSync(filePath)) {
    return error(res, 404, "not_found", "Page not found.");
  }
  send(res, 200, readFileSync(filePath), mimeTypes[extname(filePath)] || "application/octet-stream");
}

function staticFileExists(pathname) {
  if (pathname.startsWith("/uploads/")) {
    const requestedUpload = pathname.replace(/^\/uploads\//, "");
    const filePath = normalize(join(__dirname, "uploads", requestedUpload));
    const uploadRoot = normalize(join(__dirname, "uploads"));
    return filePath.startsWith(uploadRoot) && existsSync(filePath);
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(FRONTEND, requested));
  return filePath.startsWith(FRONTEND) && existsSync(filePath);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (staticFileExists(url.pathname)) return serveStatic(req, res, url.pathname);
    const rssMatch = url.pathname.match(/^\/rss\/([^/]+)\.xml$/);
    if (rssMatch) {
      const publicStore = await loadPublicStoreBySlug(decodeURIComponent(rssMatch[1]));
      if (!publicStore) return error(res, 404, "not_found", "RSS feed not found.");
      publishDueScheduled();
      return send(res, 200, rssXml(), "application/rss+xml; charset=utf-8");
    }
    const podcastMatch = url.pathname.match(/^\/podcasts?\/([^/]+)$/);
    if (podcastMatch) {
      const publicStore = await loadPublicStoreBySlug(decodeURIComponent(podcastMatch[1]));
      if (!publicStore) return error(res, 404, "not_found", "Podcast not found.");
      publishDueScheduled();
      return send(res, 200, publicPodcastPage(), "text/html; charset=utf-8");
    }
    const episodeMatch = url.pathname.match(/^\/podcast\/([^/]+)\/([^/]+)$/);
    if (episodeMatch) {
      const publicStore = await loadPublicStoreBySlug(decodeURIComponent(episodeMatch[1]));
      if (!publicStore) return error(res, 404, "not_found", "Podcast not found.");
      publishDueScheduled();
      const episodeSlug = decodeURIComponent(episodeMatch[2]);
      const episodeItem = publishedEpisodes().find((item) => item.slug === episodeSlug);
      if (!episodeItem) return error(res, 404, "not_found", "Episode not found.");
      return send(res, 200, publicEpisodePage(episodeItem), "text/html; charset=utf-8");
    }
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url.pathname, url.searchParams);
    return serveStatic(req, res, url.pathname);
  } catch (caught) {
    const status = caught.status || 500;
    return error(res, status, caught.code || "server_error", caught.message || "Unexpected server error.");
  }
});

server.on("error", (caught) => {
  if (caught.code === "EADDRINUSE" && activePort < DEFAULT_PORT + 10) {
    const busyPort = activePort;
    activePort += 1;
    console.log(`Port ${busyPort} is busy. Trying http://localhost:${activePort}`);
    server.listen(activePort);
    return;
  }
  throw caught;
});

initDb().then(() => {
  server.listen(activePort, () => {
    console.log(`CreatorTools running at http://localhost:${activePort}`);
  });
}).catch(console.error);

setInterval(() => {
  try {
    publishDueScheduled();
  } catch (error) {
    console.warn("Scheduled podcast publishing check failed:", error.message);
  }
}, 60_000);
