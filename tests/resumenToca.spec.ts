// «Lo que te toca» en el Resumen (0.9.2, JST-259, de la QA JST-247): sin
// direcciones web en voz alta, y con la tarea cuando la pregunta no dice de
// cuál es. Las tarjetas tienen la forma de las de la copia de la QA (respaldo
// de la real del 25-10 a las 07:22), con otros títulos.
import { describe, expect, it } from "vitest";
import { preguntaParaVoz, sinDirecciones, tareaParaVoz, tieneDireccion } from "../src/paraVoz.js";
import type { AgenteOficina, Espera } from "../src/estado.js";
import { pideDeEspera, tocaDe, type EmpresaRes, type Toca } from "../src/resumen/datos.js";
import { fraseCierre, frasesToca, OPCIONES_OMISION, type Contexto } from "../src/resumen/frases.js";
import { LETRAS_FRASE_RESUMEN, limpiarParaResumen, problemasFraseResumen } from "../src/resumen/voz.js";

const AHORA = new Date(2026, 9, 25, 8, 3).getTime();
const H = 3_600_000;
const iso = (t: number) => new Date(t).toISOString();

const EMPRESAS: EmpresaRes[] = [
  { id: "c-bet", prefijo: "BET", nombre: "Betalandia" },
  { id: "c-jst", prefijo: "JST", nombre: "JSTM" },
];

function espera(x: Partial<Espera> & { itemId: string }): Espera {
  return { tipo: "tarjeta", sujetoId: null, clase: "ask_user_questions", issueId: null, identifier: null, titulo: null, tituloTarea: null, href: null, desde: iso(AHORA - H), ...x };
}

function agente(x: Partial<AgenteOficina> & { id: string; companyId: string; prefijo: string; nombre: string }): AgenteOficina {
  return { rol: null, rolApi: null, adapterType: "claude_local", esHermes: false, statusApi: "idle", base: "libre", run: null, runsExtra: 0, teNecesita: [], motivo: null, desde: null, ...x };
}

const ctx = (largo: "corto" | "completo" = "completo"): Contexto => ({ ahora: AHORA, ultima: null, op: { ...OPCIONES_OMISION, largo, desde: "7d" } });

/** La tarjeta de JST-234 y las 4 de «commit y PR» del Líder técnico de Betalandia, como en la QA. */
const JST_234 = espera({
  itemId: "i234",
  issueId: "jst-234",
  identifier: "JST-234",
  titulo: "Permitir la IA de Chrome en tu Paperclip",
  tituloTarea: "Instalar en la real la 0.7.0 de «Oficina global» (la IA de Chrome escribe las conversaciones) cuando pase su QA",
  pregunta: "¿Ya agregaste http://192.0.2.15:3100 en chrome://flags y relanzaste Chrome?",
  desde: iso(AHORA - 5 * H + 6 * 60_000),
});
const BET_544 = espera({ itemId: "i544", issueId: "bet-544", identifier: "BET-544", titulo: "BET-544 · ¿Apruebas commit + PR de los tests de Exportar?", tituloTarea: "e2e panel: «Exportar» falla en cada build de QA (export.spec.ts)", desde: iso(AHORA - 5 * H - 4 * 60_000) });
const BET_514 = espera({ itemId: "i514", issueId: "bet-514", identifier: "BET-514", titulo: "¿Apruebas commit + PR de BT-6927?", tituloTarea: "BT-6927 · Avisos de las copias diarias también en la bandeja «Notificaciones» (cambia D-4)", desde: iso(AHORA - 5 * H + 12 * 60_000) });
const BET_508 = espera({ itemId: "i508", issueId: "bet-508", identifier: "BET-508", titulo: "BET-508 · ¿Apruebas commit + PR?", tituloTarea: "Sincronizar la casilla «¿Es usuario invitado?» con el rol guest-readonly de Keycloak", desde: iso(AHORA - 4 * H - 31 * 60_000) });
const BET_562 = espera({ itemId: "i562", issueId: "bet-562", identifier: "BET-562", titulo: "BET-562 · ¿Apruebas commit + PR?", tituloTarea: "Casilla «¿Es usuario invitado?» en solo lectura en el perfil del cliente (panel-admin)", desde: iso(AHORA - 3 * H - 56 * 60_000) });

