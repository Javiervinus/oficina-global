// Las frases del Resumen (0.9.0, design-spec de JST-245 §3.2 y §3.3), sin
// React ni navegador: los números (siempre con los datos, nunca con la IA) y
// las frases armadas de cada parte, que son el respaldo de la IA y lo que se
// usa en el celular, el TV y otros navegadores.
//
// Reglas del texto (§3.3): frases cortas; ningún estado en inglés ni código en
// voz alta (el código va escrito, como chip); los títulos cortos
// (`tituloParaVoz`); los agentes con su nombre corto; las horas como en la
// Oficina («a las 9:20», «ayer a las 9:20») y lo que lleva algo en palabras.
import { contarPartes, type DatosResumen, type EmpresaRes, type EnCola, type Pedido, type Toca, type Trabajo } from "./datos.js";
import { cortarNatural } from "../paraVoz.js";
import { desdeCuando, hace, nuevoDe, periodoCorto, periodoFrase, type Desde } from "./tiempo.js";
import { LETRAS_FRASE_RESUMEN } from "./voz.js";

export type Parte = "toca" | "hecho" | "trabajan" | "cola";
export const PARTES: readonly Parte[] = ["toca", "hecho", "trabajan", "cola"];
export type Seccion = "intro" | Parte | "cierre";
export const SECCIONES: readonly Seccion[] = ["intro", "toca", "hecho", "trabajan", "cola", "cierre"];

/** Cómo se llama cada parte en el reproductor y en «Texto» (§4 y §5). */
export const NOMBRE_SECCION: Readonly<Record<Seccion, string>> = {
  intro: "Los números",
  toca: "Lo que te toca",
  hecho: "Lo que se hizo",
  trabajan: "En qué trabajan",
  cola: "Lo que está en cola",
  cierre: "Para terminar",
};

export type Largo = "corto" | "completo";

/** Lo que se elige en el menú (§2) y se guarda en el navegador (§9, `of-resumen-op`). */
export interface OpcionesResumen {
  /** Prefijos de las empresas elegidas; vacío: todas. */
  co: string[];
  desde: Desde;
  partes: Parte[];
  largo: Largo;
}

export const OPCIONES_OMISION: OpcionesResumen = { co: [], desde: "nuevo", partes: ["toca", "hecho", "trabajan", "cola"], largo: "corto" };

/** Lo que se guardó, revisado: lo que no se entiende queda como viene por omisión. Siempre queda al menos una parte. */
export function leerOpciones(x: unknown): OpcionesResumen {
  const o = (x && typeof x === "object" ? x : {}) as Partial<Record<keyof OpcionesResumen, unknown>>;
  const co = Array.isArray(o.co) ? o.co.filter((p): p is string => typeof p === "string" && /^[A-Z0-9]{1,10}$/.test(p)).slice(0, 20) : [];
  const desde = (["nuevo", "hoy", "24h", "7d"] as const).find((d) => d === o.desde) ?? OPCIONES_OMISION.desde;
  const partes = Array.isArray(o.partes) ? PARTES.filter((p) => (o.partes as unknown[]).includes(p)) : [...OPCIONES_OMISION.partes];
  const largo = o.largo === "completo" ? "completo" : "corto";
  return { co: [...new Set(co)], desde, partes: partes.length ? partes : ["toca"], largo };
}

/** Marca o desmarca una parte (§2.5): siempre queda al menos una, en el orden de siempre. */
export function alternarParte(partes: readonly Parte[], p: Parte): Parte[] {
  if (partes.includes(p)) return partes.length > 1 ? partes.filter((x) => x !== p) : [...partes];
  return PARTES.filter((x) => x === p || partes.includes(x));
}

/** Elige o quita una empresa (§2.4): elegir una quita «Todas», y quitar la última (o elegirlas todas) vuelve a «Todas». */
export function alternarEmpresa(co: readonly string[], prefijo: string | null, todas: readonly string[]): string[] {
  if (prefijo === null) return [];
  const s = co.includes(prefijo) ? co.filter((x) => x !== prefijo) : [...co, prefijo];
  return s.length >= todas.length && todas.every((t) => s.includes(t)) ? [] : todas.filter((t) => s.includes(t));
}

