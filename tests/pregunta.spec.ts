// «Te necesito» con la pregunta y «terminé» que no es terminé (0.8.0, JST-241).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cadenaDetalle, ColaVoces, MUESTRA_PREGUNTA, pideDe, PIDE_MUESTRA, rolesDeEmpresa, textoVoz, type PideVoz } from "../src/avisos.js";
import { esperasPorAgente, type Espera } from "../src/estado.js";
import { analizarPregunta, preguntaParaVoz, sinPreguntasCitadas } from "../src/paraVoz.js";
import { ESPERA_PREGUNTA_MS, ESPERA_REVISION_MS, FinEnRevision, PreguntaEnEspera, type AgenteEsperas } from "../src/pregunta.js";
import { pideDeEspera } from "../src/resumen/datos.js";
import type { ItemAtencion } from "../src/shared.js";
import { textoPedido, validarPedido } from "../src/vozViva.js";

const espera = (extra: Partial<Espera> = {}): Espera => ({
  tipo: "tarjeta",
  itemId: "i1",
  sujetoId: "s1",
  clase: "request_confirmation",
  issueId: "t1",
  identifier: "JST-229",
  titulo: "Qué IA escribe las conversaciones de la Oficina",
  tituloTarea: "«Oficina global»: que una IA barata escriba las conversaciones y las frases (elegir cuál)",
  href: null,
  desde: "2026-10-23T10:00:00Z",
  pregunta: "¿Qué IA escribe las conversaciones del descanso, las frases sueltas y lo que dicen las mascotas?",
  plan: false,
  ...extra,
});