const agentes = (): AgenteOficina[] => [
  agente({ id: "a-lider", companyId: "c-bet", prefijo: "BET", nombre: "Líder Técnico", teNecesita: [BET_544, BET_514, BET_508, BET_562] }),
  agente({ id: "a-cos", companyId: "c-jst", prefijo: "JST", nombre: "Chief of staff", teNecesita: [JST_234] }),
];

describe("sin direcciones web en voz alta (JST-259, parte 1)", () => {
  it("una dirección se dice «la dirección» y chrome://flags, «chrome flags»", () => {
    expect(sinDirecciones("¿Ya agregaste http://192.0.2.15:3100 en chrome://flags y relanzaste Chrome?")).toBe("¿Ya agregaste la dirección en chrome flags y relanzaste Chrome?");
    expect(sinDirecciones("Abre https://claude.ai/settings/connectors?x=1 y conecta.")).toBe("Abre la dirección y conecta.");
    expect(sinDirecciones("¿Puedes abrir http://localhost:3100/JST/issues?")).toBe("¿Puedes abrir la dirección?");
    expect(sinDirecciones("¿Entra por 192.0.2.15:3100 desde el celular?")).toBe("¿Entra por la dirección desde el celular?");
    expect(sinDirecciones("Revisa www.ejemplo.cl/registro, por favor")).toBe("Revisa la dirección, por favor");
    expect(sinDirecciones("Prueba en localhost:5173.")).toBe("Prueba en la dirección.");
    expect(sinDirecciones("chrome://flags/#prompt-api-for-gemini-nano")).toBe("chrome flags");
  });

  it("si ya dijo que es una dirección («el enlace», «la URL»), la quita sin más", () => {
    expect(sinDirecciones("Abre el enlace https://x.cl/a y dime")).toBe("Abre el enlace  y dime");
    expect(tareaParaVoz("Abre el enlace https://x.cl/a y dime")).toBe("Abre el enlace y dime");
    expect(tareaParaVoz("Cambiar la URL: http://192.0.2.15:3100")).toBe("Cambiar la URL");
  });

  it("no toca versiones, horas, dominios sueltos ni números", () => {
    for (const t of ["Instalar la 0.9.1 ahora", "Paperclip 2026.824.1", "la versión 1.2.3.4", "a las 9:20", "Microsoft 365 en claude.ai", "el 50 % de las maquetas", "PR #2057", "BET-508 · ¿Apruebas commit + PR?"]) {
      expect(sinDirecciones(t), t).toBe(t);
      expect(tieneDireccion(t), t).toBe(false);
    }
  });

  it("la pregunta de JST-234 ya no dice la dirección, ni en el Resumen ni en «te necesito»", () => {
    // Sin la dirección, ahora cabe entera en el Resumen (64 letras).
    expect(pideDeEspera(JST_234, new Set())).toMatchObject({ pide: "¿Ya agregaste la dirección en chrome flags y relanzaste Chrome?", pregunta: true });
    expect(preguntaParaVoz(JST_234.pregunta)).toBe("¿Ya agregaste la dirección en chrome flags y relanzaste Chrome?");
    expect(limpiarParaResumen("http 192.0.2.15:3100 en chrome flags")).toBe("http la dirección en chrome flags");
  });

  it("el worker no lee una dirección sin «://» (la de la 0.9.1)", () => {
    expect(problemasFraseResumen("Después, Chief of staff de JSTM te pregunta: ¿Ya agregaste http 192.0.2.15:3100 en chrome flags? Desde hace 5 horas.")).toContain("un enlace");
    expect(problemasFraseResumen("¿Entra por localhost:3100 desde el celular?")).toContain("un enlace");
    expect(problemasFraseResumen("Después, Chief of staff de JSTM te pregunta: ¿Ya agregaste la dirección en chrome flags? Desde hace 5 horas.")).toEqual([]);
    expect(problemasFraseResumen("Instalar la 0.9.1 y la 1.2.3.4 a las 9:20.")).toEqual([]);
  });
});

