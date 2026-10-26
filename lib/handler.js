import config from '../config.js'
import handleCase from '../case.js'

// Ambil teks dari berbagai tipe pesan
function getText(msg) {
  const m = msg.message
  if (!m) return ''
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  )
}

export async function handleMessage(sock, msg) {
  if (!msg.message) return

  const from = msg.key.remoteJid
  const isGroup = from.endsWith('@g.us')
  const sender = isGroup ? msg.key.participant : from
  const body = getText(msg).trim()

  console.log("📩 Pesan masuk:", body, "| dari:", msg.key.remoteJid, "| fromMe:", msg.key.fromMe)

  if (!body.startsWith(config.prefix)) return

  const args = body.slice(config.prefix.length).trim().split(/\s+/)
  const command = args.shift().toLowerCase()
  const text = args.join(' ')

  const reply = (teks) => sock.sendMessage(from, { text: teks }, { quoted: msg })

  try {
    await handleCase({
      sock, msg, from, sender, isGroup, args, text, command,
      prefix: config.prefix, config, reply
    })
  } catch (err) {
    console.error(`Error di command "${command}":`, err)
    await reply('Terjadi error saat menjalankan command.')
  }
      }