/** Una frase del resumen: lo que se dice y se ve, de qué empresa (su sala se enciende), de qué agente (lleva el anillo) y su tarea (el chip). */
export interface FraseResumen {
  sec: Seccion;
  texto: string;
  co?: string | null;
  ag?: string | null;
  tid?: string | null;
  /** «No pude leer Migo»: en rojo (§8). */
  aviso?: boolean;
  /** La escribió la IA de Chrome (para la QA; se ve y suena igual). */
  ia?: boolean;
}

export interface Contexto {
  ahora: number;
  /** La hora en que se armó el último resumen escuchado (`of-resumen-ultima`), o `null`. */
  ultima: number | null;
  op: OpcionesResumen;
  /** La IA de Chrome escribe el resto (la primera frase empieza con «Hola.», como en el prototipo). */
  conIa?: boolean;
}

/** Cómo dice cada título: corto y sin el rol de adelante de esa empresa (`tituloParaVoz` con sus roles). */
export type Titulo = (titulo: string, prefijo: string) => string;

/** «a, b y c»; si alguno ya lleva coma («X», con 69 tareas), con punto y coma: «a; b; y c» (se entiende al oírlo). */
const lista = (xs: readonly string[]) => {
  if (xs.length < 2) return xs.join("");
  const sep = xs.some((x) => x.includes(",")) ? ";" : ",";
  return `${xs.slice(0, -1).join(`${sep} `)}${sep === ";" ? ";" : ""} y ${xs.at(-1)}`;
};
const may = (t: string) => t.replace(/^([¿¡«]*)(\p{L})/u, (_m, s: string, l: string) => `${s}${l.toUpperCase()}`);
const min = (t: string) => t.replace(/^(\p{Lu})(?!\p{Lu})/u, (l) => l.toLowerCase());
const comillas = (t: string) => (t ? `«${t}»` : "");

/** «una», «2» (para «una terminada», «2 terminadas»). */
const una = (n: number, uno: string, varios: string) => (n === 1 ? uno : `${n} ${varios}`);

/** Cuántas de cada empresa (las más grandes primero; empate, en el orden de la Oficina). */
function porEmpresa<T extends { prefijo: string }>(xs: readonly T[], empresas: readonly EmpresaRes[]): Array<[EmpresaRes, T[]]> {
  const orden = empresas.map((e) => e.prefijo);
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(x.prefijo, [...(m.get(x.prefijo) ?? []), x]);
  return [...m.entries()]
    .map(([p, l]) => [empresas.find((e) => e.prefijo === p) ?? { id: p, prefijo: p, nombre: p }, l] as [EmpresaRes, T[]])
    .sort((a, b) => b[1].length - a[1].length || orden.indexOf(a[0].prefijo) - orden.indexOf(b[0].prefijo));
}

/** «8 en Betalandia, 4 en JSTM y 3 en Migo». */
const enEmpresas = <T extends { prefijo: string }>(xs: readonly T[], empresas: readonly EmpresaRes[]) => lista(porEmpresa(xs, empresas).map(([e, l]) => `${l.length} en ${e.nombre}`));

const nombreDe = (prefijo: string, empresas: readonly EmpresaRes[]) => empresas.find((e) => e.prefijo === prefijo)?.nombre ?? prefijo;

/** «"Sincronizar Trello: tableros y listas", que corrió 8 veces», «"Oficina global 0.9.0", con 4», «"Oficina global 0.9.0"». */
export function textoPedido(p: Pick<Pedido, "titulo" | "n" | "rutina" | "prefijo">, titulo: Titulo): string {
  const t = comillas(titulo(p.titulo, p.prefijo)) || "uno sin nombre";
  if (p.rutina && p.n > 1) return `${t}, que corrió ${p.n} veces`;
  return p.n > 1 ? `${t}, con ${p.n} tareas` : t;
}

/** Con qué trabaja: «"Oficina global 0.9.0"» o, si son varias del mismo pedido, «3 de "pixel agent"». */
export function conQue(g: Pick<Trabajo, "tareas" | "prefijo">, titulo: Titulo): string {
  const raices = new Set(g.tareas.map((t) => t.raiz?.id ?? t.id));
  const raiz = g.tareas[0]?.raiz;
  if (g.tareas.length > 1 && raices.size === 1 && raiz?.titulo) {
    const t = comillas(titulo(raiz.titulo, g.prefijo));
    if (t) return `${g.tareas.length} de ${t}`;
  }
  return comillas(titulo(g.tareas[0]?.titulo ?? "", g.prefijo)) || "su tarea";
}

