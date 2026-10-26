// Hojas de sprites del diseño (JST-65, `src/ui/assets/`). Van dentro del bundle
// como data-URL (esbuild, `loader: { ".png": "dataurl" }`): así la página, el
// widget y el modo TV no dependen de la ruta estática del plugin, que en
// 2026.824.1 pide el UUID de la instalación.
import PERSONAJES from "./assets/personajes.json" with { type: "json" };
import EFECTOS from "./assets/efectos.json" with { type: "json" };
import MASCOTAS from "./assets/mascotas.json" with { type: "json" };
import MUEBLES from "./assets/muebles.json" with { type: "json" };
import personajesPng from "./assets/personajes.png";
import efectosPng from "./assets/efectos.png";
import mascotasPng from "./assets/mascotas.png";
import mueblesPng from "./assets/muebles.png";
import alfombraBetClaro from "./assets/baldosas/alfombra-bet-claro.png";
import alfombraBetOscuro from "./assets/baldosas/alfombra-bet-oscuro.png";
import alfombraElmClaro from "./assets/baldosas/alfombra-elm-claro.png";
import alfombraElmOscuro from "./assets/baldosas/alfombra-elm-oscuro.png";
import alfombraJstClaro from "./assets/baldosas/alfombra-jst-claro.png";
import alfombraJstOscuro from "./assets/baldosas/alfombra-jst-oscuro.png";
import alfombraMigClaro from "./assets/baldosas/alfombra-mig-claro.png";
import alfombraMigOscuro from "./assets/baldosas/alfombra-mig-oscuro.png";
import paredBetClaro from "./assets/baldosas/pared-bet-claro.png";
import paredBetOscuro from "./assets/baldosas/pared-bet-oscuro.png";
import paredElmClaro from "./assets/baldosas/pared-elm-claro.png";
import paredElmOscuro from "./assets/baldosas/pared-elm-oscuro.png";
import paredJstClaro from "./assets/baldosas/pared-jst-claro.png";
import paredJstOscuro from "./assets/baldosas/pared-jst-oscuro.png";
import paredMigClaro from "./assets/baldosas/pared-mig-claro.png";
import paredMigOscuro from "./assets/baldosas/pared-mig-oscuro.png";
import pisoBaldosaClaro from "./assets/baldosas/piso-baldosa-claro.png";
import pisoBaldosaOscuro from "./assets/baldosas/piso-baldosa-oscuro.png";
import pisoMaderaClaro from "./assets/baldosas/piso-madera-claro.png";
import pisoMaderaOscuro from "./assets/baldosas/piso-madera-oscuro.png";

export const HOJAS = { personajes: personajesPng, efectos: efectosPng, muebles: mueblesPng, mascotas: mascotasPng };

/** Baldosas que se repiten, en `-claro` y `-oscuro` (la hoja de estilos elige según el tema). */
export const BALDOSAS: Readonly<Record<string, string>> = {
  "alfombra-bet-claro": alfombraBetClaro,
  "alfombra-bet-oscuro": alfombraBetOscuro,
  "alfombra-elm-claro": alfombraElmClaro,
  "alfombra-elm-oscuro": alfombraElmOscuro,
  "alfombra-jst-claro": alfombraJstClaro,
  "alfombra-jst-oscuro": alfombraJstOscuro,
  "alfombra-mig-claro": alfombraMigClaro,
  "alfombra-mig-oscuro": alfombraMigOscuro,
  "pared-bet-claro": paredBetClaro,
  "pared-bet-oscuro": paredBetOscuro,
  "pared-elm-claro": paredElmClaro,
  "pared-elm-oscuro": paredElmOscuro,
  "pared-jst-claro": paredJstClaro,
  "pared-jst-oscuro": paredJstOscuro,
  "pared-mig-claro": paredMigClaro,
  "pared-mig-oscuro": paredMigOscuro,
  "piso-baldosa-claro": pisoBaldosaClaro,
  "piso-baldosa-oscuro": pisoBaldosaOscuro,
  "piso-madera-claro": pisoMaderaClaro,
  "piso-madera-oscuro": pisoMaderaOscuro,
};

export type Animacion = keyof typeof PERSONAJES.animaciones;
export type Efecto = keyof typeof EFECTOS.animaciones;
export type AnimMascota = keyof typeof MASCOTAS.animaciones;

interface Anim {
  desde: number;
  cuadros: number;
  ms: number;
  /** `false`: se muestra una vez y queda en el último cuadro (el sobre que llega y que se abre, JST-96 §1). */
  bucle?: boolean;
}

/** Columnas de la hoja de efectos: hasta donde llega la última animación (26 en la 0.3.0). */
const COLUMNAS_EFECTOS = Math.max(...Object.values(EFECTOS.animaciones as Record<string, Anim>).map((a) => a.desde + a.cuadros));

/** Tamaño de cada hoja, en pixeles de arte. */
export const TAM = {
  personajes: { w: PERSONAJES.columnas * PERSONAJES.cuadro.ancho, h: PERSONAJES.filas.length * PERSONAJES.cuadro.alto },
  efectos: { w: COLUMNAS_EFECTOS * EFECTOS.cuadro.ancho, h: EFECTOS.cuadro.alto },
  muebles: { w: MUEBLES.ancho, h: MUEBLES.alto },
  mascotas: { w: MASCOTAS.columnas * MASCOTAS.cuadro.ancho, h: MASCOTAS.filas.length * MASCOTAS.cuadro.alto },
};

export const ANIMACIONES: Readonly<Record<Animacion, Anim>> = PERSONAJES.animaciones;
export const EFECTOS_ANIM: Readonly<Record<Efecto, Anim>> = EFECTOS.animaciones;
export const MASCOTAS_ANIM: Readonly<Record<AnimMascota, Anim>> = MASCOTAS.animaciones;

const FILAS_MASCOTAS = new Map(MASCOTAS.filas.map((f) => [f.id, f.fila]));

/** Fila de la hoja de mascotas (gato, perro, conejo, robot). */
export function filaMascota(id: string): number {
  return FILAS_MASCOTAS.get(id) ?? 0;
}

/** La animación de un personaje por su nombre (las de la 0.3.0 llegan como texto desde la vida); si no existe, `libre`. */
export function animacionDe(nombre: string): Animacion {
  return (nombre in ANIMACIONES ? nombre : "libre") as Animacion;
}
export const PIEZAS: Readonly<Record<string, { x: number; y: number; w: number; h: number }>> = MUEBLES.piezas;

const FILAS = new Map(PERSONAJES.filas.map((f) => [f.id, f.fila]));

/** Fila de la hoja de un aspecto; si no existe (hoja vieja), la de ingeniería. */
export function filaDe(aspecto: string): number {
  return FILAS.get(aspecto) ?? FILAS.get("ingenieria-1") ?? 0;
}
