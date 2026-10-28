// Lo que lee «Leer contexto» (JST-269): un resumen de la tarea y su padre para
// que el usuario entienda por qué le piden una decisión sin leer todo el hilo.
// Desde la 0.9.6 (JST-276, design-spec de JST-282) el botón va en la barra de
// arriba (`contextoBarra.tsx`) y la lectura de a una frase en `contextoLector.ts`;
// aquí queda qué se lee.
//
// - Fetch de `/api/issues/:ref` (el código, «JST-181», o el id) con la sesión del
//   usuario (igual que el resto de la Oficina: `credentials: "include"`, URL relativa).
// - Fetch de los últimos comentarios de la tarea (máximo 10; se leen 3, sin
//   los avisos automáticos de Paperclip). El texto lo limpia `contextoVoz.ts`.
// - Primero dice lo que te preguntan (JST-273): la tarjeta pendiente o, si no
//   hay, el último comentario «🙋 Te toca» (`contextoPregunta.ts`). Después el
//   porqué: la tarea, el padre y lo último del hilo, más corto.
import { preguntaPendiente, teTocaDelHilo } from "./contextoPregunta.js";
import { enIngles, esComentarioAutomatico, textoParaVoz } from "./contextoVoz.js";
import type { Interaccion } from "../shared.js";

// ---------------------------------------------------------------------------
// Fetch de datos de la tarea
// ---------------------------------------------------------------------------

interface IssueSummary {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string | null;
  ancestors?: Array<{ id: string; identifier?: string | null; title: string }>;
}

interface CommentSummary {
  id: string;
  body: string;
  authorName?: string | null;
  authorType?: string | null;
  presentation?: { kind?: string | null } | null;
}

async function fetchIssue(issueId: string): Promise<IssueSummary> {
  const r = await fetch(`/api/issues/${encodeURIComponent(issueId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<IssueSummary>;
}

async function fetchComments(issueId: string): Promise<CommentSummary[]> {
  // 10 y no 5: los avisos automáticos de Paperclip no se leen (JST-275) y pueden ser varios seguidos.
  const r = await fetch(`/api/issues/${encodeURIComponent(issueId)}/comments?limit=10&order=desc`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!r.ok) return [];
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : (d?.items ?? []);
}

/** Las tarjetas de la tarea (JST-273): la pendiente dice qué te preguntan. Si falla, se lee sin ella. */
async function fetchInteracciones(issueId: string): Promise<Interaccion[]> {
  const r = await fetch(`/api/issues/${encodeURIComponent(issueId)}/interactions`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!r?.ok) return [];
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : (d?.items ?? []);
}

// ---------------------------------------------------------------------------
// Composición del texto del resumen
// ---------------------------------------------------------------------------

function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const cortado = texto.slice(0, max);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  return (ultimoEspacio > max * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado) + "…";
}

/** Le queda algo que decir después de limpiarlo: una letra o un número (JST-278). «👍» o «---» no. */
function seDice(texto: string): boolean {
  return /[\p{L}\p{N}]/u.test(texto);
}

/** Con punto al final si no tiene, para que la voz pare antes de lo que sigue («Sí, dale» → «Sí, dale.»). */
function conPunto(texto: string): string {
  return /[.!?…:;]$/.test(texto) ? texto : `${texto}.`;
}

export function componerTexto(issue: IssueSummary, comentarios: CommentSummary[], tarjetas: Interaccion[]): string {
  const partes: string[] = [];

  // Lo que te preguntan, primero (JST-273): la tarjeta pendiente o el último «🙋 Te toca».
  const deTarjeta = preguntaPendiente(tarjetas);
  const teToca = deTarjeta ? null : teTocaDelHilo(comentarios);
  const pregunta = deTarjeta ?? teToca?.texto ?? null;
  if (pregunta) partes.push(pregunta);

  // Título y código
  const codigo = issue.identifier ? `${issue.identifier}: ` : "";
  partes.push(`${pregunta ? "Es de la tarea" : "Tarea"} ${codigo}${textoParaVoz(issue.title)}.`);

  // Padre (contexto de por qué existe esta tarea)
  const padre = issue.ancestors?.[0];
  if (padre) {
    const codigoPadre = padre.identifier ? `${padre.identifier}: ` : "";
    partes.push(`Es parte de ${codigoPadre}${textoParaVoz(padre.title)}.`);
  }

  // Últimos comentarios (los más recientes primero, máximo 3; con pregunta, 2), sin los avisos
  // automáticos de Paperclip ni lo escrito en inglés (JST-275). Del «Te toca» ya dicho, lo que sigue a su primera frase.
  // Uno corto también («Sí, dale.»), si después de limpiarlo queda algo que decir (JST-278).
  // El inglés se mira en lo que se lee, no en el texto entero (JST-310).
  const comentariosUtiles = comentarios
    .filter((c) => c.body?.trim() && !esComentarioAutomatico(c))
    .map((c) => recortar(textoParaVoz(c.id === teToca?.id ? teToca.resto : c.body), 150))
    .filter((c) => seDice(c) && !enIngles(c))
    .slice(0, pregunta ? 2 : 3);

  // Descripción (los primeros 300 caracteres, sin markdown; en inglés no se lee: la voz es en español).
  // El inglés se mira en esos 300 (JST-310): las que crea Paperclip («Review productivity for …»)
  // empiezan en inglés y terminan con los comentarios del agente en español.
  // Una corta también: suele ser la pregunta («¿Lo publico hoy?», JST-278).
  // Con pregunta, el porqué está en el hilo: solo si no hay comentarios.
  if (issue.description && !(pregunta && comentariosUtiles.length > 0)) {
    const desc = recortar(textoParaVoz(issue.description), 300);
    if (seDice(desc) && !enIngles(desc)) {
      partes.push(`La tarea dice: ${conPunto(desc)}`);
    }
  }

  if (comentariosUtiles.length > 0) {
    partes.push("Lo último en el hilo:");
    comentariosUtiles.forEach((c) => partes.push(conPunto(c)));
  }

  return partes.join(" ");
}

/** Lo que dice «Leer contexto» de esa tarea (el código o el id). Falla si no se pudo leer la tarea. */
export async function textoDeTarea(ref: string): Promise<string> {
  const [issue, comentarios, tarjetas] = await Promise.all([fetchIssue(ref), fetchComments(ref), fetchInteracciones(ref)]);
  return componerTexto(issue, comentarios, tarjetas);
}
