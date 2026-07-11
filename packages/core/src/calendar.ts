/** Calendar-event parsing, rendering helpers, and iCalendar serialization. */
import { slugifyHeading } from './slug.ts'

export type DateFormatStyle = 'short' | 'medium' | 'long'

export interface MarkdownDateTimeOptions {
  readonly locale?: string
  readonly timezone?: string
  readonly dateFormat?: DateFormatStyle
}
export interface CalendarEvent {
  readonly title: string
  readonly start: string
  readonly end?: string
  readonly timezone?: string
  readonly location?: string
  readonly url?: string
  readonly platform?: string
  readonly channelUrl?: string
  readonly description?: string
}

export interface ExtractedCalendarEvent extends CalendarEvent {
  readonly id: string
  readonly sourcePath: string
  readonly block: number
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const escapeAttr = (value: string): string => escapeHtml(value).replace(/'/g, '&#39;')
const EVENT_KEYS = new Set(['title', 'start', 'end', 'timezone', 'location', 'url', 'platform', 'channelurl', 'description'])

const parseDateParts = (value: string): { date: string; time?: string } | null => {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null
  const date = `${match[1]}${match[2]}${match[3]}`
  const time = match[4] ? `${match[4]}${match[5]}${match[6] ?? '00'}` : undefined
  return { date, time }
}

const addDays = (yyyymmdd: string, days: number): string => {
  const year = Number(yyyymmdd.slice(0, 4))
  const month = Number(yyyymmdd.slice(4, 6))
  const day = Number(yyyymmdd.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('')
}

const formatDateParts = (
  date: string,
  time: string | undefined,
  options: MarkdownDateTimeOptions = {},
): string => {
  const locale = options.locale && options.locale !== 'und' ? options.locale : 'en'
  const dateStyle = options.dateFormat ?? 'medium'
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6))
  const day = Number(date.slice(6, 8))
  const hour = Number(time?.slice(0, 2) ?? '0')
  const minute = Number(time?.slice(2, 4) ?? '0')
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute))
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle,
      ...(time ? { timeStyle: 'short' as const } : {}),
      timeZone: 'UTC',
    }).format(instant)
  } catch {
    const yyyy = date.slice(0, 4)
    const mm = date.slice(4, 6)
    const dd = date.slice(6, 8)
    return time ? `${yyyy}-${mm}-${dd} ${time.slice(0, 2)}:${time.slice(2, 4)}` : `${yyyy}-${mm}-${dd}`
  }
}

const formatDisplayDate = (value: string, options: MarkdownDateTimeOptions = {}): string => {
  const parsed = parseDateParts(value)
  if (!parsed) return value
  const formatted = formatDateParts(parsed.date, parsed.time, options)
  return parsed.time && options.timezone ? `${formatted} ${options.timezone}` : formatted
}

export const parseCalendarEventBlock = (content: string): CalendarEvent | null => {
  const data = new Map<string, string>()
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z_-]*):\s*(.*)$/)
    if (!match) continue
    const key = match[1]!.toLowerCase().replace(/-/g, '')
    const normalized = key === 'timeZone'.toLowerCase() ? 'timezone' : key
    if (EVENT_KEYS.has(normalized)) data.set(normalized, match[2]!.trim())
  }

  const title = data.get('title')
  const start = data.get('start')
  if (!title || !start) return null

  return {
    title,
    start,
    end: data.get('end'),
    timezone: data.get('timezone'),
    location: data.get('location'),
    url: data.get('url'),
    platform: data.get('platform'),
    channelUrl: data.get('channelurl'),
    description: data.get('description'),
  }
}

const flattenFenceValue = (value: string): string => value.replace(/\r?\n/g, ' ').trim()

