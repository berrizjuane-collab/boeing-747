import {
  BRAND_NAME,
  EXIT_CONTENT,
  EXTERIOR_HOTSPOTS,
  FOOTER_ATTRIBUTION,
  FOOTER_COLOPHON,
  HERO_CONTENT,
  INTERIOR_HOTSPOTS,
  INTERIOR_ZONES,
  SPEC_SHEET,
  TAKEOFF_DATA,
  TECHNICAL_SOURCES,
  THRESHOLD_LINE,
} from '../lib/content'
import { SECTION_GRADES } from '../lib/sectionGrading'

/**
 * PLAN.md §8.2: no WebGL2 (or a software-only renderer, caught by
 * `failIfMajorPerformanceCaveat` — webglSupport.ts) gets a static narrative
 * page instead of the 3D site — "misma copy, misma tipografía, misma
 * estructura, con stills de alta calidad por sección." The copy, typography
 * (--font-display/--font-mono) and section-by-section structure are real,
 * reusing the exact same content constants the 3D overlay reads
 * (content.ts) so the two can never drift apart independently.
 *
 * The "stills de alta calidad" part is an honest gap, not a silent skip:
 * producing real photographic stills of the scene means rendering it on a
 * real GPU and exporting frames — asset production work, not something this
 * environment can do (same class of limitation as the KTX2/HDRI gaps earlier
 * phases had to resolve with real tooling before they could close). What
 * stands in for them here is each section's own real grading palette
 * (sectionGrading.ts's SECTION_GRADES — the actual key/shadow colors S1-S7
 * grade toward in the 3D version, not invented placeholder colors) as a
 * gradient wash behind the copy, so a visitor without WebGL2 still gets the
 * site's real color arc section to section instead of a flat, uniform page.
 */
function SectionWash({ index }: { index: number }) {
  const grade = SECTION_GRADES[index]
  return (
    <div
      className="fallback__wash"
      style={{ background: `linear-gradient(160deg, ${grade.key} 0%, ${grade.shadow} 100%)` }}
      aria-hidden="true"
    />
  )
}

function DataList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="fallback__data-list">
      {items.map((item) => (
        <div className="fallback__data-item" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function HotspotNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="fallback__hotspot-note">
      <span className="fallback__hotspot-title">{title}</span>
      <span className="fallback__hotspot-body">{body}</span>
    </div>
  )
}

export function StaticFallback() {
  return (
    <main className="fallback">
      <p className="fallback__notice" role="note">
        Estás viendo la versión estática de {BRAND_NAME}: tu navegador (o el hardware disponible) no admite WebGL2,
        así que el recorrido 3D no puede ejecutarse. El contenido es el mismo.
      </p>

      <section className="fallback__section" aria-labelledby="s1-title">
        <SectionWash index={0} />
        <div className="fallback__content">
          <p className="fallback__eyebrow">{HERO_CONTENT.eyebrow}</p>
          <h1 id="s1-title" className="fallback__title-hero">
            {HERO_CONTENT.title}
          </h1>
          <p className="fallback__subtitle">{HERO_CONTENT.subtitle}</p>
        </div>
      </section>

      <section className="fallback__section" aria-labelledby="s2-title">
        <SectionWash index={1} />
        <div className="fallback__content">
          <h2 id="s2-title" className="fallback__eyebrow-heading">
            S2 — Rodaje y despegue
          </h2>
          <DataList items={TAKEOFF_DATA} />
        </div>
      </section>

      <section className="fallback__section" aria-labelledby="s3-title">
        <SectionWash index={2} />
        <div className="fallback__content">
          <p className="fallback__eyebrow">S3 — Ascenso</p>
          <h2 id="s3-title" className="fallback__title">
            Ficha técnica
          </h2>
          <DataList items={SPEC_SHEET} />
          <div className="fallback__hotspot-group">
            {Object.values(EXTERIOR_HOTSPOTS).map((h) => (
              <HotspotNote key={h.id} title={h.title} body={h.body} />
            ))}
          </div>
        </div>
      </section>

      <section className="fallback__section fallback__section--threshold" aria-labelledby="s4-title">
        <SectionWash index={3} />
        <div className="fallback__content">
          <h2 id="s4-title" className="fallback__threshold-line">
            {THRESHOLD_LINE}
          </h2>
        </div>
      </section>

      <section className="fallback__section" aria-labelledby="s5-title">
        <SectionWash index={4} />
        <div className="fallback__content">
          <h2 id="s5-title" className="fallback__section-heading">
            S5 — Recorrido interior
          </h2>
          {(['cockpit', 'economy', 'stair', 'upperDeck'] as const).map((key) => {
            const zone = INTERIOR_ZONES[key]
            return (
              <article className="fallback__zone" key={key}>
                <p className="fallback__eyebrow">{zone.eyebrow}</p>
                <h3 className="fallback__title-zone">{zone.title}</h3>
                <p className="fallback__body">{zone.body}</p>
                {zone.data.length > 0 && <DataList items={zone.data} />}
                {key === 'economy' && (
                  <div className="fallback__hotspot-group">
                    <HotspotNote {...INTERIOR_HOTSPOTS.seat} />
                    <HotspotNote {...INTERIOR_HOTSPOTS.screen} />
                    <HotspotNote {...INTERIOR_HOTSPOTS.window} />
                    <HotspotNote {...INTERIOR_HOTSPOTS.overheadBin} />
                  </div>
                )}
                {key === 'stair' && (
                  <div className="fallback__hotspot-group">
                    <HotspotNote {...INTERIOR_HOTSPOTS.galley} />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="fallback__section" aria-labelledby="s6-title">
        <SectionWash index={5} />
        <div className="fallback__content">
          <p className="fallback__eyebrow">{EXIT_CONTENT.eyebrow}</p>
          <h2 id="s6-title" className="fallback__title">
            {EXIT_CONTENT.title}
          </h2>
          <p className="fallback__body">{EXIT_CONTENT.body}</p>
        </div>
      </section>

      <footer className="fallback__section fallback__footer" aria-labelledby="s7-title">
        <SectionWash index={6} />
        <div className="fallback__content">
          <h2 id="s7-title" className="fallback__visually-hidden">
            Créditos
          </h2>
          <p className="fallback__footer-colophon">{FOOTER_COLOPHON}</p>
          <details className="fallback__footer-attribution" open>
            <summary>{FOOTER_ATTRIBUTION.heading}</summary>
            <p>
              {FOOTER_ATTRIBUTION.modelCredit}
              <br />
              <a href={FOOTER_ATTRIBUTION.modelUrl} target="_blank" rel="noreferrer">
                Modelo original
              </a>
              {' · '}
              <a href={FOOTER_ATTRIBUTION.licenseUrl} target="_blank" rel="noreferrer">
                CC BY 4.0
              </a>
            </p>
          </details>
          <details className="fallback__footer-attribution">
            <summary>Fuentes técnicas</summary>
            <ul className="fallback__source-list">
              {TECHNICAL_SOURCES.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </footer>
    </main>
  )
}
