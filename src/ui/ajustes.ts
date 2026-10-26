// Ajustes de los avisos y las voces (design-spec de JST-95 §6): se guardan en
// `localStorage`, por navegador, y vienen apagados. Todas las pestañas los ven
// al tiro (evento `storage`). La 0.3.0 suma las mascotas (JST-96 §1), que
// vienen encendidas y valen para la página, el widget y el TV. La 0.4.0 suma
// las conversaciones del descanso (JST-162 §4), encendidas, para la página y el
// TV: lo que guardó una versión anterior se lee igual, y lo que falta vuelve a
// su valor por omisión. La 0.5.0 suma «y de qué se trata» por frase (JST-163,
// `detalle`), prendido en las 4: lo que guardó la 0.4.0 (sin `detalle`) se lee
// igual y queda con las 4 prendidas. La 0.6.0 (JST-225 §6) suma qué se lee de
// la oficina (`leer`, solo las conversaciones prendidas), si «Cómo se presentan
// y más» está abierto (`vozMas`) y si ya se abrió el panel desde que llegaron
// esos tipos (`vistoLeer`): lo que guardó la 0.5.3 se lee igual y queda con
// `leer` por omisión (quien ya tenía las voces prendidas oye las conversaciones).
// La 0.7.0 (JST-231 §7) suma quién escribe las conversaciones (`iaFuente`: la IA
// de Chrome por omisión) y si ya se abrió el menú «Conversaciones» (`iaVisto`,
// apaga su punto violeta): lo que guardó la 0.6.0 se lee igual y queda con la IA
// elegida y el punto prendido. El mostrar u ocultar sigue en `charlas`.
import { useSyncExternalStore } from "react";
import type { Frase, Presentacion } from "../avisos.js";

/** Lo de la oficina que la voz puede leer (0.6.0, JST-225 §4): cada tipo con su casilla. */
export type TipoLeer = "charlas" | "entregas" | "mascotas" | "sueltas" | "hora";
export const TIPOS_LEER: readonly TipoLeer[] = ["charlas", "entregas", "mascotas", "sueltas", "hora"];

export interface Ajustes {
  /** Avisos cuando alguien pasa a «te necesita» (apagados por omisión). */
  avisos: boolean;
  /** La campanita del aviso (encendida por omisión, suena solo con los avisos encendidos). */
  sonido: boolean;
  /** Voces (apagadas por omisión). */
  voces: boolean;
  /** Qué frases dicen: las 3 primeras vienen marcadas y «empecé» no. */
  frases: Record<Frase, boolean>;
  presentacion: Presentacion;
  /** Mascotas en el pasillo (encendidas por omisión). */
  mascotas: boolean;
  /** Conversaciones y frases sueltas del descanso (encendidas por omisión, JST-162 §4). */
  charlas: boolean;
  /**
   * Que la voz diga también de qué se trata (0.5.0, JST-163): la tarea en «te
   * necesito», «terminé» y «empecé», y el motivo en «tengo un error». Prendido
   * en las 4; solo cuenta si su frase está prendida. Apagado, esa frase se dice
   * como en la 0.4.0 y no se pide ningún audio para ella.
   */
  detalle: Record<Frase, boolean>;
  /** 0.6.0 (JST-225 §6): qué se lee de la oficina; viene prendido solo «Conversaciones del descanso». */
  leer: Record<TipoLeer, boolean>;
  /** «Cómo se presentan y más» abierto en el panel «Voces». */
  vozMas: boolean;
  /** Ya se abrió el panel «Voces» desde la 0.6.0: apaga el punto violeta del botón. */
  vistoLeer: boolean;
  /** 0.7.0 (JST-231 §7): quién escribe las conversaciones: la IA de Chrome (por omisión) o las frases de siempre. */
  iaFuente: FuenteCharlas;
  /** 0.7.0: ya se abrió el menú «Conversaciones»: apaga su punto violeta para siempre. */
  iaVisto: boolean;
}

/** Quién escribe las conversaciones (0.7.0): «ia» (la IA de Chrome) o «hoy» (las frases de siempre). */
export type FuenteCharlas = "ia" | "hoy";

export const CLAVE_AJUSTES = "jstm.oficina-pixel.ajustes";

export const AJUSTES_POR_OMISION: Ajustes = {
  avisos: false,
  sonido: true,
  voces: false,
  frases: { toca: true, error: true, fin: true, emp: false },
  presentacion: "nombre-empresa",
  mascotas: true,
  charlas: true,
  detalle: { toca: true, error: true, fin: true, emp: true },
  leer: { charlas: true, entregas: false, mascotas: false, sueltas: false, hora: false },
  vozMas: false,
  vistoLeer: false,
  iaFuente: "ia",
  iaVisto: false,
};

