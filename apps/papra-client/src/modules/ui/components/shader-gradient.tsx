import type { Component } from 'solid-js';
import { onCleanup, onMount } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

// Lightweight WebGL port of a shadergradient.co "plane" preset: domain-warped noise bands, soft lighting and film grain
const vertexShaderSource = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;

// Simplex 3D noise (Ashima Arts, MIT)
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / uResolution.y;

  // Plane tilted ~50deg and shifted left, like rotationZ=50 / positionX=-1.4
  float angle = 0.87;
  p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * (p + vec2(0.35, 0.0));

  float t = uTime;

  // Domain warp (uDensity / uStrength)
  vec2 q = vec2(
    snoise(vec3(p * 0.9, t * 0.6)),
    snoise(vec3(p * 0.9 + vec2(5.2, 1.3), t * 0.6))
  );
  float n = snoise(vec3(p * 0.8 + q * 1.2, t));

  // Long flowing folds (uFrequency)
  float wave = sin(p.y * 2.75 + n * 2.2 + t * 1.5) * 0.5 + 0.5;

  vec3 color = mix(uColor2, uColor1, smoothstep(0.1, 0.9, wave));
  color = mix(color, uColor3, smoothstep(0.0, 0.85, q.x * 0.5 + 0.5) * 0.85);
  color = mix(color, uColor4, smoothstep(0.35, 1.0, q.y * 0.5 + 0.5) * 0.75);

  // Fake 3d lighting on the folds + brightness 1.2
  float light = 0.88 + 0.22 * (wave * 0.6 + n * 0.4);
  color *= light * 1.12;

  // Static film grain
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * 0.07;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function compileShader({ gl, type, source }: { gl: WebGLRenderingContext; type: number; source: string }) {
  const shader = gl.createShader(type);
  if (!shader) {
    return undefined;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return undefined;
  }

  return shader;
}

export const ShaderGradient: Component<{
  class?: string;
  colors?: [string, string, string, string];
  // Time units per second, lower is slower
  speed?: number;
}> = (props) => {
  let canvas: HTMLCanvasElement | undefined;

  onMount(() => {
    const gl = canvas?.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!canvas || !gl) {
      return;
    }

    const vertexShader = compileShader({ gl, type: gl.VERTEX_SHADER, source: vertexShaderSource });
    const fragmentShader = compileShader({ gl, type: gl.FRAGMENT_SHADER, source: fragmentShaderSource });
    const program = gl.createProgram();
    if (!vertexShader || !fragmentShader || !program) {
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, 'uResolution');
    const timeLocation = gl.getUniformLocation(program, 'uTime');

    const [color1, color2, color3, color4] = props.colors ?? ['#ff5005', '#dbba95', '#d0bce1', '#6c7fd8'];
    gl.uniform3fv(gl.getUniformLocation(program, 'uColor1'), hexToRgb(color1));
    gl.uniform3fv(gl.getUniformLocation(program, 'uColor2'), hexToRgb(color2));
    gl.uniform3fv(gl.getUniformLocation(program, 'uColor3'), hexToRgb(color3));
    gl.uniform3fv(gl.getUniformLocation(program, 'uColor4'), hexToRgb(color4));

    const resize = () => {
      if (!canvas) {
        return;
      }

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1);
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    };

    const speed = props.speed ?? 0.025;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Random start so the gradient doesn't look identical on every load
    const timeOffset = Math.random() * 100;
    const frameInterval = 1000 / 30;
    let lastFrameAt = 0;
    let animationFrame = 0;

    const draw = (now: number) => {
      gl.uniform1f(timeLocation, timeOffset + (now / 1000) * speed);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (now: number) => {
      animationFrame = requestAnimationFrame(loop);
      if (now - lastFrameAt < frameInterval) {
        return;
      }

      lastFrameAt = now;
      draw(now);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (prefersReducedMotion) {
        draw(0);
      }
    });
    resizeObserver.observe(canvas);
    resize();

    if (prefersReducedMotion) {
      draw(0);
    } else {
      animationFrame = requestAnimationFrame(loop);
    }

    onCleanup(() => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(buffer);
    });
  });

  return <canvas ref={canvas} class={cn('block size-full', props.class)} aria-hidden="true" />;
};
