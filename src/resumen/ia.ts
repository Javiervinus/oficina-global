// La IA de Chrome escribe el Resumen (0.9.0, design-spec de JST-245 §3.4), sin
// React ni navegador: qué se le pide de cada parte y la revisión de lo que
// escribe. La sesión (Gemini Nano, la de la 0.7.0) la abre la página
// (`src/ui/resumenIa.ts`).
//
// - Escribe cada parte por separado, a partir de sus frases armadas (los datos
//   ya juntados y contados): nunca recibe la lista de tareas.
// - Los números de la primera frase nunca pasan por ella.
// - Reescribe frase por frase, en el mismo orden: así cada frase conserva su
//   empresa (la sala que se enciende), su agente (el anillo) y su tarea (el chip).
// - Se revisa cada frase antes de leerla: los números, las horas, los nombres
//   de los agentes y de las empresas y lo que va entre «» tienen que ser los
//   mismos que en su frase armada. Si sobra, falta o cambia uno, esa parte va
//   con las armadas.
import type { FraseResumen, Seccion } from "./frases.js";
import { NOMBRE_SECCION } from "./frases.js";
import { LETRAS_FRASE_RESUMEN, problemasFraseResumen } from "./voz.js";

/** Súbelo si cambia lo que se le pide (para la QA: se anota con cada parte). */
export const VERSION_PROMPT_RESUMEN = "r3-jst246";

/** Lo más que escribe por frase (un poco menos que lo que acepta el worker). */
export const LETRAS_IA = LETRAS_FRASE_RESUMEN - 20;

export const SISTEMA_RESUMEN = `Eres el Chief of staff de una oficina de agentes de IA. Le lees al usuario, en voz alta, un resumen de lo que pasa en sus empresas. Escribes en español de Chile, cercano y claro, con frases cortas para decirlas en voz alta.
Te paso las frases de una parte del resumen, ya armadas con los datos. Reescríbelas para que suenen naturales, una tuya por cada una, en el mismo orden.
Reglas:
- Copia tal cual los números, las horas, los nombres de los agentes y de las empresas, y lo que va entre « ».
- Lo que va entre « » es el nombre de una tarea o de un pedido: nunca de un agente, una persona ni un proyecto.
- «X de Empresa» es el agente X de esa empresa (por ejemplo, «CMO de El Mirador»). No cambies quién hace qué.
- Las preguntas (de ¿ a ?) van tal cual, con sus signos.
- No agregues datos, nombres, números ni consejos que no estén. No inventes nada.
- No uses estados en inglés, códigos de tarea, emojis, listas ni comillas inglesas.
- Cada frase con menos de ${LETRAS_IA} letras.`;

export const EJEMPLO_PEDIDO_RESUMEN = `Parte: Lo que se hizo.
Frases:
1. Se terminaron 15 tareas de 13 pedidos: 8 en Betalandia, 4 en JSTM y 3 en Migo.
2. Los más grandes: «Sincronizar Trello», que corrió 8 veces; y «Conexión real con Sentry», con 2 tareas.`;

export const EJEMPLO_RESPUESTA_RESUMEN = JSON.stringify({
  frases: ["Se cerraron 15 tareas de 13 pedidos: 8 en Betalandia, 4 en JSTM y 3 en Migo.", "Lo que más avanzó fue «Sincronizar Trello», que corrió 8 veces, y «Conexión real con Sentry», con 2 tareas."],
});

/** Lo que se le pide de una parte: el texto y el esquema de la respuesta (tantas frases como armadas). */
export interface PedidoIa {
  sec: Seccion;
  texto: string;
  esquema: unknown;
  n: number;
}

