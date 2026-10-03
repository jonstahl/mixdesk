// Packages the plugin and copies it to the LMS server over ssh.
//
// MIXDESK_DEPLOY in .env.local names the target, e.g.
//   MIXDESK_DEPLOY=nas:/volume1/docker/lms/cache/Plugins
// That is LMS's <cachedir>/Plugins on the host. The Docker build of LMS
// loads plugins from there and, unlike InstalledPlugins, never removes them
// during its update checks.
//
// Front-end changes are live as soon as this finishes (reload the page).
// LMS only needs a restart the first time, or when Plugin.pm changes.
import { execFileSync, spawnSync } from 'node:child_process'

const target = process.env.MIXDESK_DEPLOY
if (!target || !target.includes(':')) {
  console.error('Set MIXDESK_DEPLOY=host:/path/to/lms/cache/Plugins in .env.local')
  process.exit(1)
}
const [host, dir] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)]
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`

execFileSync('node', ['scripts/package.mjs'], { stdio: 'inherit' })

// Replace the whole plugin folder so deleted files don't linger.
const tar = spawnSync('tar', ['-C', 'build', '-cf', '-', 'Mixdesk'], { maxBuffer: 1 << 28 })
if (tar.status !== 0) throw new Error(tar.stderr.toString())
const remote = `mkdir -p ${q(dir)} && rm -rf ${q(dir + '/Mixdesk')} && tar -C ${q(dir)} -xf -`
const ssh = spawnSync('ssh', [host, remote], { input: tar.stdout, stdio: ['pipe', 'inherit', 'inherit'] })
if (ssh.status !== 0) process.exit(ssh.status ?? 1)

console.log(`\nDeployed to ${target}/Mixdesk`)