/**
 * Lo que pide, con su tarea si no dice de cuál es (JST-259): «¿Apruebas commit
 * y PR? Es de «Avisos de las exportaciones a CSV».» o «responder commit y PR,
 * de «…»».
 */
const pideCon = (x: Toca, de: string | null | undefined = x.deTarea) => (x.pregunta ? `${x.pide}${de ? ` Es de ${comillas(de)}.` : ""}` : `${x.pide}${de ? `, de ${comillas(de)}` : ""}`);

/** «te pide revisar el PR…» o, si es una pregunta, «te pregunta: ¿…?». */
const loQuePide = (x: Toca, de?: string | null) => (x.pregunta ? `te pregunta: ${pideCon(x, de)}` : `te pide ${pideCon(x, de)}`);

/** La frase con la tarea de lo que pide; si no cabe (§4, `LETRAS_FRASE_RESUMEN`), con su título más corto, o sin él. */
function conTarea(x: Toca, armar: (de: string | null | undefined) => string): string {
  const t = armar(x.deTarea);
  const sobra = [...t].length - LETRAS_FRASE_RESUMEN;
  if (!x.deTarea || sobra <= 0) return t;
  const corto = cortarNatural(x.deTarea, { palabras: 11, letras: [...x.deTarea].length - sobra });
  return corto && /\p{L}/u.test(corto) && [...armar(corto)].length <= LETRAS_FRASE_RESUMEN ? armar(corto) : armar(null);
}

/** El período, con la empresa si se eligió una o algunas: «Desde las 8:12, …», «En Migo, desde las 8:12, …». */
function periodoCon(c: Contexto, elegidas: readonly EmpresaRes[]): string {
  const periodo = periodoFrase(c.op.desde, c.ahora, c.ultima);
  return c.op.co.length > 0 && elegidas.length > 0 ? `En ${lista(elegidas.map((e) => e.nombre))}, ${min(periodo)}` : periodo;
}

/**
 * La primera frase (§3.2.1): con los datos, nunca con la IA. «Desde las 8:12,
 * la última vez que lo escuchaste: 15 terminadas, 11 trabajando, 6 te esperan y
 * 71 en cola.» Las partes desmarcadas no salen.
 */
export function fraseNumeros(d: Pick<DatosResumen, "toca" | "trabajan" | "hechas" | "cola">, c: Contexto, elegidas: readonly EmpresaRes[]): string {
  const k = contarPartes(d);
  const p = c.op.partes;
  const nums: string[] = [];
  if (p.includes("hecho")) nums.push(k.hecho === 0 ? "nada terminado" : una(k.hecho, "una terminada", "terminadas"));
  if (p.includes("trabajan")) nums.push(k.trabajan === 0 ? "nadie trabajando" : una(k.trabajan, "uno trabajando", "trabajando"));
  if (p.includes("toca")) nums.push(k.toca === 0 ? "nada te espera" : una(k.toca, "una cosa te espera", "te esperan"));
  if (p.includes("cola")) nums.push(k.cola === 0 ? "nada en cola" : una(k.cola, "una en cola", "en cola"));
  return `${c.conIa ? "Hola. " : ""}${periodoCon(c, elegidas)}: ${lista(nums)}.`;
}

/** Lo que te toca (§3.2.2): la más antigua primero. En corto, las 2 más antiguas; en completo, todas. */
export function frasesToca(T: readonly Toca[], d: Pick<DatosResumen, "empresas">, c: Contexto): FraseResumen[] {
  if (T.length === 0) return [{ sec: "toca", texto: "No te espera nada." }];
  const completo = c.op.largo === "completo";
  const tope = completo ? T.length : Math.min(2, T.length);
  const out: FraseResumen[] = [];
  T.slice(0, tope).forEach((x, i) => {
    const quien = `${x.agente} de ${nombreDe(x.prefijo, d.empresas)}`;
    let texto: string;
    if (i === 0) {
      const cabeza = T.length === 1 ? "Te espera una cosa:" : `Te esperan ${T.length} cosas. La más antigua:`;
      const desde = desdeCuando(x.desde, c.ahora);
      texto = conTarea(x, (de) => (x.pregunta ? `${cabeza} ${quien} ${loQuePide(x, de)} Espera desde ${desde}.` : `${cabeza} ${quien} ${loQuePide(x, de)}; espera desde ${desde}.`));
    } else {
      const y = completo && i === tope - 1 && T.length > 2 ? "Y" : "Después,";
      texto = conTarea(x, (de) =>
        x.pregunta ? `${y} ${quien} ${loQuePide(x, de)}${completo ? ` Desde hace ${hace(x.desde, c.ahora)}.` : ""}` : `${y} ${quien}: ${pideCon(x, de)}${completo ? `, desde hace ${hace(x.desde, c.ahora)}` : ""}.`,
      );
    }
    out.push({ sec: "toca", texto, co: x.prefijo, ag: x.agenteId, tid: x.tid });
  });
  if (T.length > tope) out.push({ sec: "toca", texto: `Y ${T.length - tope === 1 ? "una" : T.length - tope} más, con la mano arriba en la Oficina.` });
  return out;
}