describe("«te necesito» dice lo que espera (pideDe y textoVoz)", () => {
  const cos = (pide: PideVoz | null, p: "nombre-empresa" | "nombre" | "frase" = "nombre-empresa") => textoVoz("Chief of staff", "JSTM", "toca", p, { pide, tarea: "Algo" });

  it("una tarjeta: la pregunta breve, con «¿…?», en las 3 presentaciones", () => {
    const pide = pideDe([espera()]);
    expect(pide).toEqual({ tipo: "pregunta", texto: "Qué IA escribe las conversaciones de la Oficina", mas: 0 });
    expect(cos(pide)).toBe("Chief of staff, de JSTM: te necesito. ¿Qué IA escribe las conversaciones de la Oficina?");
    expect(cos(pide, "nombre")).toBe("Chief of staff: te necesito. ¿Qué IA escribe las conversaciones de la Oficina?");
    expect(cos(pide, "frase")).toBe("Te necesito. ¿Qué IA escribe las conversaciones de la Oficina?");
  });

  it("si el título trae la pregunta, esa; si no, la del feed si se entiende sola; si no, el título", () => {
    // MIG-97: el título ya es la pregunta.
    expect(pideDe([espera({ titulo: "¿Reinicio el motor de Docker? (Betalandia se cae ~1 min)", pregunta: "Docker está colgado desde las 09:47 y nadie lo puede usar, tampoco Betalandia. ¿Lo reinicio?" })])!.texto).toBe(
      "¿Reinicio el motor de Docker? (Betalandia se cae ~1 min)",
    );
    // ELM-4: el título es un tema y la pregunta del feed cabe entera.
    const elm = pideDe([espera({ titulo: "Aprobar el sprint 4 (26 oct al 1 nov)", pregunta: "¿Apruebas el sprint 4 para publicarlo desde el lunes 26?" })]);
    expect(textoVoz("CMO", "El Mirador", "toca", "nombre-empresa", { pide: elm })).toBe("CMO, de El Mirador: te necesito. ¿Apruebas el sprint 4 para publicarlo desde el lunes 26?");
    // BET-322: la pregunta entera cabe (sin su «D-1:»).
    const bet = pideDe([espera({ titulo: "Alta de usuarios: 2 decisiones antes de implementar", pregunta: "D-1: si el nombre llega al servidor con espacios al principio o al final, ¿qué hacemos?" })]);
    expect(textoVoz("Líder técnico", "Betalandia", "toca", "nombre-empresa", { pide: bet })).toBe("Líder técnico, de Betalandia: te necesito. Si el nombre llega al servidor con espacios al principio o al final, ¿qué hacemos?");
    // BET-268: «¿Cómo seguimos?» no se entiende sola: el título dice más.
    const seg = pideDe([espera({ titulo: "Seguimiento de la auditoría de accesos (BET-267)", pregunta: "¿Cómo seguimos?" })]);
    expect(textoVoz("Líder técnico", "Betalandia", "toca", "nombre-empresa", { pide: seg })).toBe("Líder técnico, de Betalandia: te necesito. Seguimiento de la auditoría de accesos.");
    // BET-11: desde el «¿», «¿Se ve el botón?» tampoco.
    const boton = pideDe([espera({ titulo: "056 · Interruptor del botón «Iniciar con Google o Apple»", pregunta: "Si el parámetro no existe, por ejemplo el día del deploy en producción y en desarrollo, ¿se ve el botón?" })]);
    expect(boton!.texto).toBe("056 · Interruptor del botón «Iniciar con Google o Apple»");
    // MIG-112: la pregunta empieza más adentro y, desde el «¿», se entiende sola.
    const mig = pideDe([espera({ titulo: "Spec 039 · Altas por chat: 2 preguntas", pregunta: "Cuando subes la foto de un usuario nuevo, ¿quieres que el asistente te pregunte si se muestra tal cual en el Perfil?" })]);
    expect(textoVoz("Speckit", "Migo", "toca", "nombre-empresa", { pide: mig })).toBe("Speckit, de Migo: te necesito. ¿Quieres que el asistente te pregunte si se muestra tal cual en el Perfil?");
    // Sin título propio (el genérico del feed ya se cambió por la pregunta en `tituloDeItem`).
    const sin = pideDe([espera({ titulo: "¿Ya mergeaste el PR #2107 en develop? A las 02:48 UTC GitHub todavía lo mostraba abierto.", pregunta: "¿Ya mergeaste el PR #2107 en develop? A las 02:48 UTC GitHub todavía lo mostraba abierto." })]);
    expect(textoVoz("Integración y CI", "Betalandia", "toca", "frase", { pide: sin })).toBe("Te necesito. ¿Ya mergeaste el PR 2107 en develop?");
  });

  it("aprobación, plan y revisión dicen qué hace falta", () => {
    const aprobacion = pideDe([espera({ tipo: "aprobacion", clase: "request_board_approval", titulo: "Contratar un diseñador para Migo (BET-12)" })]);
    expect(cos(aprobacion)).toBe("Chief of staff, de JSTM: te necesito para aprobar: Contratar un diseñador para Migo.");
    // Una aprobación sin título propio (el feed pone su tipo en inglés): la tarea.
    const sinTitulo = pideDe([espera({ tipo: "aprobacion", clase: "hire_agent", titulo: "hire agent", tituloTarea: "Sumar un QA a Migo" })]);
    expect(cos(sinTitulo)).toBe("Chief of staff, de JSTM: te necesito para aprobar: Sumar un QA a Migo.");
    const plan = pideDe([espera({ plan: true, titulo: "Aprobar el plan: «Oficina global» 0.8.0", tituloTarea: "«Oficina global» 0.8.0: «terminé» dice qué terminó y «te necesito» dice la pregunta breve" })]);
    expect(cos(plan)).toBe("Chief of staff, de JSTM: te necesito para aprobar el plan de Oficina global 0.8.0: terminé dice qué terminó y te necesito dice la pregunta breve.");
    const revision = pideDe([espera({ tipo: "revision", clase: null, titulo: "Instalar en la real la 0.6.0 de «Oficina global» (la voz lee los globos) cuando pase su QA", tituloTarea: "Instalar en la real la 0.6.0 de «Oficina global» (la voz lee los globos) cuando pase su QA" })]);
    expect(cos(revision, "frase")).toBe("Te necesito para revisar: Instalar en la real la 0.6.0 de Oficina global cuando pase su QA.");
  });

  it("con 2 o más esperando: la más antigua y «Y 2 más.»; el nombre de la tarea, sin el rol de adelante", () => {
    const tres = [espera(), espera({ itemId: "i2" }), espera({ itemId: "i3" })];
    expect(cos(pideDe(tres))).toBe("Chief of staff, de JSTM: te necesito. ¿Qué IA escribe las conversaciones de la Oficina? Y 2 más.");
    const roles = rolesDeEmpresa([{ companyId: "mig", nombre: "Ingeniero", rol: "Ingeniero de implementación Migo", rolApi: "engineer" }], "mig");
    const revision = pideDe([espera({ tipo: "revision", tituloTarea: "KAN-188 · Ingeniero: el nombre y el correo en cada tarjeta de cuenta de «Esperan tu firma» (servidor y app)" })], roles);
    expect(textoVoz("Ingeniero", "Migo", "toca", "nombre", { pide: revision })).toBe("Ingeniero: te necesito para revisar: el nombre y el correo en cada tarjeta de cuenta de Esperan tu firma.");
  });

  it("si de lo que espera no queda nada, `null`: dice «te necesito» con la tarea, como antes", () => {
    expect(pideDe([])).toBeNull();
    expect(pideDe([espera({ titulo: "(JST-12)", pregunta: null })])).toBeNull();
    expect(textoVoz("QA", "JSTM", "toca", "nombre", { pide: null, tarea: "Respaldo semanal del Drive" })).toBe("QA: te necesito. Respaldo semanal del Drive.");
    // Un `pide` que no deja nada tampoco cambia la frase.
    expect(textoVoz("QA", "JSTM", "toca", "nombre", { pide: { tipo: "pregunta", texto: "🔊 ✓", mas: 0 } })).toBe("QA: te necesito.");
    // Solo «te necesito» lo dice.
    expect(textoVoz("QA", "JSTM", "fin", "nombre", { pide: PIDE_MUESTRA, tarea: "Respaldo semanal del Drive" })).toBe("QA: terminé. Respaldo semanal del Drive.");
  });

  it("la muestra de «▶ Probar» con «Te necesito» es la frase de siempre y, seguida, la pregunta fija (grabada al instalar)", () => {
    expect(MUESTRA_PREGUNTA).toBe("¿Instalo la versión nueva ahora?");
    expect(textoVoz("Diseño", "JSTM", "toca", "nombre-empresa", { pide: PIDE_MUESTRA })).toBe(`${textoVoz("Diseño", "JSTM", "toca", "nombre-empresa")} ${MUESTRA_PREGUNTA}`);
  });
});

