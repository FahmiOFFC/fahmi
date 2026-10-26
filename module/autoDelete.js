// autoDelete.js
// Fitur auto-hapus: pesan di grup yang di-ON-kan otomatis dihapus untuk semua
// orang setelah N menit. Daftar grup + antrean disimpan ke file JSON, jadi
// tetap jalan walau bot di-restart.
import fs from "fs";

const GROUP_FILE = "./autohapus-groups.json";
const QUEUE_FILE = "./autohapus-queue.json";

const DELAY_MS = 3 * 60 * 1000; // 5 menit
const CHECK_EVERY_MS = 10 * 1000; // cek antrean tiap 10 detik
const GAP_BETWEEN_DELETE_MS = 700; // jeda antar hapus, biar nggak spam ke server WA
const MAX_AGE_MS = 60 * 60 * 1000; // abaikan pesan yang umurnya > 1 jam (misal sisa sync)

// ---------- helper baca/tulis JSON ----------
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- daftar grup yang aktif ----------
let groups = new Set(readJson(GROUP_FILE, { groups: [] }).groups);

export function isAutoDeleteOn(groupId) {
  return groups.has(groupId);
}

export function getAutoDeleteGroups() {
  return [...groups];
}

export function setAutoDelete(groupId, on) {
  if (on) {
    groups.add(groupId);
  } else {
    groups.delete(groupId);
    // grup dimatikan -> buang sisa antreannya juga
    queue = queue.filter((q) => q.chat !== groupId);
    saveQueue();
  }
  writeJson(GROUP_FILE, { groups: [...groups] });
}

// ---------- antrean hapus ----------
let queue = readJson(QUEUE_FILE, []);

function saveQueue() {
  writeJson(QUEUE_FILE, queue);
}

// Dipanggil dari index.js untuk SETIAP pesan masuk (termasuk pesan bot sendiri).
export function scheduleAutoDelete(rawM) {
  const chat = rawM?.key?.remoteJid;
  if (!chat?.endsWith("@g.us")) return;
  if (!groups.has(chat)) return;
  if (!rawM.key.id || !rawM.message) return;

  // Lewati pesan sistem yang nggak perlu dihapus
  const msg = rawM.message;
  if (msg.protocolMessage || msg.reactionMessage) return;
  if (msg.senderKeyDistributionMessage && Object.keys(msg).length <= 2) return;

  const ts = Number(rawM.messageTimestamp || 0) * 1000 || Date.now();
  if (Date.now() - ts > MAX_AGE_MS) return;

  // Hindari dobel kalau event yang sama masuk dua kali
  if (queue.some((q) => q.chat === chat && q.id === rawM.key.id)) return;

  queue.push({
    chat,
    id: rawM.key.id,
    fromMe: !!rawM.key.fromMe,
    participant: rawM.key.participant || undefined,
    deleteAt: ts + DELAY_MS
  });
  saveQueue();
}

// ---------- worker: satu interval saja, sock-nya di-update tiap reconnect ----------
let currentSock = null;
let timer = null;
let running = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function processQueue() {
  if (running || !currentSock) return;
  running = true;
  try {
    const now = Date.now();
    const due = queue.filter((q) => q.deleteAt <= now);
    if (!due.length) return;

    for (const item of due) {
      // Kalau grupnya sudah di-OFF-kan, skip
      if (groups.has(item.chat)) {
        try {
          await currentSock.sendMessage(item.chat, {
            delete: {
              remoteJid: item.chat,
              fromMe: item.fromMe,
              id: item.id,
              participant: item.participant
            }
          });
        } catch (e) {
          console.log("⚠️ Gagal auto-hapus:", item.id, e?.message || e);
        }
        await sleep(GAP_BETWEEN_DELETE_MS);
      }
      // Sukses/gagal tetap dibuang dari antrean, supaya nggak nyangkut terus
      queue = queue.filter((q) => !(q.chat === item.chat && q.id === item.id));
    }
    saveQueue();
  } finally {
    running = false;
  }
}

// Panggil tiap kali sock baru dibuat (startBot bisa kepanggil ulang pas reconnect).
export function initAutoDelete(sock) {
  currentSock = sock;
  if (!timer) {
    timer = setInterval(() => {
      processQueue().catch((e) => console.log("⚠️ autoDelete error:", e));
    }, CHECK_EVERY_MS);
  }
}