/** Lo que se hizo (§3.2.3), por pedido. Corto: el total por empresa y los 2 pedidos más grandes. Completo: por empresa, sus 3 más grandes. */
export function frasesHecho(d: Pick<DatosResumen, "hechas" | "pedidos" | "empresas">, c: Contexto, titulo: Titulo): FraseResumen[] {
  const n = d.hechas.length;
  const P = d.pedidos;
  if (n === 0) {
    const nuevo = c.op.desde === "nuevo" ? nuevoDe(c.ultima, c.ahora) : null;
    if (nuevo?.k === "desde") return [{ sec: "hecho", texto: `${periodoFrase("nuevo", c.ahora, c.ultima).replace(/, la última vez que lo escuchaste$/, "")} no se terminó nada nuevo.` }];
    return [{ sec: "hecho", texto: `No se terminó nada ${periodoCorto(c.op.desde, c.ahora, c.ultima)}.` }];
  }
  const E = porEmpresa(d.hechas, d.empresas);
  const total = `Se ${n === 1 ? "terminó una tarea" : `terminaron ${n} tareas`} de ${P.length === 1 ? "un pedido" : `${P.length} pedidos`}`;
  // Un solo pedido: va en la misma frase («Se terminaron 4 tareas de un pedido: «pixel agent».»).
  if (P.length === 1) return [{ sec: "hecho", texto: `${total}: ${textoPedido({ ...P[0]!, n: P[0]!.rutina ? P[0]!.n : 1 }, titulo)}.`, co: P[0]!.prefijo, tid: P[0]!.tid }];
  if (c.op.largo === "corto") {
    const top = P.slice(0, 2);
    return [
      { sec: "hecho", texto: `${total}${E.length > 1 ? `: ${enEmpresas(d.hechas, d.empresas)}` : ""}.` },
      { sec: "hecho", texto: `Los más grandes: ${lista(top.map((p) => textoPedido(p, titulo)))}.`, co: top[0]!.prefijo, tid: top[0]!.tid },
    ];
  }
  const out: FraseResumen[] = [{ sec: "hecho", texto: `${total}.` }];
  for (const [e, xs] of E) {
    const ps = P.filter((p) => p.prefijo === e.prefijo);
    const top = ps.slice(0, 3);
    const r = ps.length - top.length;
    out.push({ sec: "hecho", texto: `${e.nombre}, ${xs.length}: ${lista(top.map((p) => textoPedido(p, titulo)))}${r > 0 ? `; y ${r === 1 ? "un pedido más" : `${r} pedidos más`}` : ""}.`, co: e.prefijo, tid: top[0]?.tid ?? null });
  }
  return out;
}

/** En qué trabajan (§3.2.4). Corto: cuántos por empresa y el que lleva más. Completo: por empresa, cada uno con lo que lleva. */
export function frasesTrabajan(W: readonly Trabajo[], d: Pick<DatosResumen, "empresas">, c: Contexto, titulo: Titulo): FraseResumen[] {
  if (W.length === 0) return [{ sec: "trabajan", texto: "Ahora no hay nadie trabajando." }];
  const E = porEmpresa(W, d.empresas);
  const lleva = (g: Trabajo) => `${hace(g.desde, c.ahora)} con ${conQue(g, titulo)}`;
  if (c.op.largo === "corto") {
    // `W` ya viene con el que lleva más primero (los que esperan turno, al final).
    const g = W[0]!;
    if (W.length === 1) return [{ sec: "trabajan", texto: `Trabaja uno: ${g.agente} de ${nombreDe(g.prefijo, d.empresas)}, ${lleva(g)}.`, co: g.prefijo, ag: g.agenteId, tid: g.tareas[0]?.identifier ?? null }];
    return [
      { sec: "trabajan", texto: `Trabajan ${W.length}${E.length > 1 ? `: ${enEmpresas(W, d.empresas)}` : ""}.` },
      { sec: "trabajan", texto: `Lleva más: ${g.agente} de ${nombreDe(g.prefijo, d.empresas)}, ${lleva(g)}.`, co: g.prefijo, ag: g.agenteId, tid: g.tareas[0]?.identifier ?? null },
    ];
  }
  const out: FraseResumen[] = [{ sec: "trabajan", texto: W.length === 1 ? "Trabaja uno." : `Trabajan ${W.length}.` }];
  for (const [e, gs] of E) {
    out.push({ sec: "trabajan", texto: `En ${e.nombre}: ${gs.map((g) => `${g.agente}, ${lleva(g)}`).join("; ")}.`, co: e.prefijo, ag: gs[0]!.agenteId, tid: gs[0]!.tareas[0]?.identifier ?? null });
  }
  return out;
}

