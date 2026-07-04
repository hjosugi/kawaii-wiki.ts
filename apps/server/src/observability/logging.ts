export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEvent {
  readonly type: string
  readonly level?: LogLevel
  readonly [key: string]: unknown
}

export interface StructuredLogger {
  info(event: LogEvent): void
  warn(event: LogEvent): void
  error(event: LogEvent): void
}

const write = (level: LogLevel, event: LogEvent): void => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...event,
  }
  console[level](JSON.stringify(payload))
}

export const consoleStructuredLogger: StructuredLogger = {
  info: (event) => write('info', event),
  warn: (event) => write('warn', event),
  error: (event) => write('error', event),
}

export const audit = (
  logger: StructuredLogger,
  action: string,
  fields: Record<string, unknown> = {},
): void => {
  logger.info({
    type: 'audit',
    action,
    ...fields,
  })
}

export const requestLog = (
  logger: StructuredLogger,
  fields: {
    method: string
    path: string
    status: number
    durationMs: number
    ip?: string
    userId?: string | null
    error?: string
  },
): void => {
  logger.info({
    type: 'request',
    ...fields,
  })
}
