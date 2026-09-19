import { Vector3 } from 'three'
import { interiorToWorld } from './sceneLayout'

// Short bounded segments in cabin space. Never inherit tangents from the
// exterior orbit. Eye clearance is checked against the final GLB, not boxes.
const stops = [
  [.46, [0,1.1,0], [0,1.1,4]],
  [.475, [0,1.1,1.4], [0,1.1,5]],
  [.49, [0,1.6,3.8], [0,1.3,1.35]],
  [.532, [0,1.6,3.8], [0,1.3,1.35]],
  [.548, [0,1.6,3.8], [0,1.6,7]],
  [.56, [0,1.6,6.7], [0,1.6,10]],
  [.568, [0,1.6,7.95], [0,1.6,12]],
  [.576, [-1.32,1.6,7.95], [-1.32,1.6,14]],
  [.5896, [-1.32,1.6,18], [-1.32,1.6,24]],
  [.628, [-1.32,1.6,18], [-1.32,1.6,24]],
  [.674, [-1.32,1.6,25.8], [-1.32,2.5,29]],
  [.7048, [-1.32,2.95,29], [-1.32,4.05,33]],
  [.7304, [-1.32,2.95,29], [-1.32,4.05,33]],
  [.752, [-1.32,4.05,32.2], [-1.32,4.05,37]],
  [.7816, [-1.32,4.05,36.5], [-1.32,4.05,41]],
  [.82, [-1.32,4.05,36.5], [-1.32,4.05,41]],
  [.827, [-1.32,4.05,39.6], [-2.78,4.05,40.5]],
  [.83, [-1.32,4.05,40.5], [-4,4.05,40.5]],
  [.835, [-4.2,4.05,40.5], [-8,4.05,40.5]],
] as const
export function sampleCabinRoute(p: number) {
  if (p < .46 || p > .835) return null
  const i = Math.max(0, stops.findIndex((_,index) => index < stops.length-1 && p <= stops[index+1][0]))
  const a=stops[i], b=stops[i+1]
  const t0=Math.min(1,Math.max(0,(p-a[0])/(b[0]-a[0])))
  const t=t0*t0*(3-2*t0)
  const pa=new Vector3(...interiorToWorld(a[1])), pb=new Vector3(...interiorToWorld(b[1]))
  // Orientation has its own bounded turn envelope. Using the tiny position
  // segments for a 180-degree turn would exceed the existing angular budget.
  const blend = (start: number, end: number) => {
    const x = Math.min(1, Math.max(0, (p-start)/(end-start))), r=.02
    if (x<r) return (.5*x-r/(2*Math.PI)*Math.sin(Math.PI*x/r))/(1-r)
    if (x>1-r) { const q=1-x; return 1-(.5*q-r/(2*Math.PI)*Math.sin(Math.PI*q/r))/(1-r) }
    return (x-r/2)/(1-r)
  }
  const yaw = Math.PI*blend(.46,.5215)-Math.PI*blend(.532,.594)-Math.PI/2*blend(.795,.835)
  const origin = new Vector3(...interiorToWorld([0,0,0]))
  const direction = new Vector3(...interiorToWorld([Math.sin(yaw),0,Math.cos(yaw)])).sub(origin).normalize()
  const position=pa.lerp(pb,t)
  return {position,target:position.clone().addScaledVector(direction,5),fov:50,rollRad:0}
}