/** Lo que está en cola (§3.2.5): cuántas, cuántas bloqueadas y cuántas esperan algo tuyo. En completo, con qué esperan y por empresa. */
export function frasesCola(L: readonly EnCola[], d: Pick<DatosResumen, "empresas">, c: Contexto, titulo: Titulo): FraseResumen[] {
  if (L.length === 0) return [{ sec: "cola", texto: "No queda nada en cola." }];
  const b = L.filter((x) => x.bloqueada).length;
  const w = { lista: 0, cola: 0, curso: 0, ti: 0, sin: 0 };
  for (const x of L) w[x.espera] += 1;
  const quedan = L.length === 1 ? "En cola queda una" : `En cola quedan ${L.length}`;
  const como =
    L.length === 1 ? (b === 1 ? ", bloqueada" : ", por empezar") : b === 0 ? ", todas por empezar" : b === L.length ? ", todas bloqueadas" : `: ${una(b, "una bloqueada", "bloqueadas")} y ${L.length - b} por empezar`;
  const tuyo = w.ti ? `; ${L.length === 1 ? "espera" : w.ti === 1 ? "una espera" : `${w.ti} esperan`} algo tuyo` : "";
  // El total es de todas las empresas (§6): enciende la sala y lleva el chip de la primera que espera algo tuyo solo si toda la cola es de esa empresa.
  const ti = L.find((x) => x.espera === "ti");
  const deUna = ti && L.every((x) => x.prefijo === ti.prefijo) ? ti : null;
  const out: FraseResumen[] = [{ sec: "cola", texto: `${quedan}${como}${tuyo}.`, ...(deUna ? { co: deUna.prefijo, tid: deUna.identifier } : {}) }];
  if (c.op.largo === "completo") {
    const partes: string[] = [];
    if (w.curso) partes.push(`${w.curso === 1 ? "una espera" : `${w.curso} esperan`} a una que ya se está haciendo`);
    if (w.cola) partes.push(`${w.cola === 1 ? "una" : w.cola} a otra de la cola`);
    if (w.lista && (w.curso || w.cola)) partes.push(`${w.lista === 1 ? "una está lista" : `${w.lista} están listas`} para empezar`);
    if (partes.length) out.push({ sec: "cola", texto: `${may(lista(partes))}.` });
    for (const [e, xs] of porEmpresa(L, d.empresas)) {
      const b2 = xs.filter((x) => x.bloqueada).length;
      const grupos = new Map<string, { titulo: string; n: number; tid: string | null }>();
      for (const x of xs) {
        const k = x.raiz?.id ?? x.id;
        const g = grupos.get(k) ?? { titulo: x.raiz?.titulo || x.titulo, n: 0, tid: x.raiz?.identifier ?? x.identifier };
        g.n += 1;
        grupos.set(k, g);
      }
      const g = [...grupos.values()].sort((a, z) => z.n - a.n)[0];
      const bl = b2 ? `, ${b2 === xs.length ? (xs.length === 1 ? "bloqueada" : "todas bloqueadas") : una(b2, "una bloqueada", "bloqueadas")}` : "";
      const t = g && g.n > 1 ? comillas(titulo(g.titulo, e.prefijo)) : "";
      const mas = t ? `; lo que más espera es ${t}, con ${g!.n} tareas` : "";
      out.push({ sec: "cola", texto: `${e.nombre}, ${xs.length}${bl}${mas}.`, co: e.prefijo, tid: t ? g!.tid : null });
    }
  }
  return out;
}

