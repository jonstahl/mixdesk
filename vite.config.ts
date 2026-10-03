import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// In development the browser only talks to Vite; these paths are forwarded
// to LMS so requests stay same-origin (LMS doesn't send CORS headers).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.LMS_HOST || 'http://localhost:9000'
  const proxy = Object.fromEntries(
    ['/jsonrpc.js', '/music', '/imageproxy'].map((p) => [p, { target, changeOrigin: true }]),
  )
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})