export function pedidoIa(sec: Seccion, armadas: readonly FraseResumen[]): PedidoIa {
  const n = armadas.length;
  const texto = `Parte: ${NOMBRE_SECCION[sec]}.\nFrases:\n${armadas.map((f, i) => `${i + 1}. ${f.texto}`).join("\n")}`;
  const esquema = {
    type: "object",
    properties: { frases: { type: "array", minItems: n, maxItems: n, items: { type: "string", minLength: 4, maxLength: LETRAS_IA } } },
    required: ["frases"],
    additionalProperties: false,
  };
  return { sec, texto, esquema, n };
}

/** Los números y las horas de una frase («15», «9:20», «0.9.0»), en orden. */
export function numerosDe(t: string): string[] {
  return (t.match(/\d+(?:[.:,]\d+)*/g) ?? []).map((x) => x.replace(/[.,]$/, ""));
}

/** Lo que va entre «» (los títulos de las tareas). */
export function citasDe(t: string): string[] {
  return [...t.matchAll(/«([^»]*)»/g)].map((m) => m[1]!.trim());
}

/** Palabras que la IA no puede agregar: el resumen nunca habla de proyectos, personas, equipos ni clientes. */
const OTROS_QUIEN = ["proyecto", "proyectos", "persona", "personas", "equipo", "equipos", "cliente", "clientes"];
/** Palabras de cuántos y números en letras: si la IA cambia «una» por «dos», o «nadie» por «todos», cambió un dato. */
const CUANTOS = ["un", "una", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "veinte", "cien", "mil", "nadie", "nada", "ninguna", "ninguno", "todas", "todos", "ambos", "ambas", "algun", "alguna", "algunas", "alguno", "algunos", "varias", "varios", "muchas", "muchos", "pocas", "pocos"];

