// Botón «Leer contexto» en la barra de herramientas de una tarea (JST-269):
// al apretarlo lee en voz alta un resumen de la tarea y su padre para que el
// usuario entienda por qué le piden una decisión sin tener que leer todo el hilo.
//
// - Solo se muestra cuando `entityId` es una tarea (el slot es `toolbarButton`
//   con `entityTypes: ["issue"]`, así que siempre hay un ID de tarea).
// - Fetch de `/api/issues/:id` con la sesión del usuario (igual que el resto
//   de la Oficina: `credentials: "include"`, URL relativa).
// - Fetch de los últimos comentarios de la tarea (máximo 10; se leen 3, sin
//   los avisos automáticos de Paperclip). El texto lo limpia `contextoVoz.ts`.
// - Primero dice lo que te preguntan (JST-273): la tarjeta pendiente o, si no
//   hay, el último comentario «🙋 Te toca» (`contextoPregunta.ts`). Después el
//   porqué: la tarea, el padre y lo último del hilo, más corto.
// - Lee con la voz del navegador en español; si no hay voz, muestra el texto
//   en un subtítulo breve.
// - Mientras suena muestra «⏹ Detener»; al terminar vuelve al ícono. Al salir de
//   la tarea se calla (JST-277).
import { useCallback, useEffect, useRef, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { preguntaPendiente, teTocaDelHilo } from "./contextoPregunta.js";
import { enIngles, esComentarioAutomatico, textoParaVoz } from "./contextoVoz.js";
import { cx, Icono } from "./piso.js";
import { vocesDisponibles } from "./sonido.js";
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
  const comentariosUtiles = comentarios
    .filter((c) => c.body?.trim() && !esComentarioAutomatico(c) && !enIngles(c.body))
    .map((c) => textoParaVoz(c.id === teToca?.id ? teToca.resto : c.body))
    .filter(seDice)
    .slice(0, pregunta ? 2 : 3);

  // Descripción (los primeros 300 caracteres, sin markdown; en inglés no se lee: la voz es en español).
  // Una corta también: suele ser la pregunta («¿Lo publico hoy?», JST-278).
  // Con pregunta, el porqué está en el hilo: solo si no hay comentarios.
  if (issue.description && !enIngles(issue.description) && !(pregunta && comentariosUtiles.length > 0)) {
    const desc = textoParaVoz(issue.description);
    if (seDice(desc)) {
      partes.push(`La tarea dice: ${conPunto(recortar(desc, 300))}`);
    }
  }

  if (comentariosUtiles.length > 0) {
    partes.push("Lo último en el hilo:");
    comentariosUtiles.forEach((c) => partes.push(conPunto(recortar(c, 150))));
  }

  return partes.join(" ");
}

// ---------------------------------------------------------------------------
// Lectura con voz del navegador
// ---------------------------------------------------------------------------

/**
 * Lee `texto` y devuelve con qué pararlo. Parar solo corta si esta lectura sigue sonando: la voz del
 * navegador es una sola para toda la pestaña y la Oficina también la usa (JST-277).
 */
function leerEnVoz(texto: string, alTerminar: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    const t = setTimeout(alTerminar, 100);
    return () => clearTimeout(t);
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  const voces = vocesDisponibles();
  const vEspanol = voces[0];
  if (vEspanol) {
    u.voice = vEspanol;
    u.lang = vEspanol.lang;
  } else {
    u.lang = "es-MX";
  }
  u.rate = 1.05;
  let sonando = true;
  const fin = () => {
    if (!sonando) return;
    sonando = false;
    alTerminar();
  };
  u.onend = fin;
  u.onerror = fin;
  window.speechSynthesis.speak(u);
  return () => {
    if (!sonando) return;
    sonando = false;
    window.speechSynthesis.cancel();
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

type Estado = "idle" | "cargando" | "leyendo";

export function BotonContextoTarea() {
  const { entityId } = useHostContext();
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState<string | null>(null);
  const detenerRef = useRef<() => void>(() => undefined);
  // Cuenta las lecturas pedidas: una que todavía está cargando cuando se para no empieza a hablar.
  const lecturaRef = useRef(0);

  const detener = useCallback(() => {
    lecturaRef.current += 1;
    detenerRef.current();
    detenerRef.current = () => undefined;
    setEstado("idle");
  }, []);

  // Al salir de la tarea (a otra, o a una página sin el botón) la lectura se corta (JST-277): si no,
  // seguía hasta el final y ya no había una X para pararla.
  useEffect(
    () => () => {
      detener();
      setError(null);
    },
    [entityId, detener],
  );

  const leer = useCallback(async () => {
    if (!entityId) return;
    if (estado === "leyendo") {
      detener();
      return;
    }
    const lectura = ++lecturaRef.current;
    setError(null);
    setEstado("cargando");
    try {
      const [issue, comentarios, tarjetas] = await Promise.all([
        fetchIssue(entityId),
        fetchComments(entityId),
        fetchInteracciones(entityId),
      ]);
      if (lectura !== lecturaRef.current) return;
      const texto = componerTexto(issue, comentarios, tarjetas);
      setEstado("leyendo");
      detenerRef.current = leerEnVoz(texto, () => setEstado("idle"));
    } catch (e) {
      if (lectura !== lecturaRef.current) return;
      setError("No se pudo cargar la tarea.");
      setEstado("idle");
    }
  }, [entityId, estado, detener]);

  if (!entityId) return null;

  const cargando = estado === "cargando";
  const leyendo = estado === "leyendo";

  return (
    <button
      type="button"
      className={cx("of-tbtn", (leyendo || cargando) && "is-active")}
      aria-label={leyendo ? "Detener lectura" : "Leer contexto de la tarea"}
      title={leyendo ? "Detener" : error ?? "Leer contexto"}
      onClick={leer}
      disabled={cargando}
    >
      {leyendo ? (
        <Icono nombre="x" tam={16} />
      ) : (
        <Icono nombre="volume-2" tam={16} />
      )}
    </button>
  );
}
