// Elegir las voces, en la página (0.11.0, JST-325; design-spec de JST-324).
// Guarda lo que el worker dejó en `voces/eleccion.json` (la voz del Resumen, la de
// «Leer contexto» y lo que tenía cada agente antes de cambiarlo) y lo que se está
// grabando al cambiar una voz, que se pregunta al worker (`voz-estado`) mientras
// dure. Cuando una voz nueva queda lista se vuelve a leer el índice de los audios,
// y los agentes ya hablan con ella.
import { useSyncExternalStore } from "react";
import { accionPlugin } from "../fuentes.js";
import { eleccionInicial, leerEleccion, vozDeContexto, type EleccionVoces, type GrabandoVoz, type VozLectura } from "../eleccionVoces.js";
import type { VozId } from "../voces.js";
import { baseUi, cargarIndice, instalacion } from "./audiosVoces.js";
import { estadoVozViva } from "./vozViva.js";

/** La elección se vuelve a leer a los 60 s (otra pestaña o el TV pudieron cambiarla). */
const RELEER_MS = 60_000;
/** Mientras se graba, el worker se pregunta cada 2,5 s. */
const SEGUIR_MS = 2_500;

let eleccion: EleccionVoces = eleccionInicial();
let leidaEn = 0;
let leyendo: Promise<EleccionVoces> | null = null;
let grabando: readonly GrabandoVoz[] = [];
let cambios = false;
let error: ErrorVoz | null = null;
const oyentes = new Set<() => void>();

/** Lo que falló al elegir, para decirlo bajo su fila y reintentar. */
export interface ErrorVoz {
  /** `resumen`, `contexto` o `agente:<id>`: bajo qué fila se muestra. */
  donde: string;
  motivo: "red" | "pedido" | "sin-mac" | "sin-voces" | "grabar";
  /** Para el botón «Reintentar». */
  pedido: Record<string, unknown>;
}

const avisar = () => {
  version += 1;
  for (const o of oyentes) o();
};
let version = 0;

const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => oyentes.delete(o);
};

/** Lo elegido, ya leído (o lo que queda al instalar). */
export function eleccionAhora(): EleccionVoces {
  return eleccion;
}

