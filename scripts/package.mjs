// Builds the app and assembles the LMS plugin in build/Mixdesk, plus a zip.
// The version comes from package.json and is stamped into install.xml.
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

run('npm', ['run', 'build'])

rmSync('build', { recursive: true, force: true })
cpSync('lms-plugin/Mixdesk', 'build/Mixdesk', { recursive: true })
// LMS serves .js/.css from plugins' HTML/EN folders itself; see Plugin.pm.
cpSync('dist', 'build/Mixdesk/HTML/EN/mixdesk', { recursive: true })
cpSync('LICENSE', 'build/Mixdesk/LICENSE')

const manifest = 'build/Mixdesk/install.xml'
writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/<version>[^<]*<\/version>/, `<version>${version}</version>`))

run('zip', ['-qr', `Mixdesk-${version}.zip`, 'Mixdesk'], { cwd: 'build' })
console.log(`\nPackaged build/Mixdesk (v${version}) and build/Mixdesk-${version}.zip`)
