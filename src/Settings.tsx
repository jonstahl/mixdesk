import type { SyntheticEvent } from 'react'
import { href } from './router'

// LMS's own settings pages, framed. Each page has LMS's section dropdown,
// which also reaches plugin settings such as MusicIP and Don't Stop The Music.
export function Settings({ section, player, onClose }: { section: 'server' | 'player'; player: string | null; onClose: () => void }) {
  const src =
    section === 'player' && player
      ? `/settings/player/basic.html?playerid=${encodeURIComponent(player)}`
      : '/settings/server/basic.html'
  return (
    <section className="settings" aria-label="Settings">
      <header className="settings-head">
        <h2 className="page-title">Settings</h2>
        <nav className="segmented settings-tabs" aria-label="Settings for">
          <a href={href({ page: 'settings', section: 'server' })} aria-current={section === 'server' ? 'page' : undefined}>
            Server
          </a>
          <a href={href({ page: 'settings', section: 'player' })} aria-current={section === 'player' ? 'page' : undefined}>
            Player
          </a>
        </nav>
        <button className="text-btn" onClick={onClose}>
          Done <kbd>Esc</kbd>
        </button>
      </header>
      <iframe
        key={src}
        className="settings-frame"
        src={src}
        title={`${section === 'player' ? 'Player' : 'Server'} settings`}
        onLoad={(e) => {
          theme(e)
          closeOnEscape(e, onClose)
        }}
      />
    </section>
  )
}

/**
 * Keys pressed inside the frame never reach Mixdesk, so listen for Esc there
 * too, unless it's closing one of the page's own dropdowns or leaving a field.
 */
function closeOnEscape(e: SyntheticEvent<HTMLIFrameElement>, onClose: () => void) {
  const doc = e.currentTarget.contentDocument
  doc?.addEventListener('keydown', (k) => {
    const tag = (k.target as HTMLElement | null)?.tagName
    const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    if (k.key === 'Escape' && !inField && !doc.querySelector('.custom-select-container.is-open')) onClose()
  })
}

/**
 * Material Skin styles these pages with CSS variables that its own app
 * injects into the frame (popup background, hover colour, shadows...).
 * Without them dropdown panels render transparent over the page. Supply
 * them from Mixdesk's palette so the pages match the rest of the desk.
 * Runs on every load, since the section dropdown navigates the frame.
 */
function theme(e: SyntheticEvent<HTMLIFrameElement>) {
  const win = e.currentTarget.contentWindow
  const doc = e.currentTarget.contentDocument
  if (!win || !doc) return

  const root = getComputedStyle(document.documentElement)
  const token = (name: string) => root.getPropertyValue(name).trim()
  // --accent may be an hsl() or var() expression; let the browser resolve it to rgb().
  const probe = document.createElement('span')
  probe.style.color = 'var(--accent)'
  document.body.append(probe)
  const accent = getComputedStyle(probe).color
  probe.remove()
  const rgb = accent.match(/\d+/g)?.slice(0, 3).join(',') ?? '240,180,60'

  const vars: Record<string, string> = {
    '--background-color': token('--ink'),
    '--text-color': token('--paper'),
    '--popup-background-color': token('--deck-hi'),
    '--std-popup-background-color': token('--deck-hi'),
    '--list-hover-color': token('--line'),
    '--border-color': token('--line'),
    '--list-item-border-color': token('--line'),
    '--range-trough-color': token('--line'),
    '--scrollbar-thumb-color': token('--line'),
    '--scrollbar-track-color': 'transparent',
    '--primary-color': accent,
    '--accent-color': accent,
    '--active-color': accent,
    '--pq-current-color': accent,
    '--highlight-rgb': rgb,
    '--menu-dlg-shadow': '0 8px 24px rgba(0, 0, 0, 0.45)',
    '--all-pad': '0px',
    '--vh': `${win.innerHeight / 100}px`,
  }
  let style = doc.getElementById('mixdesk-theme')
  if (!style) {
    style = doc.createElement('style')
    style.id = 'mixdesk-theme'
    doc.head.append(style)
  }
  style.textContent = `:root { ${Object.entries(vars)
    .map(([k, v]) => `${k}: ${v} !important;`)
    .join(' ')} }`
}
