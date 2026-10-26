// Cómo lee «Leer contexto» (JST-269) el texto de una tarea y su hilo, sin
// React ni navegador (JST-275, QA JST-270):
//
// - `textoParaVoz`: sin markdown ni códigos HTML (`&#x20;` se leía «y x20»).
//   Lo que va entre comillas invertidas se dice como texto («`_instalado`» →
//   «instalado», «`edgesOut`» → «edges Out», «`in_review`» → «en revisión»,
//   una ruta por su último nombre); un comando largo es «un comando» y un
//   trozo de código «un código». Antes se borraba y quedaba «Carpeta: , al
//   lado de la vieja ().». Sin emojis (JST-274): la voz decía su nombre.
// - `esComentarioAutomatico`: los avisos que escribe Paperclip (en inglés),
//   que no se leen. `enIngles`: un comentario escrito en inglés, que la voz en
//   español leía mal («ron completed»).
import { sinBarras, sinDirecciones } from "../paraVoz.js";

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** «&#x20;», «&#39;», «&amp;» → su letra (los trae a veces la descripción, del editor). */
export function sinEntidades(t: string): string {
  return t.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]{2,6}));/gi, (x: string, hex?: string, dec?: string, nombre?: string) => {
    if (nombre) return ENTIDADES[nombre.toLowerCase()] ?? x;
    const n = parseInt(hex ?? dec ?? "", hex ? 16 : 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  });
}

/**
 * Un emoji con lo que lo arma: selector de variante, unión, tono de piel,
 * bandera, tecla («1️⃣» queda «1») y etiquetas. No las flechas, «✓» ni «✦»: la
 * voz no las dice.
 */
const PIEZA_EMOJI = String.raw`[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\u20E3\uFE0E\uFE0F\u{E0020}-\u{E007F}]`;
const EMOJI = new RegExp(PIEZA_EMOJI, "gu");
/** Al principio o después de «, ¿ o (: se va con sus espacios («🔊 Leer» → «Leer»). */
const EMOJI_AL_ABRIR = new RegExp(String.raw`(^|[«“"'(¿¡[])\s*(?:${PIEZA_EMOJI}+\s*)+`, "gu");

/**
 * Sin emojis (JST-274): la voz del Mac dice su nombre («⏳ Avance» se oía «reloj
 * de arena con la arena cayendo avance») y los comentarios de los agentes
 * empiezan todos con uno.
 */
export function sinEmojis(t: string): string {
  return t.replace(EMOJI_AL_ABRIR, "$1").replace(EMOJI, " ");
}

