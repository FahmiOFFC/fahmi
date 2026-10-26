// Semua fitur bot ditulis di sini dalam bentuk switch-case.
// Tambah fitur baru: tulis `case 'namacommand':` di bawah.
//
// Variabel yang tersedia:
// sock, msg, from (id chat), sender, isGroup, args (array), text (isi setelah command),
// command, prefix, config, reply(teks)

import { setAutoDelete, isAutoDeleteOn, getAutoDeleteGroups } from './module/autoDelete.js'

const num = (jid) => (jid || '').split('@')[0].split(':')[0]

// Cek apakah pengirim admin grup (cocokkan id / lid / nomor telepon)
async function isGroupAdmin(sock, groupId, sender) {
  const meta = await sock.groupMetadata(groupId)
  const me = num(sender)
  return meta.participants.some(
    (p) => p.admin && [p.id, p.lid, p.phoneNumber].some((j) => j && num(j) === me)
  )
}

export default async function handleCase(ctx) {
  const { sock, msg, from, sender, isGroup, args, text, command, prefix, config, reply } = ctx

  switch (command) {
    case 'ping': {
      await reply('Pong!')
      break
    }

    case 'menu': {
      await reply(
        `*${config.botName}*\n\n` +
        `• ${prefix}ping\n` +
        `• ${prefix}menu\n` +
        `• ${prefix}autohapus on/off/status (grup)`
      )
      break
    }

    case 'autohapus': {
      if (!isGroup) return reply('Command ini hanya bisa dipakai di grup.')

      const boleh =
        msg.key.fromMe ||
        config.owner.includes(num(sender)) ||
        (await isGroupAdmin(sock, from, sender))
      if (!boleh) return reply('Hanya admin grup atau owner yang bisa memakai command ini.')

      const aksi = (args[0] || '').toLowerCase()
      if (aksi === 'on') {
        setAutoDelete(from, true)
        await reply('Auto-hapus *AKTIF* di grup ini.')
      } else if (aksi === 'off') {
        setAutoDelete(from, false)
        await reply('Auto-hapus *MATI* di grup ini.')
      } else if (aksi === 'status') {
        await reply(
          `Auto-hapus di grup ini: *${isAutoDeleteOn(from) ? 'AKTIF' : 'MATI'}*\n` +
          `Total grup aktif: ${getAutoDeleteGroups().length}`
        )
      } else {
        await reply(`Pakai: ${prefix}autohapus on / off / status`)
      }
      break
    }

    // Contoh fitur baru:
    // case 'halo': {
    //   await reply(`Halo ${args[0] || 'kamu'}!`)
    //   break
    // }

    default:
      break
  }
}
