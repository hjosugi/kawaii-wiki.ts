import nodemailer from 'nodemailer'
import type { MailEnv } from '../env.ts'
import type { StructuredLogger } from '../observability/logging.ts'

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
}

export type MailSender = (message: MailMessage) => Promise<void>

export interface MailService {
  configured(): boolean
  send(message: MailMessage): Promise<{ sent: boolean }>
  resetPasswordMessage(input: { email: string; siteName: string; resetUrl: string; expiresMinutes: number }): MailMessage
  verifyEmailMessage(input: { email: string; siteName: string; verifyUrl: string; expiresHours: number }): MailMessage
}

export interface MailServiceOptions {
  readonly sender?: MailSender
  readonly logger?: StructuredLogger
}

const createSmtpSender = (env: MailEnv): MailSender => {
  const transport = nodemailer.createTransport({
    url: env.smtpUrl!,
    connectionTimeout: env.timeoutMs,
    greetingTimeout: env.timeoutMs,
    socketTimeout: env.timeoutMs,
  })
  return async (message) => {
    await transport.sendMail({ from: env.from, ...message })
  }
}

export const createMailService = (env: MailEnv, options: MailServiceOptions = {}): MailService => {
  const sender = options.sender ?? (env.smtpUrl ? createSmtpSender(env) : null)

  return {
    configured() {
      return Boolean(sender)
    },

    async send(message) {
      if (!sender) {
        options.logger?.info({ type: 'mail', event: 'mail.unconfigured', to: message.to })
        return { sent: false }
      }
      await sender(message)
      return { sent: true }
    },

    resetPasswordMessage({ email, siteName, resetUrl, expiresMinutes }) {
      return {
        to: email,
        subject: `${siteName} password reset`,
        text: [
          `A password reset was requested for ${siteName}.`,
          '',
          `Open this link within ${expiresMinutes} minutes to choose a new password:`,
          resetUrl,
          '',
          'If you did not request this, you can ignore this email.',
        ].join('\n'),
      }
    },

    verifyEmailMessage({ email, siteName, verifyUrl, expiresHours }) {
      return {
        to: email,
        subject: `Verify your ${siteName} email address`,
        text: [
          `Confirm ${email} for ${siteName}.`,
          '',
          `Open this link within ${expiresHours} hours to verify your email address:`,
          verifyUrl,
          '',
          'If you did not create this account, you can ignore this email.',
        ].join('\n'),
      }
    },
  }
}
