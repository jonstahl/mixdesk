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
would fail. It also forwards LMS's settings pages (`/settings`, `/plugins`)
and the files they need (`/html`, `/material`, ...), which the Settings view
(gear icon) shows in a frame, styled by Material Skin.

## Install on LMS

Mixdesk ships as an LMS plugin that serves the built app at
`http://<your-lms>:9000/mixdesk/`, so it works from any device without the
dev server.

```
npm run package   # build/Mixdesk (the plugin) and build/Mixdesk-<version>.zip
npm run deploy    # package, then copy to MIXDESK_DEPLOY over ssh
```

`MIXDESK_DEPLOY` (in `.env.local`) is `host:path` to LMS's
`<cachedir>/Plugins` folder on the server, e.g.
`nas:/volume1/docker/lms/cache/Plugins` for a Docker install whose `/config`
is `/volume1/docker/lms`. The Docker build of LMS loads plugins from there
and treats them as manually installed. Don't use `InstalledPlugins`: LMS
uninstalls anything there that it didn't install from a repository.

Restart LMS after the first deploy, and whenever `Plugin.pm` changes. App
changes are live as soon as a deploy finishes; just reload the page.

## How it works

- **Running order** (right): what's playing and what's next, with each
  track's length. Played tracks are folded away.
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
| `q` / `l` | Go to the queue / library | |

Any other letter opens search with that letter typed in, so you can type
without opening search first. Searches starting with q or l need `/` first.

In search, `Enter` does the obvious thing for each kind of result and the
modifiers mean the same everywhere:

| | Enter | ⌘Enter | Shift+Enter | Alt+Enter |
| --- | --- | --- | --- | --- |
| Track | Mix from it | Play now | Play next | Add to end |
| Album | Open | Play (replaces queue, undoable) | Play next | Add to end |
| Artist | Open | Mix from artist | | |

The highlighted result also shows these as buttons. Mix options only appear
when MusicIP has analysed the track, album or artist. Tracks are listed
first unless the query exactly names an artist or album and no track.
