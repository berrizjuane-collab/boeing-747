import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial } from 'three'
import { reducedMotionState } from '../state/reducedMotion'

/**
 * Round 5: the A380's exterior lights as one additive point-sprite draw
 * call, parented to the aircraft's pose group (ExteriorAsset.tsx) so they
 * ride the taxi jitter and the S2 rotation for free. Positions are
 * measured from the loaded hull's own vertex extremes (wingtips, fin tip,
 * crown, belly) rather than guessed, so they land on the real geometry.
 *
 * Blink programs (uniform `time`, frozen under prefers-reduced-motion so
 * every light holds steady instead of flashing):
 *   0 — steady (red port / green starboard navigation, white tail)
 *   1 — red anti-collision beacon, slow rotating pulse
 *   2 — white strobe, double flash every ~1.3 s
 */
export interface AircraftExtremes {
  portWingtip: [number, number, number]
  starboardWingtip: [number, number, number]
  finTip: [number, number, number]
  crown: [number, number, number]
  belly: [number, number, number]
  tailCone: [number, number, number]
}

interface LightSpec {
  position: [number, number, number]
  color: string
  size: number
  program: 0 | 1 | 2
  phase: number
}

function specs(extremes: AircraftExtremes): LightSpec[] {
  const [px, py, pz] = extremes.portWingtip
  const [sx, sy, sz] = extremes.starboardWingtip
  return [
    { position: [px, py + 0.15, pz], color: '#ff2a1e', size: 2.6, program: 0, phase: 0 },
    { position: [sx, sy + 0.15, sz], color: '#2dff6a', size: 2.6, program: 0, phase: 0 },
    { position: [px + 0.6, py + 0.2, pz + 0.4], color: '#ffffff', size: 3.4, program: 2, phase: 0 },
    { position: [sx - 0.6, sy + 0.2, sz + 0.4], color: '#ffffff', size: 3.4, program: 2, phase: 0 },
    { position: extremes.tailCone, color: '#fff6e0', size: 2.2, program: 0, phase: 0 },
    { position: [extremes.finTip[0], extremes.finTip[1] - 0.3, extremes.finTip[2]], color: '#fff6e0', size: 1.8, program: 2, phase: 0.5 },
    { position: extremes.crown, color: '#ff3b2a', size: 3.0, program: 1, phase: 0 },
    { position: extremes.belly, color: '#ff3b2a', size: 3.0, program: 1, phase: 0.5 },
  ]
}

export function AircraftNavLights({ extremes }: { extremes: AircraftExtremes }) {
  const geometry = useMemo(() => {
    const list = specs(extremes)
    const positions = new Float32Array(list.length * 3)
    const colors = new Float32Array(list.length * 3)
    const sizes = new Float32Array(list.length)
    const programs = new Float32Array(list.length)
    const phases = new Float32Array(list.length)
    const color = new Color()
    list.forEach((light, index) => {
      positions.set(light.position, index * 3)
      color.set(light.color)
      colors.set([color.r, color.g, color.b], index * 3)
      sizes[index] = light.size
      programs[index] = light.program
      phases[index] = light.phase
    })
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    result.setAttribute('aColor', new Float32BufferAttribute(colors, 3))
    result.setAttribute('aSize', new Float32BufferAttribute(sizes, 1))
    result.setAttribute('aProgram', new Float32BufferAttribute(programs, 1))
    result.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
    result.computeBoundingSphere()
    return result
  }, [extremes])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: 'Aircraft · Navigation lights',
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { time: { value: 0 }, pixelScale: { value: 900 } },
        vertexShader: /* glsl */ `
          attribute vec3 aColor;
          attribute float aSize;
          attribute float aProgram;
          attribute float aPhase;
          uniform float time;
          uniform float pixelScale;
          varying vec3 vColor;
          varying float vIntensity;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float t = time + aPhase;
            float intensity = 1.0;
            if (aProgram > 1.5) {
              // Double flash: two 60 ms pops every 1.3 s.
              float cycle = fract(t / 1.3) * 1.3;
              intensity = (cycle < 0.06 || (cycle > 0.16 && cycle < 0.22)) ? 1.0 : 0.0;
            } else if (aProgram > 0.5) {
              intensity = 0.15 + 0.85 * pow(max(0.0, sin(t * 4.2)), 3.0);
            }
            vColor = aColor;
            vIntensity = intensity;
            gl_PointSize = clamp(aSize * pixelScale / max(1.0, -mvPosition.z), 2.0, 48.0) * (0.6 + 0.4 * intensity);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vIntensity;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
            if (d > 1.0 || vIntensity < 0.02) discard;
            float core = 1.0 - smoothstep(0.0, 0.22, d);
            float halo = pow(1.0 - d, 2.6) * 0.55;
            gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.7) * (core + halo) * vIntensity, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  )

  useFrame(({ clock, size }) => {
    if (!reducedMotionState.active) material.uniforms.time.value = clock.elapsedTime
    material.uniforms.pixelScale.value = size.height * 0.9
  })

  return <points name="Aircraft · Navigation and anti-collision lights" geometry={geometry} material={material} frustumCulled={false} />
}