describe("0.9.1 (JST-254): lo que va entre comillas no es la pregunta, y las tareas sugeridas sin título se eligen", () => {
  const lider = (pide: PideVoz | null) => textoVoz("Líder técnico", "Betalandia", "toca", "nombre-empresa", { pide, tarea: "Algo" });

  it("BET-508: «¿Es usuario invitado?» en el título es el nombre de una casilla; dice la pregunta de la tarjeta", () => {
    const pide = pideDe([espera({ clase: "ask_user_questions", titulo: "BET-508 · Casilla «¿Es usuario invitado?» sincronizada con el rol", pregunta: "P1 · Al quitar guest-user, ¿corrijo también la marca de invitado (IsGuest)?" })]);
    expect(lider(pide)).toBe("Líder técnico, de Betalandia: te necesito. Al quitar guest-user, ¿corrijo también la marca de invitado?");
    // Sin pregunta en el feed, el título, sin tomar la casilla como pregunta.
    expect(lider(pideDe([espera({ titulo: "BET-508 · Casilla «¿Es usuario invitado?» sincronizada con el rol", pregunta: null })]))).toBe(
      "Líder técnico, de Betalandia: te necesito. Casilla Es usuario invitado sincronizada con el rol.",
    );
    expect(analizarPregunta("Casilla «¿Es usuario invitado?» sincronizada con el rol")).toMatchObject({ pregunta: false });
  });

  it("BET-11: el «?» de una línea citada no corta la pregunta", () => {
    const q = "En el segundo paso con código por correo, ¿vio bajo «Verificar» la línea «¿No le llegó? Podrá reenviarlo en 0:45» con la cuenta regresiva?";
    expect(sinPreguntasCitadas(q)).toBe("En el segundo paso con código por correo, ¿vio bajo «Verificar» la línea «No le llegó podrá reenviarlo en 0:45» con la cuenta regresiva?");
    // Sin la entrada («En el segundo paso…,») cabe justo (16 palabras, 90 letras).
    expect(lider(pideDe([espera({ clase: "ask_user_questions", titulo: "BET-11: botón «Reenviar código»", pregunta: q })]))).toBe(
      "Líder técnico, de Betalandia: te necesito. ¿Vio bajo Verificar la línea No le llegó podrá reenviarlo en 0:45 con la cuenta regresiva?",
    );
    // Si no cabe, no se corta dentro de la cita.
    expect(preguntaParaVoz(q, { palabras: 12, letras: 70 })).not.toMatch(/llegó\?/);
  });

  it("una pregunta entera entre comillas sigue siendo la pregunta; las comillas sin «?» quedan igual", () => {
    expect(preguntaParaVoz("«¿Reinicio el motor de Docker?»")).toBe("¿Reinicio el motor de Docker?");
    expect(preguntaParaVoz("JST-9 · «¿Reinicio el motor de Docker?»")).toBe("¿Reinicio el motor de Docker?");
    expect(preguntaParaVoz("¿Qué significa \"mejorar Paperclip\" para ti?")).toBe("¿Qué significa mejorar Paperclip para ti?");
    expect(preguntaParaVoz("¿Apruebas «¿Seguimos?» como texto del botón?")).toBe("¿Apruebas Seguimos como texto del botón?");
    expect(sinPreguntasCitadas("056 · Interruptor del botón «Iniciar con Google o Apple»")).toBe("056 · Interruptor del botón «Iniciar con Google o Apple»");
  });

  const sugerencia = (title: string | null, firstTaskTitle: string | null = "Revisar los audios de la 0.8.0 en la real"): ItemAtencion => ({
    id: "interaction:sug1",
    sourceKind: "issue_thread_interaction",
    subject: { kind: "interaction", id: "sug1", title: title ?? "Suggested tasks need a decision", metadata: { kind: "suggest_tasks" } },
    relatedIssue: { kind: "issue", id: "t1", identifier: "JST-246", title: "Oficina global 0.9.0" },
    createdAt: "2026-10-25T05:00:00Z",
    detail: { kind: "suggested_tasks", firstTaskTitle },
  });
  const esperaDe = (item: ItemAtencion) => esperasPorAgente([item], []).sinAgente[0]!;

  it("tareas sugeridas sin título propio: «te necesito para elegir tareas: ‹la primera›», no como si esa fuera la pregunta", () => {
    const e = esperaDe(sugerencia(null));
    expect(e).toMatchObject({ titulo: "Revisar los audios de la 0.8.0 en la real", tareaSugerida: "Revisar los audios de la 0.8.0 en la real" });
    const pide = pideDe([e]);
    expect(pide).toEqual({ tipo: "elegir", texto: "Revisar los audios de la 0.8.0 en la real", mas: 0 });
    expect(textoVoz("Chief of staff", "JSTM", "toca", "nombre-empresa", { pide })).toBe("Chief of staff, de JSTM: te necesito para elegir tareas: Revisar los audios de la 0.8.0 en la real.");
    expect(textoVoz("Chief of staff", "JSTM", "toca", "frase", { pide: { ...pide!, mas: 2 } })).toBe("Te necesito para elegir tareas: Revisar los audios de la 0.8.0 en la real. Y 2 más.");
    expect(pideDeEspera(e, new Set()).pide).toBe("elegir tareas: revisar los audios de la 0.8.0 en la real");
    // El worker lo acepta y arma el mismo texto.
    const p = validarPedido({ agenteId: "cos", frase: "toca", corto: "Chief of staff", empresa: "JSTM", presentacion: "nombre-empresa", tarea: "Oficina global 0.9.0", pide });
    expect(p?.pide).toEqual(pide);
    expect(textoPedido(p!)).toBe("Chief of staff, de JSTM: te necesito para elegir tareas: Revisar los audios de la 0.8.0 en la real.");
  });

  it("con título propio, el título (como antes); sin ninguna tarea, lo de siempre", () => {
    const propia = esperaDe(sugerencia("¿Creo estas 2 tareas para la 0.9.0?"));
    expect(propia.tareaSugerida).toBeUndefined();
    expect(textoVoz("Chief of staff", "JSTM", "toca", "frase", { pide: pideDe([propia]) })).toBe("Te necesito. ¿Creo estas 2 tareas para la 0.9.0?");
    const vacia = esperaDe(sugerencia(null, null));
    expect(vacia.tareaSugerida).toBeUndefined();
    // Otra clase de tarjeta sin título propio no cambia.
    const otra = esperasPorAgente([{ ...sugerencia(null), subject: { kind: "interaction", id: "c1", title: "Confirmation requested", metadata: { kind: "request_confirmation" } }, detail: { kind: "confirmation", promptExcerpt: "¿Sigo con la Fase 2?" } }], []).sinAgente[0]!;
    expect(otra.tareaSugerida).toBeUndefined();
    expect(pideDe([otra])).toMatchObject({ tipo: "pregunta", texto: "¿Sigo con la Fase 2?" });
  });
});

