import { useEffect, useRef } from 'react'
import type { Rgb } from './palette'

// The page's --ink, as 0-1 RGB. The shader only ever tints this.
const INK: Rgb = [0x18 / 255, 0x21 / 255, 0x2b / 255]
const FALLBACK: Rgb[] = [[0.94, 0.71, 0.24]]
const FADE_MS = 1200
const FRAME_MS = 1000 / 30

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`

// Two layers of domain-warped value noise pick between three cover colours.
// It stays dark and low in contrast: text sits on top of it.
const FRAG = `
precision mediump float;
uniform vec2 res;
uniform float t;
uniform vec3 ink, c0, c1, c2;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.6 * noise(p) + 0.3 * noise(p * 2.0 + 7.0) + 0.1 * noise(p * 4.0 + 3.0); }

void main() {
  vec2 uv = gl_FragCoord.xy / res.y;
  vec2 q = vec2(fbm(uv * 1.4 + vec2(0.0, t * 0.05)), fbm(uv * 1.4 + vec2(5.2, 1.3 - t * 0.04)));
  float a = fbm(uv * 1.1 + 2.5 * q + vec2(t * 0.03, 0.0));
  float b = fbm(uv * 0.9 - 2.0 * q + vec2(1.7, 9.2 + t * 0.02));
  vec3 col = mix(c0, c1, smoothstep(0.25, 0.75, a));
  col = mix(col, c2, smoothstep(0.35, 0.8, b) * 0.7);
  float strength = 0.16 + 0.22 * smoothstep(0.2, 0.9, a * b * 2.0);
  gl_FragColor = vec4(mix(ink, col, strength), 1.0);
}`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return s
}

/**
 * A slow WebGL colour field behind the now-playing pane, tinted by the cover.
 * It draws at a quarter of the pixels and 30fps, stands still while paused or
 * hidden, and cross-fades when the cover changes. Without WebGL it renders
 * nothing and the CSS wash underneath shows instead.
 */
export function Backdrop({ colours, playing }: { colours: Rgb[]; playing: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // The loop reads these; React just feeds them.
  const live = useRef({ playing, colours, changed: 0 })
  const target = useRef<Rgb[]>([])

  useEffect(() => {
    const c = colours.length ? colours : FALLBACK
    // Three slots: repeat the colours we have, nudged so a lone cover still has depth.
    target.current = [c[0], c[1] ?? c[0], c[2] ?? c[1] ?? c[0]]
    live.current = { playing, colours: c, changed: performance.now() }
  }, [colours, playing])

  useEffect(() => {
    const el = canvas.current
    const gl = el?.getContext('webgl', { antialias: false, powerPreference: 'low-power' })
    if (!el || !gl) return
    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const u = (n: string) => gl.getUniformLocation(prog, n)
    const [uRes, uT, uInk, uC] = [u('res'), u('t'), u('ink'), [u('c0'), u('c1'), u('c2')]]
    gl.uniform3fv(uInk, INK)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let shown: Rgb[] = [INK, INK, INK]
    let from: Rgb[] = shown
    let seenChange = -1
    let time = 0
    let speed = 0
    let last = performance.now()
    let drawn = 0
    let raf = 0
    let revealed = false

    const resize = () => {
      const w = Math.max(1, Math.round(el.clientWidth / 2))
      const h = Math.max(1, Math.round(el.clientHeight / 2))
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
        gl.viewport(0, 0, w, h)
        drawn = 0
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden || now - drawn < FRAME_MS) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { changed, playing: on } = live.current
      if (changed !== seenChange) {
        seenChange = changed
        from = shown
      }
      const k = reduced.matches ? 1 : Math.min(1, (now - changed) / FADE_MS)
      const e = k * k * (3 - 2 * k)
      const to = target.current
      shown = to.map((c, i) => c.map((v, j) => from[i][j] + (v - from[i][j]) * e) as Rgb)
      speed += ((on && !reduced.matches ? 1 : 0) - speed) * Math.min(1, dt * 2)
      // Nothing is moving and nothing is fading: keep the last frame.
      if (speed < 0.002 && k >= 1 && drawn) return
      time += dt * speed
      resize()
      drawn = now
      gl.uniform2f(uRes, el.width, el.height)
      gl.uniform1f(uT, time)
      shown.forEach((c, i) => gl.uniform3fv(uC[i], c))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!revealed) {
        revealed = true
        el.classList.add('is-ready')
      }
    }
    raf = requestAnimationFrame(frame)
    const ro = new ResizeObserver(() => (drawn = 0))
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <canvas ref={canvas} className="backdrop" aria-hidden="true" />
}
