// Builds the app and assembles the LMS plugin in build/Mixdesk, plus a zip.
// The version comes from package.json and is stamped into install.xml.
//
// Also writes repo.xml, the LMS plugin repository file users add under
// Settings → Manage Plugins. It points at the zip on this version's GitHub
// release and carries the zip's SHA-1, which LMS checks before installing,
// so the release must get exactly this zip: upload build/Mixdesk-<version>.zip
// and commit repo.xml together, without packaging again in between.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const { version, repository } = JSON.parse(readFileSync('package.json', 'utf8'))

run('npm', ['run', 'build'])

rmSync('build', { recursive: true, force: true })
cpSync('lms-plugin/Mixdesk', 'build/Mixdesk', { recursive: true })
// LMS serves .js/.css from plugins' HTML/EN folders itself; see Plugin.pm.
cpSync('dist', 'build/Mixdesk/HTML/EN/mixdesk', { recursive: true })
cpSync('LICENSE', 'build/Mixdesk/LICENSE')

const manifest = 'build/Mixdesk/install.xml'
writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/<version>[^<]*<\/version>/, `<version>${version}</version>`))

const zip = `Mixdesk-${version}.zip`
run('zip', ['-qr', zip, 'Mixdesk'], { cwd: 'build' })

// --- repo.xml ----------------------------------------------------------------

const install = readFileSync(manifest, 'utf8')
const tag = (name) => install.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? ''
const desc = readFileSync('lms-plugin/Mixdesk/strings.txt', 'utf8').match(/PLUGIN_MIXDESK_DESC\s*\n\s*EN\s+(.+)/)?.[1] ?? ''
const sha = createHash('sha1').update(readFileSync(`build/${zip}`)).digest('hex')
const home = repository.url.replace(/\.git$/, '')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

writeFileSync(
  'repo.xml',
  `<?xml version="1.0"?>
<extensions>
	<details>
		<title lang="EN">Mixdesk</title>
	</details>
	<plugins>
		<plugin name="Mixdesk" version="${version}" minTarget="${tag('minVersion')}" maxTarget="${tag('maxVersion')}">
			<title lang="EN">Mixdesk</title>
			<desc lang="EN">${esc(desc)}</desc>
			<creator>${esc(tag('creator'))}</creator>
			<category>${tag('category')}</category>
			<link>${home}</link>
			<url>${home}/releases/download/v${version}/${zip}</url>
			<sha>${sha}</sha>
		</plugin>
	</plugins>
</extensions>
`,
)

console.log(`\nPackaged build/Mixdesk (v${version}) and build/${zip}, and wrote repo.xml (sha1 ${sha})`)
