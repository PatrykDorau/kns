// Klatka studia → YUV 4:2:0 (I420, BT.709, zakres TV) na karcie graficznej, odczyt bez zatrzymywania pętli.
// Po co: surowa klatka RGBX 1080p to 8,3 MB — przy 50 kl./s ponad 400 MB/s kopiowania z karty, przez proces główny
// do FFmpeg (plus przeliczanie kolorów w FFmpeg). I420 to 3,1 MB, kolory przelicza karta, a odczyt idzie przez bufory
// w tle (bez czekania na kartę) — jeden bufor wielokrotnego użytku zamiast nowej tablicy co klatkę.
// Układ wyjścia (płótno W/4 × H·3/2, 4 bajty na piksel): najpierw H wierszy luminancji (Y), potem U i V po H/4 wierszy.
const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`
const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D src; uniform int W; uniform int H;
out vec4 o;
float yOf(vec3 c) { return 0.0627 + dot(c, vec3(0.1826, 0.6142, 0.0620)); }
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  vec4 r;
  if (f.y < H) {
    for (int k = 0; k < 4; k++) r[k] = yOf(texelFetch(src, ivec2(f.x * 4 + k, f.y), 0).rgb);
  } else {
    int cw = W / 2, q = cw * (H / 2);
    int idx = (f.y - H) * W + f.x * 4;
    bool v = idx >= q;
    if (v) idx -= q;
    int cy = idx / cw, cx0 = idx - cy * cw;
    for (int k = 0; k < 4; k++) {
      ivec2 s = ivec2((cx0 + k) * 2, cy * 2);
      vec3 c = (texelFetch(src, s, 0).rgb + texelFetch(src, s + ivec2(1, 0), 0).rgb + texelFetch(src, s + ivec2(0, 1), 0).rgb + texelFetch(src, s + ivec2(1, 1), 0).rgb) * 0.25;
      r[k] = v ? 0.5020 + dot(c, vec3(0.4392, -0.3989, -0.0403)) : 0.5020 + dot(c, vec3(-0.1006, -0.3386, 0.4392));
    }
  }
  o = r;
}`

type Slot = { pbo: WebGLBuffer, fence: WebGLSync | null }
export class YuvReader {
  gl: WebGL2RenderingContext
  w: number; h: number; ow: number; oh: number; bytes: number
  tex: WebGLTexture; slots: Slot[] = []; out: Uint8Array
  static create(w: number, h: number) {
    try { return new YuvReader(w, h) } catch { return null }
  }
  constructor(w: number, h: number) {
    if (w % 8 || h % 4) throw new Error('rozmiar')
    this.w = w; this.h = h; this.ow = w / 4; this.oh = h * 3 / 2; this.bytes = w * h * 3 / 2
    const c = document.createElement('canvas'); c.width = this.ow; c.height = this.oh
    const gl = c.getContext('webgl2', { alpha: true, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('brak WebGL2')
    this.gl = gl
    const sh = (t: number, s: string) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x }
    const pr = gl.createProgram()
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr))
    gl.useProgram(pr)
    gl.uniform1i(gl.getUniformLocation(pr, 'W'), w); gl.uniform1i(gl.getUniformLocation(pr, 'H'), h)
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.viewport(0, 0, this.ow, this.oh)
    for (let i = 0; i < 3; i++) {
      const pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo)
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.bytes, gl.STREAM_READ)
      this.slots.push({ pbo, fence: null })
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    this.out = new Uint8Array(this.bytes)
  }
  // Gotowe klatki z poprzednich wywołań → send; `into` daje bufor na klatkę (domyślnie jeden wspólny).
  drain(send: (b: Uint8Array) => void, into: () => Uint8Array = () => this.out) {
    const gl = this.gl
    for (const s of this.slots) {
      if (!s.fence) continue
      const st = gl.clientWaitSync(s.fence, 0, 0)
      if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) continue
      gl.deleteSync(s.fence); s.fence = null
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo)
      const out = into()
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      send(out)
    }
  }
  // Nowa klatka do przeliczenia; false — wszystkie bufory jeszcze w drodze (karta nie nadąża).
  push(src: TexImageSource): boolean {
    const gl = this.gl
    const s = this.slots.find(x => !x.fence)
    if (!s) return false
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo)
    gl.readPixels(0, 0, this.ow, this.oh, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    s.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    gl.flush()
    return true
  }
  // Ile klatek wciąż w drodze.
  pending() { return this.slots.filter(s => s.fence).length }
  dispose() {
    const gl = this.gl
    for (const s of this.slots) { if (s.fence) gl.deleteSync(s.fence); gl.deleteBuffer(s.pbo) }
    gl.deleteTexture(this.tex)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
