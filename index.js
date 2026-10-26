import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import readline from 'node:readline/promises'

import config from './config.js'
import { handleMessage } from './lib/handler.js'
import { initAutoDelete, scheduleAutoDelete } from './module/autoDelete.js'

async function askNumber() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Masukkan nomor WhatsApp bot (contoh 6281234567890): ')
  rl.close()
  return answer
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome')
  })

  sock.ev.on('creds.update', saveCreds)

  // Fitur auto-hapus (sock di-update tiap reconnect)
  initAutoDelete(sock)

  let pairingRequested = false

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // Socket siap untuk pairing (event qr muncul jika belum login)
    if (qr && !sock.authState.creds.registered && !pairingRequested) {
      pairingRequested = true
      try {
        const raw = config.pairingNumber || (await askNumber())
        const number = String(raw).replace(/\D/g, '')
        const code = await sock.requestPairingCode(number)
        console.log(`\nKode pairing: ${code}`)
        console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon, lalu masukkan kode di atas.\n')
      } catch (err) {
        console.error('Gagal meminta pairing code:', err)
        pairingRequested = false
      }
    }

    if (connection === 'open') {
      console.log('Bot terhubung!')
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      console.log('Koneksi terputus, kode:', code)
      if (code === DisconnectReason.loggedOut) {
        console.log(`Sesi logout. Hapus folder "${config.sessionDir}" lalu jalankan ulang untuk pairing baru.`)
      } else {
        startBot()
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (type === 'append') {
        // pesan dari HP sendiri (chat ke diri sendiri) kadang masuk sebagai 'append'
        const umur = Date.now() / 1000 - Number(msg.messageTimestamp || 0)
        if (!msg.key.fromMe || umur > 30) continue
      } else if (type !== 'notify') {
        continue
      }
      scheduleAutoDelete(msg)
      await handleMessage(sock, msg)
    }
  })
}

startBot()