export const calendarEventToFence = (event: CalendarEvent): string => {
  const lines = [
    '```event',
    `title: ${flattenFenceValue(event.title)}`,
    `start: ${flattenFenceValue(event.start)}`,
    event.end ? `end: ${flattenFenceValue(event.end)}` : '',
    event.timezone ? `timezone: ${flattenFenceValue(event.timezone)}` : '',
    event.location ? `location: ${flattenFenceValue(event.location)}` : '',
    event.url ? `url: ${flattenFenceValue(event.url)}` : '',
    event.platform ? `platform: ${flattenFenceValue(event.platform)}` : '',
    event.channelUrl ? `channelUrl: ${flattenFenceValue(event.channelUrl)}` : '',
    event.description ? `description: ${flattenFenceValue(event.description)}` : '',
    '```',
  ].filter(Boolean)
  return `${lines.join('\n')}\n`
}

const EVENT_FENCE = /(?:^|\n)```event[^\n]*\n([\s\S]*?)\n```/gi

export const extractCalendarEvents = (content: string, sourcePath = ''): ExtractedCalendarEvent[] => {
  const events: ExtractedCalendarEvent[] = []
  let match: RegExpExecArray | null = null
  let block = 0
  while ((match = EVENT_FENCE.exec(content ?? ''))) {
    const event = parseCalendarEventBlock(match[1] ?? '')
    if (event) {
      const slug = slugifyHeading(event.title) || 'event'
      events.push({
        ...event,
        id: `${sourcePath || 'page'}:${block}:${slug}`,
        sourcePath,
        block,
      })
    }
    block += 1
  }
  return events
}

const googleCalendarUrl = (event: CalendarEvent, dateTime: MarkdownDateTimeOptions = {}): string => {
  const start = parseDateParts(event.start)
  const end = event.end ? parseDateParts(event.end) : null
  const allDay = Boolean(start && !start.time)
  const startValue = start ? (start.time ? `${start.date}T${start.time}` : start.date) : event.start
  const endValue = end
    ? end.time
      ? `${end.date}T${end.time}`
      : end.date
    : start && allDay
      ? addDays(start.date, 1)
      : startValue
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startValue}/${endValue}`,
  })
  if (event.description || event.url) {
    params.set('details', [event.description, event.url].filter(Boolean).join('\n\n'))
  }
  if (event.location) params.set('location', event.location)
  const timezone = event.timezone ?? dateTime.timezone
  if (timezone && !allDay) params.set('ctz', timezone)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const escapeIcsText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const icsDateLine = (field: string, value: string): string => {
  const parsed = parseDateParts(value)
  if (!parsed) return `${field}:${escapeIcsText(value)}`
  if (!parsed.time) return `${field};VALUE=DATE:${parsed.date}`
  return `${field}:${parsed.date}T${parsed.time}`
}

export const calendarEventToIcs = (event: CalendarEvent): string => {
  const start = parseDateParts(event.start)
  const allDay = Boolean(start && !start.time)
  const end = event.end ?? (start && allDay ? `${start.date.slice(0, 4)}-${start.date.slice(4, 6)}-${start.date.slice(6, 8)}` : event.start)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//kawaii-wiki.ts//event//EN',
    'BEGIN:VEVENT',
    `SUMMARY:${escapeIcsText(event.title)}`,
    icsDateLine('DTSTART', event.start),
    icsDateLine('DTEND', event.end ?? (start && allDay ? `${addDays(start.date, 1).slice(0, 4)}-${addDays(start.date, 1).slice(4, 6)}-${addDays(start.date, 1).slice(6, 8)}` : end)),
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
    event.url ? `URL:${escapeIcsText(event.url)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return `${lines.join('\r\n')}\r\n`
}

