import { useEffect, useRef } from 'react';

// Fondo "plasma de filamento" (WebGL, baja resolución, bandas cuantizadas).
// Si WebGL falla o se pierde el contexto, queda el degradé CSS de .bc-plasma (modo estático).
const FRAG = `
precision mediump float;
uniform vec2 res; uniform float time;
void main(){
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float a = 6.0 * r - 0.45 * time + 0.8 * sin(time * 0.15);
  float c = cos(a), s = sin(a);
  vec2 q = mat2(c, s, -s, c) * p;
  float field = 0.5 + 0.25 * sin(q.x * 9.0 + time * 0.6) + 0.25 * sin(q.y * 11.0 - time * 0.45);
  float band = floor(clamp(field, 0.0, 0.999) * 8.0) / 7.0;
  vec3 navy = vec3(0.035, 0.043, 0.125);
  vec3 violet = vec3(0.53, 0.24, 1.0);
  vec3 cyan = vec3(0.14, 0.86, 1.0);
  vec3 pink = vec3(1.0, 0.22, 0.72);
  vec3 tint = mix(violet, cyan, band);
  tint = mix(tint, pink, smoothstep(0.82, 1.0, band) * 0.5);
  // remolinos visibles en los bordes, más calmos en el centro (donde está la mesa)
  vec3 col = mix(navy, tint, 0.62 * (0.45 + 0.55 * smoothstep(0.12, 0.75, r)));
  gl_FragColor = vec4(col, 1.0);
}`;
const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

export default function Plasma({ still }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    let gl;
    try { gl = cv.getContext('webgl', { antialias: false, preserveDrawingBuffer: false }); } catch { gl = null; }
    if (!gl) return undefined;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return undefined;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return undefined;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(pr, 'res'), uTime = gl.getUniformLocation(pr, 'time');
    let raf = 0, lost = false;
    const onLost = (e) => { e.preventDefault(); lost = true; cv.classList.add('off'); };
    cv.addEventListener('webglcontextlost', onLost);
    const draw = (t) => {
      if (lost) return;
      gl.viewport(0, 0, cv.width, cv.height);
      gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform1f(uTime, t / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      cv.classList.remove('off');
      if (!still && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const onVis = () => { if (!document.hidden && !still) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); cv.removeEventListener('webglcontextlost', onLost); };
  }, [still]);
  // 192×108 lógicos, escalado con pixelado por CSS.
  return <canvas ref={ref} className="bc-plasma off" width={192} height={108} aria-hidden="true" />;
}
