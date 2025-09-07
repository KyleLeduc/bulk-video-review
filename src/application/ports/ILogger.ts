/**
 * Logging operations for application-wide error handling and debugging
 */
export interface ILogger {
  error(message: string, error?: Error | unknown): void
  warn(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  debug(message: string, data?: unknown): void
}
