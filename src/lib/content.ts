/**
 * Copy and data figures for the DOM overlay layer (Fase 6). Kept separate
 * from the components that render it because Fase 9 (§9 of PLAN.md) is a
 * dedicated verification pass over every figure here against primary
 * sources — isolating the numbers in one file is what makes that pass a
 * data edit instead of a component hunt.
 *
 * PLAN.md §9: primary-source access failed in the planning session
 * (airbus.com, Wikipedia and Sketchfab all returned HTTP 403), so every
 * figure below comes from secondary-source search summaries, not a
 * verified primary source. `verified: false` on every entry reflects that
 * honestly — Fase 9 is what flips it, not this phase. Two figures the plan
 * flags as *inherently* conditional (rotation speed, runway distance) are
 * worded as "typical, at MTOW" rather than as bare absolutes, per PLAN.md
 * §9's explicit instruction not to present weight/altitude/temperature/wind
 * -dependent numbers as hard data.
 */

export interface DataPoint {
  label: string
  value: string
  verified: boolean
}

// Fictional, neutral brand — PLAN.md §12.4: real-airline liveries/cabin
// configs are trademarked and specific to a carrier, so a project needs its
// own name to sidestep that entirely rather than reading as unauthorized
// marketing for a third party. Chosen here (never decided in PLAN.md,
// which only confirmed *that* a fictional name was needed, not which one).
export const BRAND_NAME = 'MERIDIAN'
export const BRAND_SUBTITLE = 'Airbus A380-800 · Doble cubierta, nariz a cola'

export const HERO_CONTENT = {
  eyebrow: 'MERIDIAN — vuelo de presentación',
  title: BRAND_NAME,
  subtitle: BRAND_SUBTITLE,
  scrollHint: 'Desplazate para comenzar',
}

// S2: revealed progressively as the section's own local scroll advances
// (PLAN.md §3 S2: "datos técnicos disparados progresivamente"), not all at
// once on section entry — see InteriorOverlay-style rAF gating in
// NarrativeOverlay.tsx rather than a discrete activeIndex switch.
export const TAKEOFF_DATA: DataPoint[] = [
  { label: 'Motores', value: '4 × Rolls-Royce Trent 900', verified: false },
  { label: 'Empuje por motor', value: '~311–356 kN', verified: false },
  { label: 'Velocidad de rotación', value: '~150–180 kt (típico, a MTOW)', verified: false },
  { label: 'Distancia de pista', value: '~2.900–3.000 m (típico, a MTOW, nivel del mar)', verified: false },
]

// S3: the "ficha técnica" — general specs, PLAN.md §3 S3.
export const SPEC_SHEET: DataPoint[] = [
  { label: 'Envergadura', value: '79.8 m', verified: false },
  { label: 'Longitud', value: '72.7 m', verified: false },
  { label: 'Altura', value: '24.1 m', verified: false },
  { label: 'Techo de servicio', value: '13.136 m / 43.100 ft', verified: false },
  { label: 'Alcance', value: '~15.200–15.400 km', verified: false },
  { label: 'Capacidad (3 clases)', value: '525 pasajeros', verified: false },
]

export const THRESHOLD_LINE = 'Cruzando el umbral'

export const EXIT_CONTENT = {
  eyebrow: 'Fin del recorrido',
  title: 'Un viaje completo',
  body: 'De la pista a la cabina y de vuelta al cielo — el mismo avión, el mismo scroll, sin un solo corte de escena.',
}

// ASSET_AUDIT.md "Texto de atribución propuesto" — reproduced verbatim.
// That file is the one place this project already deliberated attribution
// wording; Fase 6 is where it was always meant to actually reach the site
// (see PLAN.md §11.1 and PROGRESS.md's own "pendiente de Fase 6" notes).
export const FOOTER_ATTRIBUTION = {
  heading: 'Créditos y licencias',
  modelCredit:
    'Modelo exterior: "Airbus A380" por Brout, utilizado bajo CC BY 4.0. Adaptado para este proyecto: materiales, escala, optimización y/o jerarquía pueden modificarse durante el pipeline. La atribución no implica respaldo del autor.',
  modelUrl: 'https://sketchfab.com/3d-models/airbus-a380-98d21f9c8104445f814cef47ef992889',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
}

export interface InteriorZoneContent {
  eyebrow: string
  title: string
  body: string
  data: DataPoint[]
}

