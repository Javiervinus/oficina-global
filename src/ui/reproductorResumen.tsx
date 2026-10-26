// El reproductor del Resumen y «Texto» (0.9.0, design-spec de JST-245 §4, §5,
// §7 y §8): fijo abajo, centrado sobre la Oficina (sin la barra lateral de
// Paperclip), con ▶/❚❚, la parte anterior y la siguiente, la frase que suena,
// la velocidad, «Texto» y cerrar; arriba, el avance en un tramo por parte.
//
// Lo dibuja el botón de la barra de arriba de Paperclip (`OficinaTvBoton`), que
// está en todas las páginas: así sigue sonando y se ve al abrir una tarea desde
// su chip (§4).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useHostLocation, useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import { duracionFrase, mmss, NOMBRE_SECCION, type FraseResumen, type Seccion } from "../resumen/frases.js";
import type { Lector } from "../resumen/lector.js";
import { periodoTexto } from "../resumen/tiempo.js";
import { Capa } from "./capas.js";
import { cx, EtiquetaEmpresa, Icono } from "./piso.js";
import { resumen, useResumen } from "./resumen.js";
import { useCelular, useMovimientoReducido } from "./useOficina.js";

const ICONO_SECCION: Readonly<Record<Seccion, string>> = { intro: "audio-lines", toca: "hand", hecho: "circle-check", trabajan: "keyboard", cola: "hourglass", cierre: "check" };
const velocidadTexto = (v: number) => `${String(v).replace(".", ",")}×`;

/** Dónde va: centrado sobre la página de la Oficina (o el contenido de la página de Paperclip que esté abierta), y si está sobre el piso (encima de sus rótulos). */
function useArea(activo: boolean): { left: number; width: number; piso: boolean } | null {
  const [a, setA] = useState<{ left: number; width: number; piso: boolean } | null>(null);
  const location = useHostLocation();
  useLayoutEffect(() => {
    if (!activo) return;
    let el: Element | null = null;
    let obs: ResizeObserver | null = null;
    const medir = () => {
      const nuevo = document.querySelector("[data-oficina-pagina]") ?? document.querySelector("main") ?? null;
      if (nuevo !== el) {
        obs?.disconnect();
        el = nuevo;
        obs = el ? new ResizeObserver(medir) : null;
        if (el) obs!.observe(el);
      }
      const r = el?.getBoundingClientRect();
      const n = r && r.width > 200 ? { left: Math.round(r.left), width: Math.round(r.width), piso: el!.hasAttribute("data-oficina-pagina") } : null;
      setA((x) => (x?.left === n?.left && x?.width === n?.width && x?.piso === n?.piso ? x : n));
    };
    medir();
    window.addEventListener("resize", medir);
    const t = setInterval(medir, 1_000);
    return () => {
      obs?.disconnect();
      window.removeEventListener("resize", medir);
      clearInterval(t);
    };
  }, [activo, location.pathname]);
  return a;
}

/** El chip de una tarea (§4): abre la tarea en la misma pestaña y la lectura sigue. */
function ChipTarea({ prefijo, tid }: { prefijo: string | null | undefined; tid: string }) {
  const navigation = useHostNavigation();
  const location = useHostLocation();
  const activo = decodeURIComponent(location.pathname.split("/").filter(Boolean)[0] ?? "").toUpperCase();
  const pre = (prefijo ?? tid.split("-")[0] ?? "").toUpperCase();
  // De la empresa activa, sin recargar. De otra, la ruta de la activa con el código de la otra: Paperclip la abre igual (JST-246, probado en la copia).
  const ruta = `/${encodeURIComponent(activo && activo !== pre ? activo : pre)}/issues/${encodeURIComponent(tid)}`;
  const { href, onClick } = navigation.linkProps(ruta);
  return (
    <a className="of-rs-tid" href={href} onClick={(e) => { e.stopPropagation(); onClick(e); }} title={`Abrir ${tid}`}>
      {tid}
    </a>
  );
}

function TextoFrase({ f }: { f: FraseResumen }) {
  return (
    <>
      {f.co ? <EtiquetaEmpresa prefijo={f.co} /> : null}
      {f.texto}
      {f.tid ? <ChipTarea prefijo={f.co} tid={f.tid} /> : null}
    </>
  );
}

