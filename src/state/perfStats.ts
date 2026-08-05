// Plain mutable module-level object, deliberately not a Zustand store: these
// values change every frame and are written from inside the R3F canvas
// (useFrame) and read from the DOM HUD outside it via its own rAF loop.
// Neither side goes through React state — same reasoning as scrollStore's
// hard rule, just for a value that never needs to trigger a re-render at all.
export const perfStats = {
  fps: 0,
  drawCalls: 0,
  triangles: 0,
}