// S5 v1 scope (PLAN.md §12.3): 3 of 6 possible zones, the ones marked ★ in
// §3's zone list — first class and business/economy plus stay deferred, not
// deleted (see PROGRESS.md Fase 5). Keyed to match InteriorOverlay.tsx's
// zone-detection logic, which in turn matches sceneLayout.ts's
// INTERIOR_ANCHORS_WORLD keys and cameraPath.ts's walkthrough order.
export const INTERIOR_ZONES: Record<'cockpit' | 'economy' | 'stair' | 'upperDeck', InteriorZoneContent> = {
  cockpit: {
    eyebrow: 'S5 — Cabina de mando',
    title: 'El puesto de pilotaje',
    body: 'La primera parada del recorrido interior: instrumentación de vuelo integrada, a metros del umbral que acabás de cruzar.',
    data: [],
  },
  economy: {
    eyebrow: 'S5 — Economy',
    title: 'El plano que muestra la anchura real',
    body: 'La cubierta principal, de punta a punta — el pasillo más largo de la aeronave.',
    data: [
      { label: 'Disposición', value: '3-4-3 por fila', verified: false },
      { label: 'Ancho de fuselaje', value: '7.14 m', verified: false },
    ],
  },
  stair: {
    eyebrow: 'S5 — Escalera',
    title: 'La transición vertical',
    body: 'La escalera que conecta ambas cubiertas — visualmente el momento más distintivo del recorrido interior.',
    data: [],
  },
  upperDeck: {
    eyebrow: 'S5 — Piso superior',
    title: 'El doble piso, de nariz a cola',
    body: 'A diferencia de una joroba delantera, esta cubierta corre de punta a punta — el motivo por el que este recorrido se construyó sobre el A380.',
    data: [
      { label: 'Disposición', value: '2-4-2 por fila', verified: false },
      { label: 'Longitud útil', value: '44.93 m / 147.4 ft', verified: false },
    ],
  },
}

export interface HotspotContent {
  id: string
  title: string
  body: string
}

// S3 hotspots (PLAN.md §3 S3: "motores, punta de ala/winglet, empenaje").
// One representative instance per category, not one per physical unit (4
// engines, 2 winglets) — same "explain one, it stands for the rest"
// treatment real spec-sheet UIs use, and PLAN.md never asks for one marker
// per engine.
export const EXTERIOR_HOTSPOTS: Record<'engine' | 'winglet' | 'empennage', HotspotContent> = {
  engine: {
    id: 'engine',
    title: 'Motores',
    body: '4 × Rolls-Royce Trent 900, ~311–356 kN de empuje cada uno.',
  },
  winglet: {
    id: 'winglet',
    title: 'Winglet',
    body: 'Extremo de ala curvado hacia arriba — reduce los vórtices de punta de ala y el arrastre inducido.',
  },
  empennage: {
    id: 'empennage',
    title: 'Empenaje',
    body: 'Estabilizadores vertical y horizontal de cola — control direccional y de cabeceo.',
  },
}

// S5 hotspots (PLAN.md §3 S5: "asiento, pantalla de entretenimiento, galley,
// ventanilla, compartimiento superior"), all anchored within the economy
// zone's dwell window except galley, which sits nearer the stair.
export const INTERIOR_HOTSPOTS: Record<'seat' | 'screen' | 'window' | 'overheadBin' | 'galley', HotspotContent> = {
  seat: {
    id: 'seat',
    title: 'Asiento',
    body: 'Economy, disposición 3-4-3 — configuración típica de alta densidad.',
  },
  screen: {
    id: 'screen',
    title: 'Pantalla',
    body: 'Sistema de entretenimiento a bordo integrado al respaldo.',
  },
  window: {
    id: 'window',
    title: 'Ventanilla',
    body: 'Doble panel acrílico — la piscina de luz fría del corredor entra por acá.',
  },
  overheadBin: {
    id: 'overheadBin',
    title: 'Compartimiento superior',
    body: 'Equipaje de mano — un compartimiento por fila de asientos.',
  },
  galley: {
    id: 'galley',
    title: 'Galley',
    body: 'Cocina de a bordo, junto a la escalera que conecta ambas cubiertas.',
  },
}

export const FOOTER_COLOPHON =
  'Construido con React Three Fiber, three.js, GSAP ScrollTrigger y Lenis. Interior modelado a medida; exterior procesado con gltf-transform (Draco + KTX2/Basis).'
