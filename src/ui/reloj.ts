// Un solo bucle de cuadros para todas las «vidas» de la pestaña (la página, el
// widget y el TV; design-spec de JST-96 §3 y §14). Corre con
// `requestAnimationFrame` solo mientras algo se mueve (alguien camina, un sobre
// vuela o una mascota pasea); si no, se detiene y un temporizador lo despierta
// para lo siguiente que toque (un turno de conversación, una mascota que se
// despierta, un sobre que se va). Con la pestaña oculta no corre nada.
import type { Vida } from "../vida.js";

interface Registro {
  vida: Vida;
  /** Se llama después de cada paso que movió algo (revisar los globos de conversación). */
  despues?: () => void;
}

const registros = new Set<Registro>();
let cuadro: number | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let cuadros = 0;
let escuchando = false;

const oculta = () => typeof document !== "undefined" && document.hidden;
const ahora = () => performance.now();

function correr(): void {
  temporizador = null;
  cuadro = null;
  const t = ahora();
  cuadros += 1;
  for (const r of registros) {
    r.vida.paso(t);
    r.vida.pintarPosiciones();
    // Los globos de conversación se revisan cada 6 cuadros mientras alguien camina con su globo por la misma sala.
    if (r.despues && cuadros % 6 === 0) r.despues();
  }
  despertar();
}

/** Vuelve a programar el bucle: un cuadro si algo se mueve, o un temporizador hasta lo próximo. */
export function despertar(): void {
  if (oculta() || cuadro !== null) return;
  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  let proximo = Infinity;
  for (const r of registros) {
    if (r.vida.seMueve()) {
      cuadro = requestAnimationFrame(correr);
      return;
    }
    proximo = Math.min(proximo, r.vida.proximo() ?? Infinity);
  }
  if (Number.isFinite(proximo)) temporizador = setTimeout(correr, Math.max(0, Math.ceil(proximo - ahora())));
}

function alCambiarVisibilidad(): void {
  if (!oculta()) {
    despertar();
    return;
  }
  if (cuadro !== null) cancelAnimationFrame(cuadro);
  if (temporizador !== null) clearTimeout(temporizador);
  cuadro = null;
  temporizador = null;
}

/** Suma una vida al bucle. Devuelve la función para sacarla. */
export function registrarVida(vida: Vida, despues?: () => void): () => void {
  const r: Registro = { vida, despues };
  registros.add(r);
  vida.fijarDespertador(despertar);
  if (!escuchando && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    escuchando = true;
  }
  despertar();
  return () => {
    registros.delete(r);
    vida.fijarDespertador(null);
    if (registros.size > 0) return;
    if (cuadro !== null) cancelAnimationFrame(cuadro);
    if (temporizador !== null) clearTimeout(temporizador);
    cuadro = null;
    temporizador = null;
  };
}

/** Cuántas vidas corren y si el bucle de cuadros está andando (para las pruebas en el navegador). */
export function estadoReloj(): { vidas: number; cuadro: boolean; temporizador: boolean } {
  return { vidas: registros.size, cuadro: cuadro !== null, temporizador: temporizador !== null };
}
