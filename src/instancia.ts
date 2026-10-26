// Copia pública: sin agentes ni nombres propios. Cada instancia puede poner aquí
// el aspecto fijo de sus agentes (por ID), su nombre corto cuando la regla lo
// deja raro y cómo se pronuncian sus nombres.

/**
 * Aspecto fijo de cada agente, por ID: gana a la regla de `aspectoDe`.
 * Por ejemplo: `"<id del agente>": "direccion-1"` (las filas de `personajes.png`).
 */
export const ASPECTO_FIJO: Readonly<Record<string, string>> = {};

/**
 * Nombre corto de los agentes que la regla de `nombreCorto` deja raros (por
 * nombre, como están en Paperclip). Se suma a `CORTOS` de avisos.ts.
 * Por ejemplo: `"Ingeniera de Datos y Reportes": "Datos"`.
 */
export const CORTOS_INSTANCIA: Readonly<Record<string, string>> = {};

/**
 * Lo que Kokoro (espeak-ng) dice mal de los nombres de esta instancia: se le
 * escribe como se dice. Solo en Kokoro (generador/pronunciar.ts).
 * Por ejemplo: `[/\bNombre\b/g, "Cómo se dice"]`.
 */
export const PRONUNCIAR_KOKORO_INSTANCIA: ReadonlyArray<readonly [RegExp, string]> = [];
