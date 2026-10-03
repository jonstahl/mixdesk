# Mixdesk

A web interface for Lyrion Music Server built around one way of listening:
pick a seed track, let MusicIP build the mix, then steer it by cutting and
adding tracks.

## Run it

```
cp .env.example .env.local   # set LMS_HOST to your server, e.g. http://10.0.0.54:9000
npm install
npm run dev                  # http://localhost:5180
```

Vite forwards `/jsonrpc.js` and `/music` to LMS so the browser stays
same-origin. LMS doesn't send CORS headers, so a direct cross-origin call
would fail.

## How it works

- **Running order** (right): what's playing and what's next, with the clock
  time each track starts. Played tracks are folded away.
- **Draft mixes**: "Mix from" asks MusicIP (`musicip mix`) for a mix *without
  touching the queue*. Cut what you don't want, then play it, queue it after
  the current track, or add it to the end. "New mix" asks again; MusicIP mixes
  are random, so each one is different.
- **Variety** slider writes `plugin.musicip:mix_variety`, the same server pref
  Don't Stop The Music uses for its automatic mixes.
- **Don't Stop The Music** seeds its next mix from five random tracks across the
  *whole* queue, played tracks included (see
  `Slim/Plugin/DontStopTheMusic/Plugin.pm`, `getMixableProperties`). That's
  why cutting a track, or clearing played tracks, changes where the mix goes.

## Keys

| Key | Running order | Draft |
| --- | --- | --- |
| `/` or `⌘K` | Search | Search |
| `j` `k` / arrows | Move selection | Move selection |
| `x` / Delete | Cut | Cut from draft |
| `n` | Play next | |
| `m` | Mix from selected | |
| `Enter` | Jump to selected | |
| `r` | | New mix |
| `⌘Enter` | | Play this mix (replaces queue) |
| `Esc` | | Discard |
| `u` / `⌘Z` | Undo the last cut or queue replacement | |
| Space | Play / pause | Play / pause |

Any other letter opens search with that letter typed in, so you can type
without opening search first.

In search: `Enter` drafts a mix, `Shift+Enter` plays next, `Alt+Enter` adds
to the end.
