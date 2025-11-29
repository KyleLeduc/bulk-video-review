export class FileHashGenerator {
  async generate(file: File): Promise<string> {
    // Backward-compatible: hash on name + size to avoid schema changes
    const encoder = new TextEncoder()
    const data = encoder.encode(file.name + file.size)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))

    return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
}