const icsDataUrl = (event: CalendarEvent): string => {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(calendarEventToIcs(event))}`
}

const unfoldIcsLines = (input: string): string[] => {
  const out: string[] = []
  for (const line of (input ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (/^[ \t]/.test(line) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

const unescapeIcsText = (value: string): string =>
  value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')

interface IcsProperty {
  readonly name: string
  readonly params: Record<string, string>
  readonly value: string
}

const parseIcsProperty = (line: string): IcsProperty | null => {
  const index = line.indexOf(':')
  if (index === -1) return null
  const head = line.slice(0, index)
  const value = line.slice(index + 1)
  const [name = '', ...paramParts] = head.split(';')
  const params: Record<string, string> = {}
  for (const part of paramParts) {
    const [key = '', raw = ''] = part.split('=')
    if (key) params[key.toUpperCase()] = raw.replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value }
}

const icsDateToEventDate = (value: string): string => {
  const clean = value.trim()
  const date = clean.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (date) return `${date[1]}-${date[2]}-${date[3]}`
  const dateTime = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:(\d{2}))?Z?$/)
  if (dateTime) return `${dateTime[1]}-${dateTime[2]}-${dateTime[3]} ${dateTime[4]}:${dateTime[5]}`
  return clean
}

const eventFromIcsProps = (props: IcsProperty[]): CalendarEvent | null => {
  const first = (name: string): IcsProperty | undefined => props.find((prop) => prop.name === name)
  const summary = first('SUMMARY')
  const start = first('DTSTART')
  if (!summary || !start) return null
  const end = first('DTEND')
  const description = first('DESCRIPTION')
  const location = first('LOCATION')
  const url = first('URL')
  const timezone = start.params.TZID ?? end?.params.TZID

  return {
    title: unescapeIcsText(summary.value),
    start: icsDateToEventDate(start.value),
    end: end ? icsDateToEventDate(end.value) : undefined,
    timezone,
    location: location ? unescapeIcsText(location.value) : undefined,
    url: url ? unescapeIcsText(url.value) : undefined,
    description: description ? unescapeIcsText(description.value) : undefined,
  }
}

export const parseIcsEvents = (input: string): CalendarEvent[] => {
  const events: CalendarEvent[] = []
  let current: IcsProperty[] | null = null

  for (const line of unfoldIcsLines(input)) {
    const normalized = line.trim().toUpperCase()
    if (normalized === 'BEGIN:VEVENT') {
      current = []
      continue
    }
    if (normalized === 'END:VEVENT') {
      if (current) {
        const event = eventFromIcsProps(current)
        if (event) events.push(event)
      }
      current = null
      continue
    }
    if (!current) continue
    const prop = parseIcsProperty(line)
    if (prop) current.push(prop)
  }

  return events
}

export const renderEventCard = (content: string, dateTime: MarkdownDateTimeOptions = {}): string | null => {
  const event = parseCalendarEventBlock(content)
  if (!event) return null
  const timezone = event.timezone ?? dateTime.timezone
  const start = formatDisplayDate(event.start, { ...dateTime, timezone })
  const end = event.end ? formatDisplayDate(event.end, { ...dateTime, timezone }) : null
  const when = end ? `${start} → ${end}` : start
  const details = [
    event.location ? `<div><span>Location</span><strong>${escapeHtml(event.location)}</strong></div>` : '',
    event.platform ? `<div><span>Platform</span><strong><span class="wiki-event-platform">${escapeHtml(event.platform)}</span></strong></div>` : '',
    event.url
      ? `<div><span>Link</span><strong><a href="${escapeAttr(event.url)}" rel="noopener noreferrer">${escapeHtml(event.url)}</a></strong></div>`
      : '',
  ].filter(Boolean)

  return `<section class="wiki-event-card">
    <div class="wiki-event-main">
      <p class="wiki-event-kicker">Calendar event</p>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="wiki-event-time">${escapeHtml(when)}</p>
      ${event.description ? `<p class="wiki-event-description">${escapeHtml(event.description)}</p>` : ''}
      ${details.length ? `<div class="wiki-event-details">${details.join('')}</div>` : ''}
    </div>
    <div class="wiki-event-actions">
      <a href="${escapeAttr(googleCalendarUrl(event, dateTime))}" target="_blank" rel="noopener noreferrer">Google Calendar</a>
      <a href="${escapeAttr(icsDataUrl(event))}" download="${escapeAttr(slugifyHeading(event.title) || 'event')}.ics">Download .ics</a>
      ${event.channelUrl && /^https?:\/\//i.test(event.channelUrl) ? `<a href="${escapeAttr(event.channelUrl)}" target="_blank" rel="noopener noreferrer">Watch stream</a>` : ''}
    </div>
  </section>`
}
