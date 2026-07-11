import { basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { autocompletion, type CompletionSource } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { Api } from '@/lib/api'
import { linkPreviewToEmbedFence, markdownLinkForUrl } from '@/lib/linkPreview'

export const useCodeMirrorCommands = (currentView: () => EditorView | null) => {
  const replaceSelection = (insert: string): void => {
    const view = currentView()
    if (!view) return
    const selection = view.state.selection.main
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + insert.length },
      scrollIntoView: true,
    })
    view.focus()
  }

  const insertSnippet = (snippet: string): void => {
    const view = currentView()
    if (!view) return
    const selection = view.state.selection.main
    const prefix = selection.from > 0 && !view.state.sliceDoc(selection.from - 1, selection.from).match(/\n/) ? '\n\n' : ''
    replaceSelection(prefix + snippet)
  }

  const insertPendingLinkPreview = (url: string): void => {
    const view = currentView()
    if (!view) return
    const selection = view.state.selection.main
    const prefix = selection.from > 0 && !view.state.sliceDoc(selection.from - 1, selection.from).match(/\n/) ? '\n\n' : ''
    const fallback = `${prefix}${markdownLinkForUrl(url)}`
    const start = selection.from
    const end = start + fallback.length
    replaceSelection(fallback)
    void Api.unfurl(url).then((preview) => {
      const active = currentView()
      if (!active || active.state.sliceDoc(start, end) !== fallback) return
      const insert = `${prefix}${linkPreviewToEmbedFence(preview)}`
      active.dispatch({
        changes: { from: start, to: end, insert },
        selection: { anchor: start + insert.length },
        scrollIntoView: true,
      })
      active.focus()
    }).catch(() => undefined)
  }

  const surround = (prefix: string, suffix: string, fallback: string): void => {
    const view = currentView()
    if (!view) return
    const selection = view.state.selection.main
    const selected = view.state.sliceDoc(selection.from, selection.to) || fallback
    replaceSelection(`${prefix}${selected}${suffix}`)
  }

  const insertLinePrefix = (prefix: string, fallback: string): void => {
    const view = currentView()
    if (!view) return
    const selection = view.state.selection.main
    const line = view.state.doc.lineAt(selection.from)
    const text = view.state.sliceDoc(line.from, line.to) || fallback
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: `${prefix}${text.replace(/^#+\s*/, '')}` },
      selection: { anchor: line.from + prefix.length + text.length },
      scrollIntoView: true,
    })
    view.focus()
  }

  return { replaceSelection, insertSnippet, insertPendingLinkPreview, surround, insertLinePrefix }
}

export interface MarkdownEditorExtensionOptions {
  readonly completion: CompletionSource
  readonly drop: (event: DragEvent) => boolean
  readonly paste: (event: ClipboardEvent) => boolean
  readonly extra?: readonly Extension[]
}

export const markdownEditorExtensions = (options: MarkdownEditorExtensionOptions): Extension[] => [
  basicSetup,
  markdown(),
  autocompletion({ override: [options.completion] }),
  oneDark,
  EditorView.lineWrapping,
  EditorView.domEventHandlers({ drop: options.drop, paste: options.paste }),
  ...(options.extra ?? []),
]
