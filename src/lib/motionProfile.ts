export interface MotionKnot {
  /** Global scroll progress. Strictly increasing across the knot list. */
  progress: number
  /** Cumulative traversal cost reached here. Non-decreasing. */
  cost: number
}

export interface MotionProfile {
  /** Cumulative cost at this progress. C1 and monotone by construction. */
  cost(progress: number): number
  /** d(cost)/d(progress). Zero only where the authored knots hold still. */
  speed(progress: number): number
  readonly totalCost: number
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/**
 * Integral of a cosine-shouldered rate: flat through the middle, easing in
 * and out over `ramp` of the interval. Peak rate is only 1/(1-ramp) times
 * the average, where a smoothstep peaks at 1.5x — the difference between a
 * turn that holds a comfortable angular rate and one that spikes halfway
 * through. Zero rate at both ends keeps it C1 where it is spliced in.
 */
export function rampedLinear(value: number, ramp = 0.05): number {
  const t = clamp(value, 0, 1)
  const normalization = 1 - ramp
  if (t < ramp) return (0.5 * t - (ramp / (2 * Math.PI)) * Math.sin((Math.PI * t) / ramp)) / normalization
  if (t > 1 - ramp) {
    const remaining = 1 - t
    return 1 - (0.5 * remaining - (ramp / (2 * Math.PI)) * Math.sin((Math.PI * remaining) / ramp)) / normalization
  }
  return (t - ramp / 2) / normalization
}

/**
 * Monotone cubic Hermite (Fritsch–Carlson) over (progress, cumulative cost).
 *
 * plan6 3.4 asks for C1 at every motion join and for zero velocity to be a
 * deliberate pause rather than a side effect of the band structure. A cubic
 * Hermite is C1 wherever its tangents are, and the Fritsch–Carlson tangent
 * rule gives exactly the wanted semantics for free: the weighted harmonic
 * mean of the two adjacent secants is non-zero whenever both are, and
 * collapses to zero only when one side genuinely does not move. A dwell
 * (equal costs across an interval) therefore produces a real stop, while two
 * consecutive travelling bands hand over at a shared, non-zero speed.
 *
 * The interpolant passes through every knot exactly, so re-timing a shot
 * never changes which keyframe the camera reaches at a gate.
 */
export function createMotionProfile(
  knots: readonly MotionKnot[],
  tangentOverrides: Readonly<Record<number, number>> = {},
): MotionProfile {
  if (knots.length < 2) throw new Error('A motion profile needs at least two knots')

  const p = knots.map((knot) => knot.progress)
  const c = knots.map((knot) => knot.cost)
  const last = knots.length - 1

  const h: number[] = []
  const secant: number[] = []
  for (let i = 0; i < last; i += 1) {
    h.push(p[i + 1] - p[i])
    if (h[i] <= 0) throw new Error(`Motion profile knots must strictly increase (knot ${i})`)
    const rise = c[i + 1] - c[i]
    if (rise < 0) throw new Error(`Motion profile cost must not decrease (knot ${i})`)
    secant.push(rise / h[i])
  }

  const m = new Array<number>(knots.length).fill(0)
  // Open ends settle: the hero opens from a hold and the footer comes to rest,
  // so the natural end tangent is the adjacent secant, clamped below.
  m[0] = secant[0]
  m[last] = secant[last - 1]
  for (let i = 1; i < last; i += 1) {
    const before = secant[i - 1]
    const after = secant[i]
    if (before <= 0 || after <= 0) {
      m[i] = 0
      continue
    }
    const w1 = 2 * h[i] + h[i - 1]
    const w2 = h[i] + 2 * h[i - 1]
    m[i] = (w1 + w2) / (w1 / before + w2 / after)
  }

  for (const [key, value] of Object.entries(tangentOverrides)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index > last) {
      throw new Error(`Tangent override ${key} is not a knot index`)
    }
    m[index] = value
  }

  // Fritsch–Carlson monotonicity bound. Overrides and end tangents are
  // clamped rather than rejected: an override expresses the speed a
  // neighbouring system hands over at, and 3x the local secant is the largest
  // slope a cubic can carry without turning back on itself.
  for (let i = 0; i <= last; i += 1) {
    let bound = Number.POSITIVE_INFINITY
    if (i > 0) bound = Math.min(bound, 3 * secant[i - 1])
    if (i < last) bound = Math.min(bound, 3 * secant[i])
    m[i] = clamp(m[i], 0, bound)
  }

  const segmentOf = (progress: number) => {
    if (progress <= p[0]) return 0
    if (progress >= p[last]) return last - 1
    let low = 0
    let high = last - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (p[mid] <= progress) low = mid
      else high = mid - 1
    }
    return low
  }

  return {
    totalCost: c[last],
    cost(progress) {
      if (progress <= p[0]) return c[0]
      if (progress >= p[last]) return c[last]
      const i = segmentOf(progress)
      const t = (progress - p[i]) / h[i]
      const t2 = t * t
      const t3 = t2 * t
      return (
        (2 * t3 - 3 * t2 + 1) * c[i] +
        (t3 - 2 * t2 + t) * h[i] * m[i] +
        (-2 * t3 + 3 * t2) * c[i + 1] +
        (t3 - t2) * h[i] * m[i + 1]
      )
    },
    speed(progress) {
      if (progress < p[0] || progress > p[last]) return 0
      const i = segmentOf(progress)
      const t = clamp((progress - p[i]) / h[i], 0, 1)
      const t2 = t * t
      return (
        ((6 * t2 - 6 * t) * c[i]) / h[i] +
        (3 * t2 - 4 * t + 1) * m[i] +
        ((-6 * t2 + 6 * t) * c[i + 1]) / h[i] +
        (3 * t2 - 2 * t) * m[i + 1]
      )
    },
  }
}