describe("la tarea de una pregunta que no dice de cuál es (JST-259, parte 2)", () => {
  it("la que nombraba su tarea por el código, o se repite, lleva el título corto de la tarea", () => {
    const T = tocaDe(agentes());
    const de = Object.fromEntries(T.map((x) => [x.tid, x]));
    expect(de["BET-514"]).toMatchObject({ pide: "¿Apruebas commit y PR?", pregunta: true, deTarea: "Avisos de las copias diarias también" });
    // Sin el «¿…?» de la casilla citada en el título.
    expect(de["BET-508"]).toMatchObject({ pide: "¿Apruebas commit y PR?", deTarea: "Sincronizar la casilla Es usuario invitado" });
    expect(de["BET-562"]?.deTarea).toBe("Casilla Es usuario invitado en solo lectura en el perfil");
    // «BET-544 · ¿Apruebas commit + PR de los tests de Exportar?» sí dice de cuál es: comparte «Exportar» con su tarea.
    expect(de["BET-544"]).toMatchObject({ pide: "¿Apruebas commit y PR de los tests de Exportar?" });
    expect(de["BET-544"]?.deTarea).toBeUndefined();
    // La de JST-234 no nombraba ningún código ni se repite.
    expect(de["JST-234"]?.deTarea).toBeUndefined();
  });

  it("las 3 «¿Apruebas commit y PR?» ya no suenan iguales", () => {
    const fr = frasesToca(tocaDe(agentes()), { empresas: EMPRESAS }, ctx());
    const textos = fr.map((f) => f.texto);
    expect(textos).toEqual([
      "Te esperan 5 cosas. La más antigua: Líder técnico de Betalandia te pregunta: ¿Apruebas commit y PR de los tests de Exportar? Espera desde las 2:59.",
      "Después, Chief of staff de JSTM te pregunta: ¿Ya agregaste la dirección en chrome flags y relanzaste Chrome? Desde hace 5 horas.",
      "Después, Líder técnico de Betalandia te pregunta: ¿Apruebas commit y PR? Es de «Avisos de las copias diarias también». Desde hace 5 horas.",
      "Después, Líder técnico de Betalandia te pregunta: ¿Apruebas commit y PR? Es de «Sincronizar la casilla Es usuario invitado». Desde hace 5 horas.",
      "Y Líder técnico de Betalandia te pregunta: ¿Apruebas commit y PR? Es de «Casilla Es usuario invitado en solo lectura en el perfil». Desde hace 4 horas.",
    ]);
    expect(new Set(textos).size).toBe(textos.length);
    for (const f of fr) expect(problemasFraseResumen(f.texto), f.texto).toEqual([]);
    // El chip sigue siendo el de su tarea.
    expect(fr.filter((f) => /Apruebas commit y PR\? Es de/.test(f.texto)).map((f) => f.tid)).toEqual(["BET-514", "BET-508", "BET-562"]);
  });

  it("una pregunta que dice de qué es y no se repite queda igual", () => {
    const e = espera({ itemId: "x", identifier: "MIG-101", titulo: "¿Cómo te fue con la prueba del informe PDF?", tituloTarea: "Prueba KAN-190 en staging: informe PDF de 33 páginas y portada" });
    const T = tocaDe([agente({ id: "a", companyId: "c-bet", prefijo: "BET", nombre: "CEO", teNecesita: [e] })]);
    expect(T[0]?.deTarea).toBeUndefined();
    expect(frasesToca(T, { empresas: EMPRESAS }, ctx())[0]?.texto).toBe("Te espera una cosa: CEO de Betalandia te pregunta: ¿Cómo te fue con la prueba del informe PDF? Espera desde las 7:03.");
  });

  it("lo que viene del título de la tarea («revisar …», «aprobar el plan de …») no se repite con su tarea", () => {
    const r1 = espera({ itemId: "r1", tipo: "revision", identifier: "BET-1", titulo: "BET-1 · Commit", tituloTarea: "BET-1 · Commit" });
    const r2 = espera({ itemId: "r2", tipo: "revision", identifier: "BET-2", titulo: "BET-2 · Commit", tituloTarea: "BET-2 · Commit" });
    const T = tocaDe([agente({ id: "a", companyId: "c-bet", prefijo: "BET", nombre: "QA", teNecesita: [r1, r2] })]);
    expect(T.map((x) => [x.pide, x.deTarea])).toEqual([
      ["revisar commit", undefined],
      ["revisar commit", undefined],
    ]);
  });

  it("si no es pregunta («responder …»), la tarea va después de una coma, también en el cierre", () => {
    const e = espera({ itemId: "x", identifier: "BET-9", titulo: "BET-9 · Commit + PR", tituloTarea: "Avisos de una copia" });
    const T = tocaDe([agente({ id: "a", companyId: "c-bet", prefijo: "BET", nombre: "Líder Técnico", teNecesita: [e] })]);
    expect(T[0]).toMatchObject({ pide: "responder commit y PR", pregunta: false, deTarea: "Avisos de una copia" });
    expect(frasesToca(T, { empresas: EMPRESAS }, ctx())[0]?.texto).toBe("Te espera una cosa: Líder técnico de Betalandia te pide responder commit y PR, de «Avisos de una copia»; espera desde las 7:03.");
    expect(fraseCierre(T, { empresas: EMPRESAS }, ctx()).texto).toBe("Eso es todo. Lo primero: responder commit y PR, de «Avisos de una copia».");
  });

  it("2 tarjetas de la misma tarea que dicen lo mismo no llevan su título (no las distingue)", () => {
    const a = espera({ itemId: "a", issueId: "bet-15", identifier: "BET-15", titulo: "BET-15 · ¿Apruebas commit + PR?", tituloTarea: "Error al exportar CSV vacío", desde: iso(AHORA - 2 * H) });
    const b = { ...a, itemId: "b", desde: iso(AHORA - H) };
    const T = tocaDe([agente({ id: "a", companyId: "c-bet", prefijo: "BET", nombre: "Líder Técnico", teNecesita: [a, b] })]);
    // Las 2 nombraban su tarea por el código y no comparten palabras con ella: van con la tarea por eso, no por repetirse.
    expect(T.map((x) => x.deTarea)).toEqual(["Error al exportar CSV vacío", "Error al exportar CSV vacío"]);
    const c = espera({ itemId: "c", issueId: "bet-16", identifier: "BET-16", titulo: "¿Publico el comentario en Jira?", tituloTarea: "Arreglar el comentario de Jira", desde: iso(AHORA - 2 * H) });
    const T2 = tocaDe([agente({ id: "a", companyId: "c-bet", prefijo: "BET", nombre: "Líder Técnico", teNecesita: [c, { ...c, itemId: "d" }] })]);
    expect(T2.map((x) => x.deTarea)).toEqual([undefined, undefined]);
  });

  it("si con la tarea no cabe en una frase (240 letras), la tarea va más corta o no va", () => {
    const largo: Toca = {
      prefijo: "BET",
      agenteId: "a",
      agente: "Ingeniero Full-stack de Plugins y Algo Más",
      pide: "¿Apruebas commit y PR del arreglo de las notificaciones diarias del portal de usuarios?",
      pregunta: true,
      tid: "BET-1",
      desde: AHORA - 26 * H,
      deTarea: "Notificaciones de las copias diarias también en la sección de notificaciones del portal",
    };
    const [primera, segunda] = frasesToca([largo, { ...largo, tid: "BET-2" }], { empresas: EMPRESAS }, ctx()).map((f) => f.texto);
    for (const t of [primera!, segunda!]) {
      expect([...t].length, t).toBeLessThanOrEqual(LETRAS_FRASE_RESUMEN);
      expect(problemasFraseResumen(t), t).toEqual([]);
    }
    // En la primera no cabe ni «Notificaciones»; en la segunda va cortada en un límite natural.
    expect(primera).toBe("Te esperan 2 cosas. La más antigua: Ingeniero Full-stack de Plugins y Algo Más de Betalandia te pregunta: ¿Apruebas commit y PR del arreglo de las notificaciones diarias del portal de usuarios? Espera desde ayer a las 6:03.");
    expect(segunda).toBe("Después, Ingeniero Full-stack de Plugins y Algo Más de Betalandia te pregunta: ¿Apruebas commit y PR del arreglo de las notificaciones diarias del portal de usuarios? Es de «Notificaciones de las copias diarias también». Desde hace un día.");
  });
});
