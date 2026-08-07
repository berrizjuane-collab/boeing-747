/**
 * Copy and data figures for the DOM overlay layer (Fase 6). Kept separate
 * from the components that render it because Fase 9 (§9 of PLAN.md) is a
 * dedicated verification pass over every figure here against primary
 * sources — isolating the numbers in one file is what makes that pass a
 * data edit instead of a component hunt.
 *
 * PLAN.md §9, closed in Fase 9: every figure below was cross-checked against
 * Airbus/Rolls-Royce/Engine Alliance primary data. Direct fetch of
 * airbus.com and rolls-royce.com is still blocked in this environment — not
 * the HTTP 403 the planning session hit, but an outright network-egress
 * block at this sandbox's proxy, confirmed independently this session
 * (PROGRESS.md has both error signatures). What changed since planning:
 * search-based retrieval is routed through different infrastructure and
 * isn't subject to that block, and it surfaces search-engine-cached content
 * that quotes the primary Airbus "Aircraft Characteristics" / "Facts and
 * Figures" PDFs and Rolls-Royce's Trent 900 ratings directly. Every figure
 * here was confirmed via multiple independent sources converging on the
 * same number (see PROGRESS.md Fase 9 for the full source list) — the
 * closest approximation to primary-source verification this environment
 * allows, short of a human fetching the PDF outside the sandbox. `verified:
 * true` reflects that pass, not a claim of having read the PDF directly.
 *
 * Two figures the plan flags as *inherently* conditional (rotation speed,
 * runway distance) are worded as "typical, at MTOW" rather than as bare
 * absolutes, per PLAN.md §9's explicit instruction not to present
 * weight/altitude/temperature/wind-dependent numbers as hard data.
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
// Engine: Airbus certifies the A380 for either the Rolls-Royce Trent 900 or
// the Engine Alliance GP7200 — both real, both equally valid options. Trent
// 900 was already the sole choice used consistently across this file (here
// and in EXTERIOR_HOTSPOTS.engine below) before Fase 9; verification found
// no reason to prefer one over the other, so Fase 9 keeps Trent 900 rather
// than relitigating an arbitrary pick and touching every reference for no
// reason (PLAN.md §9's "elegir una opción y ser consistente" is about not
// mixing both, not about which one).
//
// Thrust range and the 1,208 kN conflict (PLAN.md §9 🔴, resolved): per
// engine, Trent 900 takeoff thrust across its certificated A380 sub-variants
// (970/972/977) runs ~310–374 kN — no single engine reaches anywhere near
// 1,208 kN. Four engines at that range sum to ~1,240–1,500 kN, which is the
// physically consistent reading of "1,208 kN": a 4-engine TOTAL, not a
// per-engine figure (roughly that summed order of magnitude, likely a lower
// or older rating). This file only ever states the per-engine number,
// labeled as such ("Empuje por motor"), and never the total, so the two
// figures can't collide on the page.
export const TAKEOFF_DATA: DataPoint[] = [
  { label: 'Motores', value: '4 × Rolls-Royce Trent 900', verified: true },
  { label: 'Empuje por motor', value: '~310–374 kN', verified: true },
  { label: 'Velocidad de rotación', value: '~150–180 kt (típico, a MTOW)', verified: true },
  { label: 'Distancia de pista', value: '~2.900–3.100 m (típico, a MTOW, nivel del mar)', verified: true },
]

// S3: the "ficha técnica" — general specs, PLAN.md §3 S3.
//
// Alcance: sources split into two clusters of a genuinely official-looking
// figure — ~14,800 km (8,000 nmi, the figure Airbus's own marketing copy
// uses) and ~15,200 km (8,200 nmi, the figure most technical spec sheets
// cite, plausibly a different payload assumption than the marketing one.
// Range moved from planning's unverified 15.200–15.400 km down to the
// verified 14.800–15.200 km — the 15,400 upper bound had no supporting
// source in this pass.
//
// Capacidad (3 clases): Airbus has published two 3-class figures over the
// aircraft's life — 525 (the original, more spacious layout) and 544 (a
// later higher-density 3-class layout). 525 is kept as the single figure
// shown, both because it's the one already in this file's INTERIOR_ZONES
// economy copy ("3-4-3 por fila" matches 525, not the denser 544 layout)
// and to keep one number on a card designed for one.
export const SPEC_SHEET: DataPoint[] = [
  { label: 'Envergadura', value: '79.8 m', verified: true },
  { label: 'Longitud', value: '72.7 m', verified: true },
  { label: 'Altura', value: '24.1 m', verified: true },
  { label: 'Techo de servicio', value: '13.136 m / 43.100 ft', verified: true },
  { label: 'Alcance', value: '~14.800–15.200 km', verified: true },
  { label: 'Capacidad (3 clases)', value: '525 pasajeros', verified: true },
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
      { label: 'Disposición', value: '3-4-3 por fila', verified: true },
      // Fuselage OUTER diameter, not interior cabin width (~6.5 m main
      // deck) — the label says "fuselaje" on purpose. Don't "correct" this
      // toward the cabin-width figure; they're two different, both-real
      // measurements.
      { label: 'Ancho de fuselaje', value: '7.14 m', verified: true },
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
      { label: 'Disposición', value: '2-4-2 por fila', verified: true },
      { label: 'Longitud útil', value: '44.93 m / 147.4 ft', verified: true },
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
    body: '4 × Rolls-Royce Trent 900, ~310–374 kN de empuje cada uno.',
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
