import type { ILogger } from '@app/ports'

export class ConsoleLoggerAdapter implements ILogger {
  error(message: string, error?: Error | unknown): void {
    if (error instanceof Error) {
      console.error(`[ERROR] ${message}:`, error.message, error.stack)
    } else if (error) {
      console.error(`[ERROR] ${message}:`, error)
    } else {
      console.error(`[ERROR] ${message}`)
    }
  }

  warn(message: string, data?: unknown): void {
    if (data !== undefined) {
      console.warn(`[WARN] ${message}:`, data)
    } else {
      console.warn(`[WARN] ${message}`)
    }
  }

  info(message: string, data?: unknown): void {
    if (data !== undefined) {
      console.info(`[INFO] ${message}:`, data)
    } else {
      console.info(`[INFO] ${message}`)
    }
  }

  debug(message: string, data?: unknown): void {
    if (data !== undefined) {
      console.debug(`[DEBUG] ${message}:`, data)
    } else {
      console.debug(`[DEBUG] ${message}`)
    }
  }
}
