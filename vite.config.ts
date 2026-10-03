import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// In development the browser only talks to Vite; these paths are forwarded
// to LMS so requests stay same-origin (LMS doesn't send CORS headers).
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.LMS_HOST || 'http://localhost:9000'
  // /settings and friends are LMS's own settings pages, shown in a frame.
  // They're styled by Material Skin, whose files live under /material.
  const paths = ['/jsonrpc.js', '/music', '/imageproxy', '/settings', '/plugins', '/html', '/material', '/skin.css', '/slimserver.css', '/setup.html', '/home.html']
  const proxy = Object.fromEntries(paths.map((p) => [p, { target, changeOrigin: true }]))
  return {
    // The LMS plugin serves the built app at /mixdesk/.
    base: command === 'build' ? '/mixdesk/' : '/',
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})