/** El avance (§4): un tramo de 3 px por parte, del ancho de lo que dura; la frase que suena va llenando el suyo. */
function Avance({ l, rm }: { l: Lector; rm: boolean }) {
  const ds = l.duraciones();
  const fin = l.fase === "fin";
  const quieto = l.fase !== "leyendo";
  return (
    <div className={cx("of-rsa-prog", quieto && "is-quieto")} aria-hidden="true">
      {l.secciones.map((S, s) => {
        const w = ds[s]!;
        const estado = fin || s < l.pos.s ? "ok" : s === l.pos.s ? "cur" : "";
        let antes = 0;
        let esta = 0;
        if (estado === "cur") {
          const fr = S.usadas ?? [];
          antes = fr.slice(0, l.pos.k).reduce((t, f) => t + duracionFrase(f.texto), 0);
          esta = fr[l.pos.k] ? duracionFrase(fr[l.pos.k]!.texto) : 0;
        }
        const w0 = (100 * antes) / w;
        const w1 = Math.min(100, (100 * (antes + esta)) / w);
        const son = l.sonando;
        const ya = son ? (l.fase === "pausa" ? (l.pausadaEn ?? 0) : Math.max(0, Date.now() - son.desde)) : 0;
        return (
          <i key={S.sec} style={{ flex: `${w} 1 0` } as CSSProperties} title={NOMBRE_SECCION[S.sec]}>
            <b style={{ width: `${estado === "ok" ? 100 : w0}%` }} />
            {estado === "cur" && esta > 0 && (l.fase === "leyendo" || l.fase === "pausa") ? (
              <b
                key={`${l.pos.k}:${son?.desde ?? 0}`}
                className="is-ahora"
                style={{ "--w0": `${w0}%`, "--w1": `${rm ? w1 : w1}%`, "--d": `${son?.ms ?? 4000}ms`, "--t": `${-ya}ms` } as CSSProperties}
              />
            ) : null}
          </i>
        );
      })}
    </div>
  );
}

/** El centro del reproductor: la parte y la frase que suena, o lo que pasa (§8). */
function Centro({ l, conIa, contextoLee }: { l: Lector; conIa: boolean; contextoLee: boolean }): ReactNode {
  if (l.fase === "armando") {
    return (
      <>
        <span className="of-rsa-sec">
          <Icono nombre="loader" tam={12} className="of-rs-spin" />
          Armando el resumen…
        </span>
        <span className="of-rsa-sub">
          <span className="of-rs-sk" style={{ width: "78%" }} />
          <span className="of-rs-sk" style={{ width: "52%" }} />
        </span>
      </>
    );
  }
  if (l.fase === "fin") {
    const ultima = l.secciones.at(-1)?.usadas?.at(-1);
    return (
      <>
        <span className="of-rsa-sec">
          <Icono nombre="check" tam={12} />
          Listo · {mmss(l.duracionTotal())}
        </span>
        {ultima ? <span className="of-rsa-sub is-fin">{ultima.texto}</span> : null}
      </>
    );
  }
  const S = l.seccionActual();
  if (!S) return null;
  const fr = S.usadas ?? [];
  // Si «En pausa · lees el contexto» no cabe junto al nombre de la parte (en el celular), baja entero a la línea de abajo (JST-291).
  const cabeza = (
    <span className="of-rsa-sec is-parte">
      <span className="of-rsa-sn">
        <Icono nombre={ICONO_SECCION[S.sec]} tam={12} className={cx("of-rsa-si", `is-${S.sec}`)} />
        {NOMBRE_SECCION[S.sec]}
        {fr.length > 1 ? ` · ${l.pos.k + 1} de ${fr.length}` : ""}
      </span>
      {l.fase === "pausa" ? <span className="of-rsa-pz">{contextoLee ? "En pausa · lees el contexto" : "En pausa"}</span> : null}
    </span>
  );
  const f = l.actual();
  if (l.fase === "espera" || !f) {
    const escribe = conIa && S.armadas && S.ia === null;
    return (
      <>
        {cabeza}
        <span className="of-rsa-sub is-mut">
          <Icono nombre="loader" tam={14} className="of-rs-spin" />
          {escribe ? `La IA está escribiendo «${NOMBRE_SECCION[S.sec]}»…` : `Armando «${NOMBRE_SECCION[S.sec]}»…`}
        </span>
      </>
    );
  }
  return (
    <>
      {cabeza}
      <span className={cx("of-rsa-sub", f.aviso && "is-aviso")}>
        <TextoFrase f={f} />
      </span>
    </>
  );
}