const plano = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
const contar = (xs: readonly string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const mismos = (a: readonly string[], b: readonly string[]) => {
  const x = contar(a);
  const y = contar(b);
  return x.size === y.size && [...x].every(([k, n]) => y.get(k) === n);
};

/** Cuántas veces aparece una palabra o nombre (ya en `plano`). */
const veces = (texto: string, nombre: string) => {
  const p = plano(nombre).trim();
  if (p.length < 2) return 0;
  return texto.split(` ${p} `).length - 1;
};

// Lo que cambia el sentido sin cambiar números ni nombres (JST-258, QA de la
// 0.9.0 con Gemini Nano): «7 por empezar» → «7 esperando que empieces», «lo que
// más espera es» → «la prioridad es», «la tarea más esperada», y «el que más se
// ejecutó fue «pixel agent»» (lo que corrió 63 veces era la rutina).

/**
 * Lo que dice que algo es del usuario (la 2.ª persona): «tú», «te», «tuyo» y
 * los verbos con que la IA se lo atribuye («que empieces», «tienes», «debes»).
 * Con tildes («estás» sí, «estas» no).
 */
const DE_TI = new Set(
  (
    "tú tu tus te ti contigo tuyo tuya tuyos tuyas usted ustedes vos " +
    "empiezas empieces empezaste empezarás empezarías comienzas comiences comenzaste comenzarás inicias inicies arrancas arranques " +
    "terminas termines terminaste terminarás acabas acabes completas completes completaste " +
    "revisas revises revisaste revisarás respondes respondas respondiste responderás contestas contestes contestaste " +
    "apruebas apruebes aprobaste aprobarás decides decidas decidiste eliges elijas elegiste " +
    "haces hagas hiciste harás harías tienes tengas tuviste tendrás tendrías puedes puedas pudiste podrás podrías " +
    "debes debas deberás deberías necesitas necesites quieres quieras querrás esperas esperes esperaste " +
    "ves veas viste verás miras mires atiendes atiendas atendiste actúas actúes tomas tomes confirmas confirmes " +
    "lees leas escuchas escuches escuchaste das des diste darás vas vayas irás estás estés estarás eres seas serás " +
    "has hayas habrás resuelves resuelvas cierras cierres asignas asignes priorizas priorices encargas encargues " +
    "ocupas ocupes pides pidas pediste sabes sepas recuerdas recuerdes avisas avises mueves muevas " +
    "desbloqueas desbloquees trabajas trabajes liberas liberes validas valides"
  ).split(" "),
);

/**
 * Cuántas veces una frase habla del usuario, sin contar los títulos, las
 * preguntas (van tal cual) ni «te cuento». Las palabras seguidas cuentan una
 * vez: «que tú hagas algo» es lo mismo que «algo tuyo».
 */
export function deTi(t: string): number {
  const sin = t
    .replace(/«[^»]*»/g, " ")
    .replace(/¿[^?]*\?/g, " ")
    .toLowerCase()
    .replace(/(^|[^\p{L}])te (?:cuento|comento|digo|informo|resumo|recuerdo)(?![\p{L}])/gu, "$1 ");
  let n = 0;
  let antes = false;
  for (const w of sin.split(/\s+/)) {
    const tuyo = DE_TI.has(w.replace(/[^\p{L}]+/gu, ""));
    if (tuyo && !antes) n += 1;
    // Una coma o un punto cortan la seguidilla.
    antes = tuyo && !/[^\p{L}]$/u.test(w);
  }
  return n;
}

/** Las partes en que todo ya es del usuario: ahí «tienes que responderle» dice lo mismo que «responderle». */
const TODO_TUYO: ReadonlySet<Seccion> = new Set(["toca", "cierre"]);

/** Palabras (ya en `plano`) que agregan una idea: una prioridad, una urgencia, un atraso, cómo rinde. */
const VALOR =
  /^(?:prioridad(?:es)?|prioritari[oa]s?|prioriz\w*|urgen\w*|importan\w*|critic[oa]s?|crucial(?:es)?|esencial(?:es)?|imprescindibles?|atrasad\w*|retrasad\w*|esperadisim\w*|productiv\w*|eficien\w*|rendimiento|rapid\w*|lent[oa]s?|lentamente)$/;
/** Y un consejo (salvo donde la armada ya lo es: «Lo primero: responderle…» → «deberíamos responderle…»). */
const CONSEJO = /^(?:recomiend\w*|recomend\w*|sugier\w*|sugerenci\w*|convien\w*|convendri\w*|convenient\w*|deberi\w*)$/;
/**
 * «Lista para empezar» es una de la cola que no espera nada (`espera === "lista"`),
 * no cualquiera «por empezar» (JST-264): pasa solo tantas veces como lo diga la armada.
 */
const LISTA = /^(?:list[oa]s?|preparad[oa]s?|disponibles?)$/;
/**
 * Que algo avanza (JST-264: «Lleva más: QA…» → «QA está avanzando más»): la
 * armada dice cuánto lleva, no cuánto avanza. «Se está haciendo» sí es que
 * avanza («espera a una que ya está avanzando»), y en «Lo que se hizo» todo
 * avanzó (es el ejemplo del prompt: «Lo que más avanzó fue…»).
 */
const AVANCE = /^(?:avanz\w*|avanc\w*|progres\w*|adelantad[oa]s?)$/;

/**
 * Las ideas de una frase: esas palabras, «más esperada» (lo que más espera no
 * es lo más esperado), «lista» y que algo avanza. `consejos`: si cuenta un
 * consejo; `avances`: si cuenta que algo avanza.
 */
export function ideasDe(t: string, consejos = true, avances = true): string[] {
  const w = plano(t.replace(/«[^»]*»/g, " ")).trim().split(" ");
  return w.flatMap((x, i) => {
    if (VALOR.test(x) || (consejos && CONSEJO.test(x))) return [x];
    if (x === "mas" && /^esperad/.test(w[i + 1] ?? "")) return [`más ${w[i + 1]}`];
    if (LISTA.test(x)) return ["lista"];
    if (avances && (AVANCE.test(x) || (x === "haciendo" && w[i - 2] === "se" && /^estan?$/.test(w[i - 1] ?? "")))) return ["avanza"];
    return [];
  });
}

/** Un agente que pasa a ser lo que se hace: «QA, 53 minutos con…» → «hicieron QA», «se dedicaron a QA», «se enfocaron en Integración y CI». */
const comoQueHacer = (texto: string, nombre: string) => {
  const p = plano(nombre).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return p.length < 2 ? 0 : (texto.match(new RegExp(` (?:dedic|enfoc|centr|ocup|hic|hiz|hac|realiz)[^ ]* (?:(?:a|al|en|de|del) )?${p} `, "g")) ?? []).length;
};

/** Las palabras de «corrió 63 veces» (ya en `plano`). */
const VECES = /^(?:corr(?:e|en|ia|io|ieron|ido|ida|idos|idas|iendo|er)|ejecut\w*|repiti\w*|repet\w*|veces)$/;

/** De quién es cada «corrió»/«se ejecutó»/«veces»: del título de antes («», si va antes del primero). */
export function duenosDeVeces(t: string): string[] {
  const out: string[] = [];
  let dueno = "";
  for (const p of t.split(/(«[^»]*»)/)) {
    if (p.startsWith("«") && p.endsWith("»")) dueno = p.slice(1, -1).trim();
    else for (const w of plano(p).trim().split(" ")) if (VECES.test(w)) out.push(dueno);
  }
  return out;
}

/** Los números pegados a un título en la armada («X», con 120 tareas · «X», que corrió 63 veces): [título, número]. */
export function numerosPegados(t: string): Array<[string, string]> {
  return [...t.matchAll(/«([^»]*)»,\s*(?:con|que corrió)\s+(\d+(?:[.:,]\d+)*)/g)].map((m) => [m[1]!.trim(), m[2]!]);
}

/** Los números junto a cada título: el primero después (hasta el título siguiente) y el de «11 tareas de «X»». */
function numerosJunto(t: string): Array<[string, string]> {
  const p = t.split(/(«[^»]*»)/);
  const out: Array<[string, string]> = [];
  for (let i = 1; i < p.length; i += 2) {
    const c = p[i]!.slice(1, -1).trim();
    const tras = numerosDe(p[i + 1] ?? "")[0];
    const antes = /(\d+(?:[.:,]\d+)*)\s+(?:\p{L}+\s+)?(?:de|del|en|con|para)\s*$/u.exec(p[i - 1] ?? "")?.[1];
    if (tras) out.push([c, tras]);
    if (antes) out.push([c, antes]);
  }
  return out;
}

/**
 * Por qué no sirve lo que escribió la IA para esa frase armada (vacío: sirve).
 * `nombres`: los de los agentes y las empresas de la oficina. `sec`: de qué
 * parte es (en «Lo que te toca» y en el cierre todo ya es del usuario).
 */
export function revisarFraseIa(armada: string, escrita: unknown, nombres: readonly string[], sec?: Seccion): string[] {
  if (typeof escrita !== "string") return ["no es texto"];
  const t = escrita.trim().replace(/\s+/g, " ");
  const mal = problemasFraseResumen(t);
  if ([...t].length > LETRAS_IA) mal.push("larga");
  if (!mismos(numerosDe(armada), numerosDe(t))) mal.push("cambia un número o una hora");
  const ca = citasDe(armada);
  const ce = citasDe(t);
  if (!mismos(ca, ce)) mal.push("cambia un título");
  const pa = plano(armada.replace(/«[^»]*»/g, " "));
  const pe = plano(t.replace(/«[^»]*»/g, " "));
  for (const n of nombres) {
    if (veces(pa, n) !== veces(pe, n)) {
      mal.push(`cambia un nombre (${n})`);
      break;
    }
  }
  const actividad = nombres.find((n) => comoQueHacer(pe, n) > comoQueHacer(pa, n));
  if (actividad) mal.push(`cambia quién es quién (hace «${actividad}»)`);
  for (const w of CUANTOS) {
    if (veces(pa, w) !== veces(pe, w) && !(w === "un" || w === "una" || w === "uno")) {
      mal.push(`cambia cuántos («${w}»)`);
      break;
    }
  }
  // «un», «una» y «uno» cambian de forma («una tarea» → «un pedido»), pero no pueden aparecer donde no había ninguno.
  const unos = (p: string) => veces(p, "un") + veces(p, "una") + veces(p, "uno");
  if (unos(pa) === 0 && unos(pe) > 0) mal.push("agrega «uno»");
  if (/\?/.test(t) !== /\?/.test(armada)) mal.push("cambia una pregunta");
  // Lo que cambia quién es quién: un pedido que pasa a ser «el agente», un agente que pasa a ser «el proyecto» (JST-246, en la copia).
  for (const w of OTROS_QUIEN) {
    if (veces(pe, w) > veces(pa, w)) {
      mal.push(`cambia quién es quién («${w}»)`);
      break;
    }
  }
  if (ca.length > 0 && veces(pe, "agente") + veces(pe, "agentes") > veces(pa, "agente") + veces(pa, "agentes")) mal.push("llama agente a una tarea");
  // Lo que es de los agentes no pasa a ser del usuario («7 por empezar» → «7 esperando que empieces»).
  const tuyo = !!sec && TODO_TUYO.has(sec);
  if (!tuyo && deTi(t) > deTi(armada)) mal.push("se lo atribuye al usuario");
  // Ni una prioridad, una urgencia, «la más esperada», «lista para empezar», que avanza ni un consejo que la armada no dice.
  const avances = sec !== "hecho";
  const ia = contar(ideasDe(armada, !tuyo, avances));
  const nueva = [...contar(ideasDe(t, !tuyo, avances))].find(([w, n]) => n > (ia.get(w) ?? 0));
  if (nueva) mal.push(`agrega una idea («${nueva[0]}»)`);
  // «Corrió 63 veces» es de la rutina que lo dice, no de otro título ni de la frase entera.
  const dv = new Set(duenosDeVeces(armada));
  if (duenosDeVeces(t).some((d) => !dv.has(d))) mal.push("cambia qué corrió");
  // Cada número sigue con su título («pixel agent», con 120 tareas; no con 63).
  const junto = numerosJunto(t);
  const suelto = numerosPegados(armada).find(([c, n]) => !junto.some(([c2, n2]) => c2 === c && n2 === n));
  if (suelto) mal.push(`cambia de quién es un número (${suelto[1]})`);
  return [...new Set(mal)];
}

/** Lo que salió de una parte: las frases (con lo de cada armada) si todas sirven; si no, `null` y por qué. */
export interface LeidoIa {
  frases: FraseResumen[] | null;
  mal: string[];
}

/**
 * Lee la respuesta de la IA para esas armadas: JSON con `frases`, tantas como
 * armadas, y cada una pasa `revisarFraseIa`. Cada frase conserva la empresa,
 * el agente y la tarea de su armada.
 */
export function leerParteIa(salida: string, armadas: readonly FraseResumen[], nombres: readonly string[]): LeidoIa {
  let datos: unknown;
  try {
    datos = JSON.parse(salida);
  } catch {
    return { frases: null, mal: ["no es JSON"] };
  }
  const fr = (datos as { frases?: unknown } | null)?.frases;
  if (!Array.isArray(fr)) return { frases: null, mal: ["sin frases"] };
  if (fr.length !== armadas.length) return { frases: null, mal: [`son ${fr.length} frases y no ${armadas.length}`] };
  const mal: string[] = [];
  const out: FraseResumen[] = [];
  fr.forEach((x, i) => {
    const a = armadas[i]!;
    const m = revisarFraseIa(a.texto, x, nombres, a.sec);
    if (m.length) mal.push(...m.map((y) => `${i + 1}: ${y}`));
    else out.push({ ...a, texto: String(x).trim().replace(/\s+/g, " "), ia: true });
  });
  return mal.length ? { frases: null, mal } : { frases: out, mal: [] };
}