/** Lo que se escribe al principio de una línea de terminal. */
const PROGRAMAS = new Set(
  (
    "bash brew cargo cat cd chmod cp curl date docker echo env export ffmpeg find git go grep kill ls make mkdir mv node npm npx open " +
    "paperclipai pip pip3 plugin pnpm ps python python3 python3.11 rm say sed sh source sudo tail tsc uv vitest yarn zsh"
  ).split(" "),
);
/** Lo que solo va en una terminal: «&&», «|», «>», «$(…)», «$VAR», «./x», «--opción». */
const DE_TERMINAL = /&&|\|\||\s\|\s|\s>>?\s|\$\(|\$[A-Z_{]|^\.\/|(?:^|\s)--?[a-zA-Z]/;
/** Un trozo de código: asignaciones, llamadas con argumentos, llaves o corchetes. */
const DE_CODIGO = /=|[{}[\];]|[\p{L}\p{N}_]\(/u;
/** El nombre de un pedido a la API: «POST /api/issues/…». */
const PEDIDO = /^(?:GET|POST|PUT|PATCH|DELETE)\s+\//;
/** Un commit («198723e»). */
const COMMIT = /^(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}$/;
/** Un id: un uuid entero o cortado («fe7fb088-19f2-…», «e5a2c7b3…29a4») o el de una extensión de Chrome. */
const ID = /^(?=[0-9a-f-]*\d)(?=[0-9a-f-]*[a-f])[0-9a-f]{8}(?:[-…][0-9a-f…-]*)?$|^[0-9a-f]{6,}…[0-9a-f]*$|^[a-p]{32}$/;
/** La palabra de antes ya dice qué es («el commit `198723e`»): el código se quita. */
const YA_DICHO = /(?:^|[\s(])(?:commit|commits|tag|hash|id|ids|uuid|comentario|comentarios|corrida|run|tarjeta|agente|empresa|interacción|extensión)\s*:?\s*$/iu;
/** Los estados de una tarea, como los dice la Oficina. */
const ESTADOS: Record<string, string> = {
  backlog: "en espera",
  todo: "por hacer",
  in_progress: "en curso",
  in_review: "en revisión",
  blocked: "bloqueada",
  done: "terminada",
  cancelled: "cancelada",
};

/** Una palabra de código dicha como texto: «src/ui/piso.tsx:72» → «piso tsx», «revisarFraseIa()» → «revisar Frase Ia». Deja la coma o el punto de después. */
function palabraDeCodigo(w: string): string {
  // Una dirección queda para `sinDirecciones`, que dice «la dirección».
  if (/^[a-z][a-z0-9+.-]{1,15}:\/\/|^www\./i.test(w)) return w;
  // Lo de una llamada o un índice no se dice: «leer()» → «leer», «rows[0]» → «rows».
  const sinArgs = w.replace(/(?<=[\p{L}\p{N}_])(?:\([^)]*\)|\[[^\]]*\])/gu, "");
  const [, , medio = "", fin = ""] = /^([<"'«([]*)(.*?)([>"'»)\].,;:!?]*)$/u.exec(sinArgs) ?? [];
  const pausa = fin.replace(/[^.,;:!?]/g, "").slice(-1);
  return (decirPalabra(medio) + pausa).replace(/^[.,;:!?]$/, "");
}

function decirPalabra(w: string): string {
  let x = w;
  if (x.includes("/")) {
    const trozos = x.replace(/[?#].*$/, "").replace(/:\d+(?::\d+)?$/, "").split("/").filter(Boolean);
    x = trozos[trozos.length - 1] ?? "";
  }
  return x
    .replace(/(?<=[\p{L}\p{N}])[-_.](?=v\d)/gu, " ")
    .replace(/(?<![\p{L}\p{N}])v(?=\d)/gu, "")
    .replace(/(?<=[\p{L}\p{N}])\.(?=\p{L})/gu, " ")
    .replace(/[_\-*~#@$%^`=<>:,;|\\"'…]+/g, " ")
    .replace(/(?<![\p{L}\p{N}])\.+|\.+(?![\p{L}\p{N}])/gu, " ")
    .replace(/(?<=\p{Ll})(?=\p{Lu})/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lo que iba entre comillas invertidas, para la voz. `antes` es lo que va delante en el texto. */
function codigoParaVoz(codigo: string, antes: string): string {
  const c = codigo.trim();
  if (!/[\p{L}\p{N}]/u.test(c)) return " ";
  // Una dirección queda para `sinDirecciones`, que mira lo de antes («abre el enlace …»).
  if (/^[a-z][a-z0-9+.-]{1,15}:\/\/|^www\.|^localhost:\d/i.test(c)) return c;
  const estado = ESTADOS[c.toLowerCase()];
  if (estado) return estado;
  if (COMMIT.test(c) || ID.test(c)) return YA_DICHO.test(antes) ? " " : COMMIT.test(c) ? "un commit" : "un código";
  if (PEDIDO.test(c)) return "un pedido a la API";
  const palabras = c.split(/\s+/);
  const programa = PROGRAMAS.has(palabras[0]!.split("/").pop()!);
  const conSimbolos = /[^\p{L}\p{N}\s.-]/u.test(palabras.slice(1).join(" "));
  if (palabras.length > 1 && (DE_TERMINAL.test(c) || (programa && (palabras.length >= 3 || conSimbolos)))) return "un comando";
  if (palabras.length > 1 && DE_CODIGO.test(c)) return "un código";
  if (palabras.length >= 3 && /\.(?:py|mjs|js|ts|sh)$/.test(palabras[0]!)) return "un comando";
  const dicho = palabras.map(palabraDeCodigo).filter(Boolean).join(" ");
  return dicho || " ";
}

/**
 * Un texto de la tarea (título, descripción o comentario) como lo dice la voz:
 * sin markdown, sin códigos HTML ni emojis y con lo de las comillas invertidas
 * dicho en palabras (ver arriba). Un bloque de código es «un bloque de código».
 */
export function textoParaVoz(texto: string | null | undefined): string {
  const t = sinEmojis(sinEntidades(String(texto ?? "")))
    .replace(/```[\s\S]*?(?:```|$)([ \t]*\n)?/g, (_x: string, salto?: string) => (salto ? " un bloque de código. " : " un bloque de código "))
    .replace(/`([^`\n]+)`/g, (_x: string, c: string, i: number, todo: string) => codigoParaVoz(c, todo.slice(0, i)))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return sinBarras(sinDirecciones(t))
    .replace(/`/g, " ")
    .replace(/[*_~#>|]/g, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+([,.;:!?])(?=\s|$)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Un comentario del hilo, con lo que hace falta para saber si es de Paperclip. */
export interface ComentarioDelHilo {
  body?: string | null;
  authorType?: string | null;
  presentation?: { kind?: string | null } | null;
}

/**
 * Un aviso automático de Paperclip («Paperclip needs a disposition…», «Run
 * completed. Agent did not post a summary comment…»), que no se lee. El de
 * «Run completed» viene como del agente (`authorType: "agent"`): se ve por el
 * texto. `metadata.authorizationReason: "internal_agent_write"` no sirve: ahí
 * también va el resumen real del agente al terminar.
 */
export function esComentarioAutomatico(c: ComentarioDelHilo): boolean {
  return (
    c.authorType === "system" ||
    c.presentation?.kind === "system_notice" ||
    /^\s*Run (?:completed|failed|cancelled|timed out)\.\s+Agent did not post a summary comment/i.test(c.body ?? "")
  );
}

const EN = new Set(
  (
    "the and this that these those is was are were be been being it its to of for with from on at by an not did didn't don't doesn't " +
    "has have had will would can could should when already anything nothing because still but so my your our i you we they there " +
    "issue run agent before after continue needs moving until which what"
  ).split(" "),
);
const ES = new Set(
  "el la los las de del que y en un una unos unas por para con se es está están lo al ya pero como más sin su sus le les hay fue son esta este me te mi tu".split(" "),
);

/** El texto está escrito en inglés (la voz es en español): más palabras comunes del inglés que del español. */
export function enIngles(texto: string | null | undefined): boolean {
  const palabras = String(texto ?? "")
    .replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g, " ")
    .toLowerCase()
    .match(/[\p{L}']+/gu) ?? [];
  let en = 0;
  let es = 0;
  for (const p of palabras) {
    if (EN.has(p)) en++;
    else if (ES.has(p)) es++;
  }
  return en >= 3 && en > es * 2;
}