/** «Texto» (§5): todo el resumen por partes, con la frase que suena marcada. Tocar una frase la lee desde ahí. */
function PanelTexto({ l }: { l: Lector }) {
  const r = resumen;
  const caja = useRef<HTMLDivElement>(null);
  const tocadoEn = useRef(0);
  const cur = l.fase === "fin" ? { s: l.secciones.length, k: 0 } : l.pos;
  // Sigue a la frase que suena, salvo que se haya hecho scroll en los últimos 4 s.
  useEffect(() => {
    const el = caja.current;
    if (!el || Date.now() - tocadoEn.current < 4_000) return;
    const c = el.querySelector<HTMLElement>(".of-rs-fr.is-cur");
    if (!c) return;
    const arriba = c.offsetTop - el.offsetTop;
    if (arriba < el.scrollTop + 40 || arriba > el.scrollTop + el.clientHeight - 60) el.scrollTop = Math.max(0, arriba - 60);
  });
  const p = r.periodo;
  return (
    <div ref={caja} className="of-rsa-texto" onWheel={() => (tocadoEn.current = Date.now())} onTouchMove={() => (tocadoEn.current = Date.now())}>
      <div className="of-rsa-th">
        <b>Todo el resumen</b>
        <span className="of-sp" />
        <span className="of-rsa-tm">{p ? periodoTexto(p.desde, p.ahora, p.ultima) : ""}</span>
      </div>
      {r.fallanResumen.length > 0 ? (
        <div className="of-rsa-warn" role="alert">
          <Icono nombre="triangle-alert" tam={14} />
          <span>
            <b>
              {r.fallanResumen.map((e) => e.nombre).join(", ")} {r.fallanResumen.length === 1 ? "no responde" : "no responden"}.
            </b>{" "}
            El resumen va sin {r.fallanResumen.length === 1 ? "esa empresa" : "esas empresas"}.
          </span>
        </div>
      ) : null}
      {l.fase === "armando" ? (
        <div className="of-rs-guion">
          {[92, 84, 88].map((w) => (
            <div key={w} className="of-rs-gsk">
              <span className="of-rs-sk" style={{ width: `${w}%` }} />
              <span className="of-rs-sk" style={{ width: `${w - 30}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="of-rs-guion">
          {l.secciones.map((S, s) => {
            const fr = l.previa(s);
            return (
              <div key={S.sec} className="of-rs-gsec">
                <div className={cx("of-rs-gh", `is-${S.sec}`)}>
                  <Icono nombre={ICONO_SECCION[S.sec]} tam={12} />
                  <span>{NOMBRE_SECCION[S.sec]}</span>
                </div>
                {!fr ? (
                  <div className="of-rs-gsk">
                    <span className="of-rs-sk" style={{ width: "86%" }} />
                    <span className="of-rs-sk" style={{ width: "64%" }} />
                  </div>
                ) : (
                  fr.map((f, k) => {
                    const st = s < cur.s || (s === cur.s && k < cur.k) ? "" : s === cur.s && k === cur.k ? "is-cur" : "is-fut";
                    return (
                      <button key={k} type="button" className={cx("of-rs-fr", st, f.aviso && "is-aviso")} aria-current={st === "is-cur" ? "true" : undefined} onClick={() => l.ir({ s, k })}>
                        <TextoFrase f={f} />
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Lo pueden montar la barra de arriba (en todas las páginas) y la página de la
 * Oficina (por si la barra no está): se dibuja solo el primero que se montó.
 */
const anfitriones: symbol[] = [];
const oyentesAnfitrion = new Set<() => void>();
function useSoyAnfitrion(): boolean {
  const yo = useRef(Symbol("reproductor")).current;
  useEffect(() => {
    anfitriones.push(yo);
    for (const o of oyentesAnfitrion) o();
    return () => {
      const i = anfitriones.indexOf(yo);
      if (i >= 0) anfitriones.splice(i, 1);
      for (const o of oyentesAnfitrion) o();
    };
  }, [yo]);
  return useSyncExternalStore(
    (o) => {
      oyentesAnfitrion.add(o);
      return () => oyentesAnfitrion.delete(o);
    },
    () => anfitriones[0] === yo,
  );
}

/** El reproductor (§4): fijo abajo mientras hay un resumen (también «Listo»), hasta cerrarlo. */
export function ReproductorResumen() {
  const anfitrion = useSoyAnfitrion();
  const r = useResumen();
  const l = anfitrion ? r.lector : null;
  const visible = !!l && l.fase !== "off";
  const celular = useCelular();
  const rm = useMovimientoReducido();
  const area = useArea(visible);
  const play = useRef<HTMLButtonElement>(null);
  const armado = r.armadoEn;
  // Al abrir el reproductor, el foco va al ▶ (§10).
  useEffect(() => {
    if (visible) play.current?.focus({ preventScroll: true });
  }, [visible, armado]);
  // El avance de la frase que suena se dibuja con su hora: mientras suena, se vuelve a dibujar con cada cambio del lector.
  if (!l || !visible) return null;
  const fin = l.fase === "fin";
  const sonando = l.activo();
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest(".of-rsa-texto")) {
      if (e.key === "Escape") {
        e.preventDefault();
        r.alternarTexto(false);
      }
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      if (fin) l.otraVez();
      else l.alternar();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      l.saltar(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      l.saltar(1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (r.texto) r.alternarTexto(false);
      else r.cerrar();
    }
  };
  const estilo: CSSProperties | undefined = !celular && area ? { left: area.left, width: area.width } : !celular ? { left: 0, right: 0 } : undefined;
  return (
    <Capa>
      <div className={cx("of-rs-a", celular && "is-m", area?.piso && "is-piso", rm && "of-rm")} style={estilo} onKeyDown={teclas}>
        <div className="of-rsa-dock">
          {r.texto ? <PanelTexto l={l} /> : null}
          {r.voz?.sinVoces && !fin ? (
            <div className="of-rsa-nv">
              <Icono nombre="volume-x" tam={14} />
              <span>
                <b>Este navegador no tiene voz en español.</b> Te lo dejo escrito.
              </span>
            </div>
          ) : null}
          <div className="of-rsa-bar" role="region" aria-label="Resumen en voz alta">
            <Avance l={l} rm={rm} />
            {fin ? (
              <button ref={play} type="button" className="of-rsa-play" aria-label="Leer otra vez" title="Otra vez" onClick={() => l.otraVez()}>
                <Icono nombre="rotate-ccw" tam={16} />
              </button>
            ) : (
              <button
                ref={play}
                type="button"
                className="of-rsa-play of-rs-fill"
                aria-label={sonando ? "Pausar" : "Seguir"}
                title={sonando ? "Pausar (espacio)" : "Seguir"}
                onClick={() => l.alternar()}
              >
                {l.fase === "leyendo" || l.fase === "pausa" || !r.voz ? <Icono nombre={sonando ? "pause" : "play"} tam={16} /> : <Icono nombre="loader" tam={16} className="of-rs-spin" />}
              </button>
            )}
            {celular ? null : (
              <>
                <button type="button" className="of-ibtn is-ghost of-rs-fill" aria-label="Parte anterior" title="Parte anterior (←)" disabled={fin || (l.pos.s === 0 && l.pos.k === 0)} onClick={() => l.saltar(-1)}>
                  <Icono nombre="skip-back" tam={14} />
                </button>
                <button type="button" className="of-ibtn is-ghost of-rs-fill" aria-label="Parte siguiente" title="Parte siguiente (→)" disabled={fin} onClick={() => l.saltar(1)}>
                  <Icono nombre="skip-forward" tam={14} />
                </button>
              </>
            )}
            <div className="of-rsa-c" aria-live="polite">
              <Centro l={l} conIa={r.conIa} contextoLee={r.contextoLee} />
            </div>
            {celular ? null : (
              <button type="button" className="of-btn is-sm is-ghost of-rsa-vel" title="Velocidad" onClick={() => l.cambiarVelocidad()}>
                {velocidadTexto(l.velocidad)}
              </button>
            )}
            {celular ? (
              <button type="button" className={cx("of-ibtn is-ghost", r.texto && "is-on")} aria-pressed={r.texto} aria-label="Texto" title="Texto" onClick={() => r.alternarTexto()}>
                <Icono nombre="text" tam={18} />
              </button>
            ) : (
              <button type="button" className={cx("of-btn is-sm", !r.texto && "is-ghost", r.texto && "is-on")} aria-pressed={r.texto} onClick={() => r.alternarTexto()}>
                <Icono nombre="text" tam={14} />
                Texto
              </button>
            )}
            <button type="button" className="of-ibtn is-ghost" aria-label="Cerrar el resumen" title="Cerrar" onClick={() => r.cerrar()}>
              <Icono nombre="x" tam={celular ? 18 : 14} />
            </button>
          </div>
        </div>
      </div>
    </Capa>
  );
}
