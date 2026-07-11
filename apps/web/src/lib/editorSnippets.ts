const pad = (value: number): string => String(value).padStart(2, '0')

export const eventSnippet = (): string => {
  const start = new Date(Date.now() + 60 * 60 * 1000)
  start.setMinutes(0, 0, 0)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const format = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `\`\`\`event
title: Event title
start: ${format(start)}
end: ${format(end)}
timezone: ${zone}
location:
url:
description:
\`\`\`
`
}

export const streamSnippet = (): string =>
  eventSnippet()
    .replace('title: Event title', 'title: Stream title')
    .replace('url:\n', 'url:\nplatform: YouTube\nchannelUrl: https://youtube.com/@handle\n')

export const infoboxSnippet = (): string => `\`\`\`infobox
title: Name
image:
caption:
Field: value

Details go here.
\`\`\`
`
export const linksSnippet = (): string => `\`\`\`links
[YouTube](https://youtube.com/@handle)
[X](https://x.com/handle)
[Shop](https://booth.pm/)
\`\`\`
`

export const embedSnippet = (): string => `\`\`\`embed
url: https://example.com
title:
description:
\`\`\`
`

export const youtubeSnippet = (): string => `\`\`\`youtube
url: https://www.youtube.com/watch?v=dQw4w9WgXcQ
title:
\`\`\`
`

export const twitchSnippet = (): string => `\`\`\`twitch
channel: twitch
title:
\`\`\`
`