describe("en la cola: primero el audio con la pregunta, después con la tarea, y el subtítulo dice la pregunta", () => {
  it("«te necesito» con la pregunta prueba 2 audios antes de la frase de siempre; las demás, 1", () => {
    const c = new ColaVoces();
    c.poner("toca", { id: "cos", corto: "Chief of staff", empresa: "JSTM" }, 0, { pide: pideDe([espera()]), tarea: "Respaldo semanal del Drive" });
    c.poner("fin", { id: "dis", corto: "Diseño", empresa: "JSTM" }, 0, { tarea: "Respaldo semanal del Drive" });
    expect(cadenaDetalle(c.sacar(0)!, "nombre-empresa")).toEqual({
      cadena: ["Chief of staff, de JSTM: te necesito. ¿Qué IA escribe las conversaciones de la Oficina?", "Chief of staff, de JSTM: te necesito. Respaldo semanal del Drive."],
      subtitulo: "Chief of staff, de JSTM: te necesito. ¿Qué IA escribe las conversaciones de la Oficina?",
    });
    expect(cadenaDetalle(c.sacar(0)!, "nombre-empresa")).toEqual({ cadena: ["Diseño, de JSTM: terminé. Respaldo semanal del Drive."], subtitulo: null });
  });

  it("sin tarea, solo la pregunta; sin nada, sin cadena (un resumen tampoco)", () => {
    const c = new ColaVoces();
    c.poner("toca", { id: "a", corto: "QA", empresa: "JSTM" }, 0, { pide: PIDE_MUESTRA, tarea: null });
    c.poner("toca", { id: "b", corto: "QA", empresa: "Migo" }, 0, { pide: null, tarea: null });
    expect(cadenaDetalle(c.sacar(0)!, "nombre")).toEqual({ cadena: ["QA: te necesito. ¿Instalo la versión nueva ahora?"], subtitulo: "QA: te necesito. ¿Instalo la versión nueva ahora?" });
    expect(cadenaDetalle(c.sacar(0)!, "nombre")).toBeNull();
    expect(cadenaDetalle({ frase: "toca", agentes: [{ id: "a", corto: "QA", empresa: "JSTM" }, { id: "b", corto: "QA", empresa: "Migo" }], creado: 0, detalle: { pide: PIDE_MUESTRA } }, "nombre")).toBeNull();
  });
});

