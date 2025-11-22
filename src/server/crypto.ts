import crypto from 'crypto'

function requireHexKey(name: string) {
  const v = process.env[name]
  if (!v || v.length !== 64) {
    throw new Error(name + ' invalid')
  }
  return Buffer.from(v, 'hex')
}

export function encryptAes256Gcm(data: Buffer) {
  const key = requireHexKey('ENC_KEY')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext: enc, iv, tag }
}