/** El cierre (§3.2.6): lo primero que te toca, si hay. */
export function fraseCierre(T: readonly Toca[], d: Pick<DatosResumen, "empresas">, c: Contexto): FraseResumen {
  const x = c.op.partes.includes("toca") ? T[0] : undefined;
  if (!x) return { sec: "cierre", texto: "Eso es todo." };
  const quien = `${x.agente} de ${nombreDe(x.prefijo, d.empresas)}`;
  const texto = x.pregunta ? `Eso es todo. Lo primero: responderle a ${quien}.` : conTarea(x, (de) => `Eso es todo. Lo primero: ${pideCon(x, de)}.`);
  return { sec: "cierre", texto, co: x.prefijo, ag: x.agenteId, tid: x.tid };
}

/** Lo que va en «Los números»: la primera frase, una empresa que no respondió, la primera vez o más de una semana (§8). */
export function frasesIntro(d: Pick<DatosResumen, "toca" | "trabajan" | "hechas" | "cola" | "empresas" | "fallan">, c: Contexto, elegidas: readonly EmpresaRes[]): FraseResumen[] {
  const out: FraseResumen[] = [{ sec: "intro", texto: fraseNumeros(d, c, elegidas) }];
  if (d.fallan.length > 0) {
    const quedan = d.empresas.length;
    out.push({ sec: "intro", texto: `No pude leer ${lista(d.fallan.map((e) => e.nombre))}; te cuento ${quedan === 1 ? "la otra" : "las otras"}.`, aviso: true });
  }
  if (c.op.desde === "nuevo" && c.op.partes.includes("hecho")) {
    const n = nuevoDe(c.ultima, c.ahora);
    if (n.k === "primera") out.push({ sec: "intro", texto: "Es la primera vez que lo escuchas: te cuento lo de hoy." });
    if (n.k === "semana") out.push({ sec: "intro", texto: "Hace más de una semana que no lo escuchas: te cuento los últimos 7 días." });
  }
  return out;
}

/** Las frases armadas de una sección (también el respaldo de lo que escribe la IA). `elegidas`: las del menú (para «En Migo, …»). */
export function frasesDeSeccion(s: Seccion, d: DatosResumen, c: Contexto, titulo: Titulo, elegidas: readonly EmpresaRes[] = d.empresas): FraseResumen[] {
  switch (s) {
    case "intro":
      return frasesIntro(d, c, elegidas.filter((e) => !d.fallan.some((f) => f.id === e.id)));
    case "toca":
      return frasesToca(d.toca, d, c);
    case "hecho":
      return frasesHecho(d, c, titulo);
    case "trabajan":
      return frasesTrabajan(d.trabajan, d, c, titulo);
    case "cola":
      return frasesCola(d.cola, d, c, titulo);
    case "cierre":
      return [fraseCierre(d.toca, d, c)];
  }
}

/** Las secciones que se leen, en orden (§3.2): las desmarcadas no se leen. */
export function seccionesDe(op: Pick<OpcionesResumen, "partes">): Seccion[] {
  return SECCIONES.filter((s) => s === "intro" || s === "cierre" || op.partes.includes(s));
}

/** Todo el resumen con frases armadas. */
export function armarResumen(d: DatosResumen, c: Contexto, titulo: Titulo, elegidas: readonly EmpresaRes[] = d.empresas): FraseResumen[] {
  return seccionesDe(c.op).flatMap((s) => frasesDeSeccion(s, d, c, titulo, elegidas));
}

/** Lo que dura una frase leída (§4): `clamp(1,6 s, 0,4 s + 64 ms × caracteres, 16 s)`, dividido por la velocidad. */
export function duracionFrase(texto: string, velocidad = 1): number {
  return Math.max(1600, Math.min(16_000, 400 + 64 * [...texto].length)) / velocidad;
}

export function duracionTotal(fr: readonly Pick<FraseResumen, "texto">[], velocidad = 1): number {
  return fr.reduce((s, f) => s + duracionFrase(f.texto, velocidad), 0);
}

/** «~1 min», «~3 min» (§2.1): menos de 90 s, «~1 min». */
export function textoDuracion(ms: number): string {
  return ms < 90_000 ? "~1 min" : `~${Math.round(ms / 60_000)} min`;
}

/** «1:02» (§8, «Listo · 1:02»). */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
