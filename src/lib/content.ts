/**
 * Copy and data figures for the DOM overlay layer (Fase 6). Kept separate
 * from the components that render it because Fase 9 (§9 of PLAN.md) is a
 * dedicated verification pass over every figure here against primary
 * sources — isolating the numbers in one file is what makes that pass a
 * data edit instead of a component hunt.
 *
 * Fase 9 closed the primary-source gap against Airbus's A380 product page,
 * the Airbus A380 Aircraft Characteristics manual and Rolls-Royce's
 * published Trent fleet/thrust data. Every displayed figure below is now
 * either directly sourced or explicitly labeled as conditional. Operational
 * values that do not have one universal number (rotation speed and runway
 * requirement) are not presented as absolutes.
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
  scrollHint: 'Desplázate para comenzar',
}

// S2: revealed progressively as the section's own local scroll advances
// (PLAN.md §3 S2: "datos técnicos disparados progresivamente"), not all at
// once on section entry — see InteriorOverlay-style rAF gating in
// NarrativeOverlay.tsx rather than a discrete activeIndex switch.
export const TAKEOFF_DATA: DataPoint[] = [
  { label: 'Motores', value: '4 × Rolls-Royce Trent 900', verified: true },
  { label: 'Empuje por motor', value: '≈311 kN / 70.000 lbf', verified: true },
  { label: 'Velocidad de rotación', value: 'Calculada para cada despegue', verified: true },
  {
    label: 'Pista de despegue',
    value: '≈2.900 m a MTOW, ISA y nivel del mar (referencial)',
    verified: true,
  },
]

// S3: the "ficha técnica" — general specs, PLAN.md §3 S3.
export const SPEC_SHEET: DataPoint[] = [
  { label: 'Envergadura', value: '79,75 m', verified: true },
  { label: 'Longitud', value: '72,73 m', verified: true },
  { label: 'Altura', value: '≈24,1 m', verified: true },
  { label: 'Alcance máximo', value: '8.000 nm / 15.000 km', verified: true },
  { label: 'Asientos estándar (AC 2023)', value: '555 pasajeros', verified: true },
  { label: 'Capacidad máxima', value: '853 pasajeros', verified: true },
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

export const TECHNICAL_SOURCES = [
  {
    label: 'Airbus — A380',
    url: 'https://www.airbus.com/en/products-services/commercial-aircraft/passenger-aircraft/a380',
  },
  {
    label: 'Airbus — Aircraft Characteristics, A380',
    url: 'https://www.aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/aircraft-characteristics',
  },
  {
    label: 'Rolls-Royce — 2024 fleet and thrust data',
    url: 'https://www.rolls-royce.com/~/media/Files/R/Rolls-Royce/documents/investors/results/2024-full-year-results/rr-plc-holdings-2024-full-year-results-appendices.pdf',
  },
] as const

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
    body: 'La primera parada del recorrido interior: instrumentación de vuelo integrada, a metros del umbral que acabas de cruzar.',
    data: [],
  },
  economy: {
    eyebrow: 'S5 — Economy',
    title: 'Dos pasillos, tres bloques de asientos',
    body: 'La cubierta principal, de punta a punta — el pasillo más largo de la aeronave.',
    data: [
      { label: 'Configuración representada', value: '3-4-3 por fila', verified: false },
      { label: 'Ancho de fuselaje', value: '7,14 m', verified: true },
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
      { label: 'Configuración representada', value: '2-4-2 por fila', verified: false },
      { label: 'Volumen de cabina', value: '530 m³', verified: true },
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
    body: '4 × Rolls-Royce Trent 900, con ≈311 kN (70.000 lbf) de empuje nominal por motor.',
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
    body: 'Doble panel acrílico — la piscina de luz fría del corredor entra por aquí.',
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