/** `eleccion.json` (sin caché: lo escribe el worker). Si no está o no se pudo leer, queda lo que había. */
export function cargarEleccion(forzar = false): Promise<EleccionVoces> {
  if (!forzar && leidaEn > 0 && Date.now() - leidaEn < RELEER_MS) return Promise.resolve(eleccion);
  leyendo ??= baseUi()
    .then(async (b) => {
      if (!b) return null;
      const r = await fetch(`${b}voces/eleccion.json?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
      // Sin archivo: nadie eligió nada, vale lo que queda al instalar.
      return r.ok ? leerEleccion(await r.json()) : r.status === 404 ? eleccionInicial() : null;
    })
    .catch(() => null)
    .then((e) => {
      leyendo = null;
      leidaEn = Date.now();
      if (e) {
        eleccion = e;
        avisar();
      }
      return eleccion;
    });
  return leyendo;
}

export function useEleccion(): EleccionVoces {
  useSyncExternalStore(suscribir, () => version);
  return eleccion;
}

export function useGrabando(): readonly GrabandoVoz[] {
  useSyncExternalStore(suscribir, () => version);
  return grabando;
}

/** ¿Cambió algo respecto de lo que queda al instalar? (aparece «Volver a como estaba»). */
export function useHayCambios(): boolean {
  useSyncExternalStore(suscribir, () => version);
  return cambios;
}

export function useErrorVoz(): ErrorVoz | null {
  useSyncExternalStore(suscribir, () => version);
  return error;
}

export function descartarError(): void {
  if (!error) return;
  error = null;
  avisar();
}

// ---------------------------------------------------------------------------
// Preguntarle al worker
// ---------------------------------------------------------------------------

interface EstadoElegir {
  disponible: boolean;
  motivo: string | null;
  eleccion: EleccionVoces;
  grabando: GrabandoVoz[];
  cambios: boolean;
}

let reloj: ReturnType<typeof setTimeout> | null = null;
let seguirDe: string | null = null;

/** Lo que el worker tiene elegido y lo que está grabando; si terminó una voz, vuelve a leer el índice. */
export async function refrescarEstado(companyId: string): Promise<void> {
  const id = await instalacion().catch(() => null);
  const e = id ? await accionPlugin<EstadoElegir>({ base: "" }, id, "voz-estado", companyId, {}).catch(() => null) : null;
  if (!e) return;
  eleccion = leerEleccion(e.eleccion);
  leidaEn = Date.now();
  // Una voz nueva quedó lista: se lee el índice (que ya tiene al agente con ella) antes de dejar de mostrar «Grabando…»,
  // para que el selector no vuelva un instante a la voz de antes.
  if (grabando.length > (e.grabando?.length ?? 0)) await cargarIndice(true).catch(() => null);
  grabando = e.grabando ?? [];
  cambios = !!e.cambios;
  avisar();
}

/** Mientras haya algo grabándose, se vuelve a preguntar. */
function seguir(companyId: string): void {
  seguirDe = companyId;
  if (reloj) return;
  const vuelta = () => {
    reloj = null;
    if (!seguirDe) return;
    void refrescarEstado(seguirDe).then(() => {
      if (grabando.some((g) => !g.error)) reloj = setTimeout(vuelta, SEGUIR_MS);
      else seguirDe = null;
    });
  };
  reloj = setTimeout(vuelta, SEGUIR_MS);
}

/** Al abrir el panel: lo que hay ahora y, si se está grabando, seguirlo. */
export async function abrirPanelVoces(companyId: string): Promise<void> {
  await refrescarEstado(companyId);
  if (grabando.some((g) => !g.error)) seguir(companyId);
}

async function pedir<T>(companyId: string, accion: string, params: Record<string, unknown>): Promise<T | null> {
  const id = await instalacion().catch(() => null);
  return id ? accionPlugin<T>({ base: "" }, id, accion, companyId, params).catch(() => null) : null;
}

interface Respuesta {
  ok: boolean;
  motivo?: "pedido" | "sin-mac" | "sin-voces";
  eleccion: EleccionVoces;
}

async function mandar(companyId: string, accion: string, params: Record<string, unknown>, donde: string): Promise<boolean> {
  const r = await pedir<Respuesta>(companyId, accion, params);
  if (!r) {
    error = { donde, motivo: "red", pedido: { accion, params } };
    avisar();
    return false;
  }
  eleccion = leerEleccion(r.eleccion);
  leidaEn = Date.now();
  error = r.ok ? null : { donde, motivo: r.motivo ?? "pedido", pedido: { accion, params } };
  avisar();
  await refrescarEstado(companyId);
  if (grabando.some((g) => !g.error)) seguir(companyId);
  return r.ok;
}

/** La voz del Resumen o de «Leer contexto» (esta, también «igual» al Resumen). */
export function elegirLectura(companyId: string, quien: "resumen" | "contexto", voz: VozLectura | "igual"): Promise<boolean> {
  // Al tiro en la pantalla; el worker la guarda y lo confirma.
  eleccion = { ...eleccion, [quien]: voz } as EleccionVoces;
  avisar();
  return mandar(companyId, "voz-elegir", { quien, voz }, quien);
}

export interface AgenteVoz {
  id: string;
  corto: string;
  empresa: string;
}

/** La voz de un agente: sus frases se graban en la Mac y, mientras, sigue con la de antes. */
export function elegirVozAgente(companyId: string, a: AgenteVoz, voz: VozId): Promise<boolean> {
  return mandar(companyId, "voz-elegir", { quien: "agente", agenteId: a.id, voz, corto: a.corto, empresa: a.empresa }, `agente:${a.id}`);
}

export function reiniciarVoces(companyId: string): Promise<boolean> {
  return mandar(companyId, "voz-reiniciar", {}, "volver");
}

/** El botón «Reintentar» de un error. */
export function reintentar(companyId: string): Promise<boolean> {
  const e = error;
  if (!e) return Promise.resolve(false);
  return mandar(companyId, String(e.pedido.accion), e.pedido.params as Record<string, unknown>, e.donde);
}

// ---------------------------------------------------------------------------
// Quién lee
// ---------------------------------------------------------------------------

/**
 * La voz con que se lee ahora: la elegida, o `null` si eligió la del navegador, si no hay
 * `companyId` (no se puede pedir al worker) o si esta Mac no puede preparar voces (sin `uv` o `ffmpeg`),
 * para no esperar un audio que no va a llegar.
 */
export async function vozParaLeer(que: "resumen" | "contexto", companyId: string | null): Promise<VozId | null> {
  const e = await cargarEleccion();
  const v = que === "resumen" ? e.resumen : vozDeContexto(e);
  if (v === "navegador" || !companyId) return null;
  const est = await estadoVozViva(companyId).catch(() => null);
  return est && est.disponible === false ? null : v;
}

/** Abre el motor de la voz elegida antes de leer (el worker la mantiene lista 10 min). No espera ni falla. */
export function calentarVoz(que: "resumen" | "contexto", companyId: string | null): void {
  if (!companyId) return;
  void (async () => {
    const e = await cargarEleccion();
    const v = que === "resumen" ? e.resumen : vozDeContexto(e);
    if (v === "navegador") return;
    // El worker ya la mantiene abierta 10 min: no hace falta preguntar más de una vez por minuto por voz.
    const ahora = Date.now();
    if (ahora - (calentadas.get(v) ?? 0) < 60_000) return;
    calentadas.set(v, ahora);
    await pedir(companyId, "voz-calentar", { voz: v });
  })();
}

const calentadas = new Map<string, number>();

