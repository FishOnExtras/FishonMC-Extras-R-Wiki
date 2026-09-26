const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface RenderOptions {
  classes: ArrayLike<string | undefined>
  extras?: ReadonlyMap<number, string>
  caret?: number | null
  currentLine?: number
}

export function renderHtml(text: string, options: RenderOptions): string {
  const { classes, extras, caret = null, currentLine = -1 } = options

  const classAt = (index: number): string => {
    const base = classes[index] ?? ''
    const extra = extras?.get(index)
    return extra ? (base ? `${base} ${extra}` : extra) : base
  }

  let html = ''
  let offset = 0
  const lines = text.split('\n')

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]
    const end = offset + line.length
    html += `<div class="pe-line${n === currentLine ? ' pe-current' : ''}">`

    let runClass = ''
    let run = ''
    const flush = () => {
      if (run === '') return
      html += runClass ? `<span class="${runClass}">${escapeHtml(run)}</span>` : escapeHtml(run)
      run = ''
    }

    for (let i = offset; i <= end; i++) {
      if (caret === i) {
        flush()
        html += '<span class="pe-caret"></span>'
      }
      if (i === end) break

      const cls = classAt(i)
      if (cls !== runClass) {
        flush()
        runClass = cls
      }
      run += text[i]
    }
    flush()

    if (line === '') html += '&#8203;'
    html += '</div>'
    offset = end + 1
  }

  return html
}