type Ag = AgenteEsperas & { nombre: string };
const ag = (id: string, esperas: Array<[string, string | null]> = []): Ag => ({ id, nombre: id, teNecesita: esperas.map(([itemId, issueId]) => ({ itemId, issueId })) });

describe("«te necesito» espera el audio con la pregunta (PreguntaEnEspera)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function armar() {
    const pedidos: Array<{ id: string; listo: () => void }> = [];
    const dichos: Array<[string, string]> = [];
    const p = new PreguntaEnEspera<Ag, string>({
      esperar: (a) => new Promise<void>((ok) => pedidos.push({ id: a.id, listo: ok })),
      decir: (a, d) => dichos.push([a.id, d]),
    });
    return { p, pedidos, dichos };
  }

  it("pide el audio al subir la mano y lo dice apenas está", async () => {
    const { p, pedidos, dichos } = armar();
    p.subio(ag("cos", [["i1", "t1"]]), "i1", "¿Qué IA?");
    await vi.advanceTimersByTimeAsync(0);
    expect(pedidos.map((x) => x.id)).toEqual(["cos"]);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(dichos).toEqual([]);
    pedidos[0]!.listo();
    await vi.advanceTimersByTimeAsync(0);
    expect(dichos).toEqual([["cos", "¿Qué IA?"]]);
    expect(p.esperando).toBe(0);
  });

  it("como mucho 30 s: después lo dice igual (con la tarea si su audio está, o la frase de siempre)", async () => {
    const { p, dichos } = armar();
    p.subio(ag("cos", [["i1", "t1"]]), "i1", "¿Qué IA?");
    await vi.advanceTimersByTimeAsync(ESPERA_PREGUNTA_MS - 1);
    expect(dichos).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(dichos).toEqual([["cos", "¿Qué IA?"]]);
    expect(ESPERA_PREGUNTA_MS).toBe(30_000);
  });

  it("si respondiste mientras esperaba, no dice nada; si va a decir otra frase, sale antes; si falla el worker, al tiro", async () => {
    const { p, pedidos, dichos } = armar();
    p.subio(ag("a", [["i1", "t1"]]), "i1", "A");
    p.subio(ag("b", [["i2", "t2"]]), "i2", "B");
    p.revisar([ag("a", []), ag("b", [["i2", "t2"]])]);
    expect(p.esperando).toBe(1);
    // Uno que no está en la lista (su empresa no se pudo leer) sigue esperando.
    p.revisar([]);
    expect(p.esperando).toBe(1);
    p.soltar("b");
    expect(dichos).toEqual([["b", "B"]]);
    await vi.advanceTimersByTimeAsync(0);
    for (const x of pedidos) x.listo();
    await vi.advanceTimersByTimeAsync(ESPERA_PREGUNTA_MS);
    expect(dichos).toEqual([["b", "B"]]);
    const fallas: string[] = [];
    const q = new PreguntaEnEspera<Ag, string>({ esperar: async () => Promise.reject(new Error("502")), decir: (_a, d) => fallas.push(d) });
    q.subio(ag("c", [["i3", null]]), "i3", "C");
    await vi.advanceTimersByTimeAsync(0);
    expect(fallas).toEqual(["C"]);
  });
});