/** Lo guardado sobre lo de por omisión (un campo raro o que falte vuelve a su valor por omisión). */
export function leerAjustes(texto: string | null): Ajustes {
  let g: Partial<Ajustes> = {};
  try {
    g = texto ? (JSON.parse(texto) as Partial<Ajustes>) : {};
  } catch {
    g = {};
  }
  const b = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const f = (g.frases ?? {}) as Partial<Record<Frase, unknown>>;
  const det = (g.detalle && typeof g.detalle === "object" ? g.detalle : {}) as Partial<Record<Frase, unknown>>;
  const le = (g.leer && typeof g.leer === "object" ? g.leer : {}) as Partial<Record<TipoLeer, unknown>>;
  const d = AJUSTES_POR_OMISION;
  return {
    avisos: b(g.avisos, d.avisos),
    sonido: b(g.sonido, d.sonido),
    voces: b(g.voces, d.voces),
    frases: { toca: b(f.toca, d.frases.toca), error: b(f.error, d.frases.error), fin: b(f.fin, d.frases.fin), emp: b(f.emp, d.frases.emp) },
    presentacion: g.presentacion === "nombre" || g.presentacion === "frase" ? g.presentacion : d.presentacion,
    mascotas: b(g.mascotas, d.mascotas),
    charlas: b(g.charlas, d.charlas),
    detalle: { toca: b(det.toca, d.detalle.toca), error: b(det.error, d.detalle.error), fin: b(det.fin, d.detalle.fin), emp: b(det.emp, d.detalle.emp) },
    leer: { charlas: b(le.charlas, d.leer.charlas), entregas: b(le.entregas, d.leer.entregas), mascotas: b(le.mascotas, d.leer.mascotas), sueltas: b(le.sueltas, d.leer.sueltas), hora: b(le.hora, d.leer.hora) },
    vozMas: b(g.vozMas, d.vozMas),
    vistoLeer: b(g.vistoLeer, d.vistoLeer),
    iaFuente: g.iaFuente === "ia" || g.iaFuente === "hoy" ? g.iaFuente : d.iaFuente,
    iaVisto: b(g.iaVisto, d.iaVisto),
  };
}

/** La voz dice de qué se trata en esa frase: la frase y su detalle prendidos (con las voces, lo mira quien habla). */
export function conDetalle(a: Pick<Ajustes, "frases" | "detalle">, f: Frase): boolean {
  return a.frases[f] && a.detalle[f];
}

/**
 * La voz lee ese tipo de la oficina (0.6.0): las voces y su casilla prendidas, y
 * que se vea (con «Conversaciones ocultas» no hay conversaciones ni frases
 * sueltas; con «Mascotas ocultas», no hay mascotas, JST-225 §5).
 */
export function leeOficina(a: Pick<Ajustes, "voces" | "leer" | "charlas" | "mascotas">, t: TipoLeer): boolean {
  if (!a.voces || !a.leer[t]) return false;
  if ((t === "charlas" || t === "sueltas") && !a.charlas) return false;
  if (t === "mascotas" && !a.mascotas) return false;
  return true;
}

/** El punto violeta del botón «Voces» (JST-225 §6): las voces prendidas y el panel todavía sin abrir desde la 0.6.0. */
export function puntoVoces(a: Pick<Ajustes, "voces" | "vistoLeer">): boolean {
  return a.voces && !a.vistoLeer;
}

/**
 * El punto violeta de «Conversaciones» (0.7.0, JST-231 §2 y §7): el menú
 * todavía sin abrir desde la 0.7.0, la IA elegida y por bajar o ya lista (en el
 * celular y otros navegadores no está: `estado` es «sin»).
 */
export function puntoIa(a: Pick<Ajustes, "iaVisto" | "iaFuente">, estado: { k: string }): boolean {
  return !a.iaVisto && a.iaFuente === "ia" && (estado.k === "bajar" || estado.k === "lista");
}

let actuales: Ajustes | null = null;
const oyentes = new Set<() => void>();

function cargar(): Ajustes {
  try {
    return leerAjustes(localStorage.getItem(CLAVE_AJUSTES));
  } catch {
    return AJUSTES_POR_OMISION;
  }
}

export function ajustes(): Ajustes {
  actuales ??= cargar();
  return actuales;
}

export function cambiarAjustes(cambio: Partial<Ajustes>): void {
  actuales = { ...ajustes(), ...cambio };
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(actuales));
  } catch {
    // Sin almacenamiento local, vale solo para esta pestaña.
  }
  for (const o of oyentes) o();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CLAVE_AJUSTES) return;
    actuales = cargar();
    for (const o of oyentes) o();
  });
}

export function alCambiarAjustes(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useAjustes(): Ajustes {
  return useSyncExternalStore(alCambiarAjustes, ajustes);
}
