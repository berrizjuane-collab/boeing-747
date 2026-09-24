import {
  EquirectangularReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'

/**
 * Number of distinct mixes a hand-over is drawn with. Each step is 1/16 of
 * the colour change, spread over a quarter to a half percent of scroll,
 * while bounding the PMREM convolutions a crossing costs to 16 however the
 * visitor scrolls (measured: one convolution at the 512 cube cost ~12 s on
 * a two-core software renderer; at 256 it is about a quarter of that).
 */
export const BLEND_STEPS = 16

/**
 * Mixes two equirectangular probes into one render target that three.js then
 * convolves as the scene environment (plan6 4.3: blending two probes rather
 * than swapping one). The target is used for every frame, blended or not,
 * so reflections keep one resolution across the whole route instead of
 * sharpening or softening at the edges of a blend window.
 */
export class ProbeBlender {
  readonly target: WebGLRenderTarget
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: ShaderMaterial
  private readonly quad: Mesh
  private last: { a: Texture; b: Texture; step: number } | null = null

  // 1024x512 convolves to a 256 cube (PMREMGenerator uses width / 4), the
  // resolution three uses for its own generated environments.
  constructor(width = 1024, height = 512) {
    this.target = new WebGLRenderTarget(width, height, {
      type: HalfFloatType,
      depthBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      generateMipmaps: false,
    })
    this.target.texture.mapping = EquirectangularReflectionMapping
    this.target.texture.colorSpace = LinearSRGBColorSpace
    this.material = new ShaderMaterial({
      uniforms: { a: { value: null }, b: { value: null }, weight: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // Sources decode to linear on sampling (half-float HDRIs as-is, the
      // sRGB cabin fill through its texture format), so the mix is linear.
      fragmentShader:
        'uniform sampler2D a; uniform sampler2D b; uniform float weight; varying vec2 vUv;' +
        'void main() { gl_FragColor = vec4(mix(texture2D(a, vUv).rgb, texture2D(b, vUv).rgb, weight), 1.0); }',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  /** Returns the environment texture for `a` mixed toward `b` by `weight`. */
  update(renderer: WebGLRenderer, a: Texture, b: Texture, weight: number): Texture {
    const step = a === b ? 0 : Math.round(Math.min(1, Math.max(0, weight)) * BLEND_STEPS)
    const last = this.last
    if (last && last.a === a && last.b === b && last.step === step) return this.target.texture
    this.material.uniforms.a.value = a
    this.material.uniforms.b.value = b
    this.material.uniforms.weight.value = step / BLEND_STEPS
    const previousTarget = renderer.getRenderTarget()
    const previousXr = renderer.xr.enabled
    renderer.xr.enabled = false
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(previousTarget)
    renderer.xr.enabled = previousXr
    // Bumps pmremVersion, so the renderer re-convolves this target into
    // the same cubeUV render target on its next use.
    this.target.texture.needsPMREMUpdate = true
    this.last = { a, b, step }
    return this.target.texture
  }

  dispose() {
    // A disposed target loses its contents; forget the last mix so a reuse
    // (StrictMode remounts the owner's effects) redraws instead of returning
    // an empty texture.
    this.last = null
    this.target.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