describe("una tarea que pasa a revisión con una pregunta para ti no dice «terminé» (FinEnRevision)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function armar() {
    const dichos: string[] = [];
    const r = new FinEnRevision<Ag>({ terminar: (a, issueId) => dichos.push(`terminé ${a.id} ${issueId}`), preguntar: (a, i) => dichos.push(`te necesito ${a.id} ${a.teNecesita[i]!.itemId}`) });
    return { r, dichos };
  }

  it("la tarjeta ya estaba: «te necesito» por esa espera, al tiro", () => {
    const { r, dichos } = armar();
    r.paso(ag("cos", [["otra", "t9"], ["i1", "t1"]]), "t1", "Oficina 0.8.0");
    expect(dichos).toEqual(["te necesito cos i1"]);
    expect(r.esperando).toBe(0);
  });

  it("la tarjeta llega unos segundos después: «te necesito» y nunca «terminé»", async () => {
    const { r, dichos } = armar();
    r.paso(ag("cos"), "t1", "Oficina 0.8.0");
    await vi.advanceTimersByTimeAsync(3_000);
    r.revisar([ag("cos", [["i1", "t1"]])]);
    await vi.advanceTimersByTimeAsync(ESPERA_REVISION_MS);
    expect(dichos).toEqual(["te necesito cos i1"]);
  });

  it("revisión de otro (sin nada para ti en esa tarea): «terminé» a los 8 s, una vez", async () => {
    const { r, dichos } = armar();
    r.paso(ag("qa", [["i1", "otra-tarea"]]), "t1", "QA de la 0.8.0");
    r.paso(ag("qa", [["i1", "otra-tarea"]]), "t1", "QA de la 0.8.0");
    r.revisar([ag("qa", [["i1", "otra-tarea"]])]);
    await vi.advanceTimersByTimeAsync(ESPERA_REVISION_MS - 1);
    expect(dichos).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(dichos).toEqual(["terminé qa t1"]);
    expect(ESPERA_REVISION_MS).toBe(8_000);
  });
});
