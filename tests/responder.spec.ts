import { describe, expect, it } from "vitest";
import {
  aTuNombre,
  borradorInicial,
  chipDe,
  claseDe,
  contenidoDe,
  elegir,
  falta,
  limpiarRiesgo,
  marcarCasilla,
  marcarTarea,
  motivoFuera,
  partesNegrita,
  peticion,
  respondidaEn,
  respuestaGuardada,
  resultadoDe,
  seResponde,
  vigencia,
  type Detalle,
} from "../src/responder.js";
import type { Aprobacion, Interaccion } from "../src/shared.js";

// Payloads como los de la prueba técnica (JST-94, `spike/copia_jst94.py`).
const tarjeta = (kind: string, payload: Record<string, unknown>, extra: Partial<Interaccion> = {}): Detalle => ({
  de: "interaccion",
  i: { id: "int-1", companyId: "c1", issueId: "iss-1", kind, status: "pending", title: null, summary: null, payload, result: null, createdAt: "2026-10-21T14:00:00Z", ...extra },
});
const aprobacion = (extra: Partial<Aprobacion> = {}): Detalle => ({
  de: "aprobacion",
  a: {
    id: "apr-1",
    companyId: "c1",
    type: "request_board_approval",
    status: "pending",
    payload: { title: "Publicar el plan de contenidos", summary: "12 publicaciones en **noviembre**.", recommendedAction: "Apruébalo", risks: ["- Riesgo uno de prueba", "Riesgo dos: cambia algo"] },
    createdAt: "2026-10-21T14:00:00Z",
    ...extra,
  },
});
const espera = { titulo: "Del feed" };

const PREGUNTAS = {
  version: 1,
  title: "Merge a main de la Fase 0",
  submitLabel: "Enviar respuestas",
  questions: [
    { id: "q1", prompt: "¿Hago el merge ahora?", selectionMode: "single", required: true, options: [{ id: "a", label: "Sí, ahora", description: "El QA pasó." }, { id: "b", label: "Después" }] },
    { id: "q2", prompt: "¿Qué pongo en las notas?", selectionMode: "multi", options: [{ id: "x", label: "Textos" }, { id: "otra", label: "Otra cosa", freeText: true }] },
  ],
};
const CONFIRMAR = { version: 1, prompt: "¿Apruebas el plan?", acceptLabel: "Aprobar plan", rejectLabel: "Pedir cambios", detailsMarkdown: "Está en el documento **plan**." };
const CASILLAS = {
  version: 1,
  prompt: "¿En qué empresas instalo?",
  options: [{ id: "uno", label: "Betalandia" }, { id: "dos", label: "El Mirador" }, { id: "tres", label: "JSTM", description: "Aquí primero" }],
  defaultSelectedOptionIds: ["uno", "tres", "nada"],
  minSelected: 1,
  maxSelected: 2,
  acceptLabel: "Instalar en las marcadas",
  rejectLabel: "Ahora no",
};
const TAREAS = {
  version: 1,
  tasks: [
    { clientKey: "t1", title: "Madre", assigneeAgentId: "ag-1" },
    { clientKey: "t2", title: "Hija", parentClientKey: "t1" },
    { clientKey: "t3", title: "Nieta", parentClientKey: "t2", assigneeUserId: "u1" },
    { clientKey: "t4", title: "Suelta" },
  ],
};

describe("qué se responde en la Oficina (§5, JST-94)", () => {
  it("las 4 clases de tarjeta y la aprobación del board; lo demás, en Paperclip", () => {
    expect(claseDe({ tipo: "tarjeta", clase: "ask_user_questions" })).toBe("preguntas");
    expect(claseDe({ tipo: "tarjeta", clase: "request_confirmation" })).toBe("confirmacion");
    expect(claseDe({ tipo: "tarjeta", clase: "request_checkbox_confirmation" })).toBe("casillas");
    expect(claseDe({ tipo: "tarjeta", clase: "suggest_tasks" })).toBe("tareas");
    expect(claseDe({ tipo: "aprobacion", clase: "request_board_approval" })).toBe("aprobacion");
    expect(claseDe({ tipo: "tarjeta", clase: "request_item_verdicts" })).toBe("fuera");
    expect(claseDe({ tipo: "aprobacion", clase: "hire_agent" })).toBe("fuera");
    expect(claseDe({ tipo: "revision", clase: null })).toBe("fuera");
    expect(seResponde({ tipo: "decision", clase: null })).toBe(false);
  });

  it("chips y motivos", () => {
    expect(chipDe({ tipo: "tarjeta", clase: "suggest_tasks" })).toEqual({ label: "Tareas sugeridas", icono: "list-plus", fuera: false });
    expect(chipDe({ tipo: "revision", clase: null })).toMatchObject({ label: "Revisión", fuera: true });
    expect(motivoFuera({ tipo: "revision" })).toMatch(/diff/);
    expect(motivoFuera({ tipo: "decision" })).toBe("Esto se responde en la tarea.");
    expect(motivoFuera({ tipo: "aprobacion" })).toBe("Esto se responde en la tarea.");
  });
});

describe("contenido de cada clase", () => {
  it("preguntas: título, preguntas de una o varias, texto libre y el botón de la tarjeta", () => {
    const c = contenidoDe("preguntas", tarjeta("ask_user_questions", PREGUNTAS), espera);
    expect(c.titulo).toBe("Merge a main de la Fase 0");
    expect(c.submit).toBe("Enviar respuestas");
    expect(c.preguntas.map((q) => [q.id, q.multiple, q.requerida])).toEqual([
      ["q1", false, true],
      ["q2", true, false],
    ]);
    expect(c.preguntas[1]!.opciones[1]!.libre).toBe(true);
  });

  it("confirmación: el prompt es la pregunta, con sus botones y el motivo opcional", () => {
    const c = contenidoDe("confirmacion", tarjeta("request_confirmation", CONFIRMAR), espera);
    expect(c).toMatchObject({ titulo: "¿Apruebas el plan?", aceptar: "Aprobar plan", rechazar: "Pedir cambios", motivoObligatorio: false, conMotivo: true, etiquetaMotivo: "¿Por qué?" });
    expect(c.detalle).toBe("Está en el documento **plan**.");
    const obligatorio = contenidoDe("confirmacion", tarjeta("request_confirmation", { ...CONFIRMAR, rejectRequiresReason: true }), espera);
    expect(obligatorio.motivoObligatorio).toBe(true);
    const directo = contenidoDe("confirmacion", tarjeta("request_confirmation", { prompt: "¿Sigo?", allowDeclineReason: false }), espera);
    expect(directo).toMatchObject({ conMotivo: false, aceptar: "Aceptar", rechazar: "Rechazar" });
  });

  it("casillas: las marcadas por omisión que existen, mínimo y máximo", () => {
    const c = contenidoDe("casillas", tarjeta("request_checkbox_confirmation", CASILLAS), espera);
    expect(c.marcadasPorOmision).toEqual(["uno", "tres"]);
    expect([c.minimo, c.maximo, c.aceptar, c.rechazar, c.etiquetaMotivo]).toEqual([1, 2, "Instalar en las marcadas", "Ahora no", "¿Por qué no?"]);
  });

  it("tareas sugeridas: todas marcadas, con su madre y su responsable", () => {
    const c = contenidoDe("tareas", tarjeta("suggest_tasks", TAREAS, { title: "Tareas para la 0.3", summary: "Te propongo 4" }), espera);
    expect(c.titulo).toBe("Tareas para la 0.3");
    expect(c.detalle).toBe("Te propongo 4");
    expect(c.marcadasPorOmision).toEqual(["t1", "t2", "t3", "t4"]);
    expect(c.tareas[2]).toEqual({ clave: "t3", madre: "t2", titulo: "Nieta", agenteId: null, usuarioId: "u1" });
    expect([c.aceptar, c.rechazar]).toEqual(["Crear las marcadas", "No, gracias"]);
  });

  it("aprobación: resumen, riesgos sin la viñeta y lo que recomienda", () => {
    const c = contenidoDe("aprobacion", aprobacion(), espera);
    expect(c.titulo).toBe("Publicar el plan de contenidos");
    expect(c.riesgos).toEqual(["Riesgo uno de prueba", "Riesgo dos: cambia algo"]);
    expect(c.recomienda).toBe("Apruébalo");
    expect(limpiarRiesgo("• tres")).toBe("tres");
  });

  it("sin título propio usa el del feed", () => {
    expect(contenidoDe("confirmacion", tarjeta("request_confirmation", {}), espera).titulo).toBe("Del feed");
  });
});

describe("vigencia: antes de enviar se revisa que siga pendiente", () => {
  it("tarjetas", () => {
    expect(vigencia(tarjeta("ask_user_questions", PREGUNTAS))).toBe("pendiente");
    expect(vigencia(tarjeta("ask_user_questions", PREGUNTAS, { status: "answered", result: { answers: [] } }))).toBe("respondida");
    expect(vigencia(tarjeta("request_confirmation", CONFIRMAR, { status: "accepted", result: { outcome: "accepted" } }))).toBe("respondida");
    expect(vigencia(tarjeta("request_confirmation", CONFIRMAR, { status: "rejected", result: { outcome: "rejected" } }))).toBe("respondida");
    expect(vigencia(tarjeta("request_confirmation", CONFIRMAR, { status: "expired", result: { outcome: "superseded_by_comment" } }))).toBe("vencida");
    expect(vigencia(tarjeta("request_confirmation", CONFIRMAR, { status: "rejected", result: { outcome: "superseded_by_newer_request" } }))).toBe("vencida");
    expect(vigencia(tarjeta("ask_user_questions", PREGUNTAS, { status: "cancelled" }))).toBe("vencida");
  });

  it("aprobaciones", () => {
    expect(vigencia(aprobacion())).toBe("pendiente");
    expect(vigencia(aprobacion({ status: "approved" }))).toBe("respondida");
    expect(vigencia(aprobacion({ status: "revision_requested" }))).toBe("respondida");
    expect(vigencia(aprobacion({ status: "cancelled" }))).toBe("vencida");
    expect(respondidaEn(aprobacion({ status: "approved", decidedAt: "2026-10-21T14:05:00Z" }))).toBe("2026-10-21T14:05:00Z");
    expect(respondidaEn(tarjeta("x", {}, { resolvedAt: "2026-10-21T14:06:00Z" }))).toBe("2026-10-21T14:06:00Z");
  });
});

describe("lo escrito y lo marcado", () => {
  const c = contenidoDe("preguntas", tarjeta("ask_user_questions", PREGUNTAS), espera);
  const [q1, q2] = c.preguntas as [(typeof c.preguntas)[0], (typeof c.preguntas)[0]];

  it("una pregunta de una opción reemplaza; una de varias alterna", () => {
    let b = borradorInicial(c);
    b = elegir(b, q1, "a");
    b = elegir(b, q1, "b");
    expect(b.elegidas.q1).toEqual(["b"]);
    b = elegir(elegir(elegir(b, q2, "x"), q2, "otra"), q2, "x");
    expect(b.elegidas.q2).toEqual(["otra"]);
  });

  it("casillas: no pasa del máximo", () => {
    const cc = contenidoDe("casillas", tarjeta("request_checkbox_confirmation", CASILLAS), espera);
    let b = borradorInicial(cc);
    expect(b.marcadas).toEqual(["uno", "tres"]);
    b = marcarCasilla(b, cc, "dos");
    expect(b.marcadas).toEqual(["uno", "tres"]);
    b = marcarCasilla(marcarCasilla(b, cc, "uno"), cc, "dos");
    expect(b.marcadas).toEqual(["tres", "dos"]);
  });

  it("tareas: marcar una hija marca su madre (y abuela); desmarcar la madre desmarca sus hijas", () => {
    const ct = contenidoDe("tareas", tarjeta("suggest_tasks", TAREAS), espera);
    let b = { ...borradorInicial(ct), marcadas: [] as string[] };
    b = marcarTarea(b, ct, "t3");
    expect(b.marcadas).toEqual(["t1", "t2", "t3"]);
    b = marcarTarea(b, ct, "t1");
    expect(b.marcadas).toEqual([]);
    b = marcarTarea(marcarTarea(b, ct, "t4"), ct, "t2");
    expect(b.marcadas).toEqual(["t1", "t2", "t4"]);
  });
});

describe("falta algo antes de enviar", () => {
  const cp = contenidoDe("preguntas", tarjeta("ask_user_questions", PREGUNTAS), espera);
  it("preguntas: una opción en cada pregunta con `required`; sin él es opcional, como en Paperclip (JST-120)", () => {
    expect(falta(cp, borradorInicial(cp), "enviar")).toBe("Falta elegir una opción en cada pregunta.");
    const b = elegir(borradorInicial(cp), cp.preguntas[0]!, "a");
    expect(falta(cp, b, "enviar")).toBeNull();
    const ambas = { ...PREGUNTAS, questions: PREGUNTAS.questions.map((q) => ({ ...q, required: true })) };
    const cr = contenidoDe("preguntas", tarjeta("ask_user_questions", ambas), espera);
    expect(falta(cr, b, "enviar")).toBe("Falta elegir una opción en cada pregunta.");
    expect(falta(cr, elegir(b, cr.preguntas[1]!, "x"), "enviar")).toBeNull();
  });
  it("rechazo con motivo obligatorio y pedir cambios", () => {
    const cc = contenidoDe("confirmacion", tarjeta("request_confirmation", { ...CONFIRMAR, rejectRequiresReason: true }), espera);
    expect(falta(cc, borradorInicial(cc), "rechazar")).toBe("Escribe el motivo para que sepa qué cambiar.");
    expect(falta(cc, { ...borradorInicial(cc), motivo: "  porque sí " }, "rechazar")).toBeNull();
    expect(falta(cc, borradorInicial(cc), "aceptar")).toBeNull();
    const ca = contenidoDe("aprobacion", aprobacion(), espera);
    expect(falta(ca, borradorInicial(ca), "cambios")).toBe("Escribe el motivo para que sepa qué cambiar.");
    expect(falta(ca, borradorInicial(ca), "rechazar")).toBeNull();
  });
  it("casillas bajo el mínimo y tareas sin ninguna", () => {
    const cc = contenidoDe("casillas", tarjeta("request_checkbox_confirmation", CASILLAS), espera);
    expect(falta(cc, { ...borradorInicial(cc), marcadas: [] }, "aceptar")).toBe("Marca al menos 1.");
    const ct = contenidoDe("tareas", tarjeta("suggest_tasks", TAREAS), espera);
    expect(falta(ct, { ...borradorInicial(ct), marcadas: [] }, "aceptar")).toBe("Marca al menos una tarea.");
  });
});

describe("el POST de cada caso (JST-94)", () => {
  it("preguntas: /respond con las respuestas y el texto libre solo si se eligió esa opción", () => {
    const d = tarjeta("ask_user_questions", PREGUNTAS);
    const c = contenidoDe("preguntas", d, espera);
    let b = elegir(elegir(elegir(borradorInicial(c), c.preguntas[0]!, "a"), c.preguntas[1]!, "x"), c.preguntas[1]!, "otra");
    b = { ...b, libres: { q2: " texto libre ", q1: "no va" } };
    expect(peticion(c, d, b, "enviar")).toEqual({
      path: "/issues/iss-1/interactions/int-1/respond",
      cuerpo: { answers: [{ questionId: "q1", optionIds: ["a"] }, { questionId: "q2", optionIds: ["x", "otra"], otherText: "texto libre" }] },
    });
    // La opcional sin elegir no va (JST-120).
    expect(peticion(c, d, elegir(borradorInicial(c), c.preguntas[0]!, "a"), "enviar").cuerpo).toEqual({ answers: [{ questionId: "q1", optionIds: ["a"] }] });
  });

  it("confirmación: /accept {} y /reject {reason}", () => {
    const d = tarjeta("request_confirmation", CONFIRMAR);
    const c = contenidoDe("confirmacion", d, espera);
    expect(peticion(c, d, borradorInicial(c), "aceptar")).toEqual({ path: "/issues/iss-1/interactions/int-1/accept", cuerpo: {} });
    expect(peticion(c, d, { ...borradorInicial(c), motivo: " No así " }, "rechazar")).toEqual({ path: "/issues/iss-1/interactions/int-1/reject", cuerpo: { reason: "No así" } });
    expect(peticion(c, d, borradorInicial(c), "rechazar").cuerpo).toEqual({});
  });

  it("casillas y tareas: /accept con lo marcado", () => {
    const dc = tarjeta("request_checkbox_confirmation", CASILLAS);
    const cc = contenidoDe("casillas", dc, espera);
    expect(peticion(cc, dc, borradorInicial(cc), "aceptar").cuerpo).toEqual({ selectedOptionIds: ["uno", "tres"] });
    const dt = tarjeta("suggest_tasks", TAREAS);
    const ct = contenidoDe("tareas", dt, espera);
    expect(peticion(ct, dt, { ...borradorInicial(ct), marcadas: ["t1", "t4"] }, "aceptar")).toEqual({ path: "/issues/iss-1/interactions/int-1/accept", cuerpo: { selectedClientKeys: ["t1", "t4"] } });
  });

  it("aprobación: approve, reject y request-revision con la nota", () => {
    const d = aprobacion();
    const c = contenidoDe("aprobacion", d, espera);
    const b = borradorInicial(c);
    expect(peticion(c, d, b, "aprobar")).toEqual({ path: "/approvals/apr-1/approve", cuerpo: {} });
    expect(peticion(c, d, { ...b, motivo: "no" }, "rechazar")).toEqual({ path: "/approvals/apr-1/reject", cuerpo: { decisionNote: "no" } });
    expect(peticion(c, d, { ...b, motivo: "otra fecha" }, "cambios")).toEqual({ path: "/approvals/apr-1/request-revision", cuerpo: { decisionNote: "otra fecha" } });
  });
});

describe("cómo terminó el envío", () => {
  const r = (status: number, code: string | null = null, mensaje: string | null = null) => resultadoDe({ status, code, mensaje, body: null });
  it("200, 409, 404, 422, sin conexión y 5xx", () => {
    expect(r(200)).toEqual({ tipo: "ok" });
    expect(r(409, "interaction_already_resolved")).toEqual({ tipo: "revisar" });
    expect(r(409, "interaction_issue_closed")).toEqual({ tipo: "vencida" });
    expect(r(404)).toEqual({ tipo: "vencida" });
    expect(r(422, null, "Question q1 only allows one answer")).toEqual({ tipo: "invalido", mensaje: "Question q1 only allows one answer" });
    expect(r(403, null, "Board access required")).toEqual({ tipo: "invalido", mensaje: "Board access required" });
    expect(r(0).tipo).toBe("fallo");
    expect(r(503)).toEqual({ tipo: "fallo", mensaje: "Paperclip respondió con un error (503)." });
  });
});

describe("respuesta guardada («Ya está respondida»)", () => {
  it("preguntas: pregunta → respuesta, con el texto libre", () => {
    const d = tarjeta("ask_user_questions", PREGUNTAS, {
      status: "answered",
      result: { version: 1, answers: [{ questionId: "q1", optionIds: ["a"] }, { questionId: "q2", optionIds: ["x", "otra"], otherText: "texto libre" }] },
    });
    const c = contenidoDe("preguntas", d, espera);
    expect(respuestaGuardada(c, d)).toBe("¿Hago el merge ahora? → Sí, ahora · ¿Qué pongo en las notas? → Textos, Otra cosa: texto libre");
  });
  it("confirmación, casillas, tareas y aprobación", () => {
    const dc = tarjeta("request_confirmation", CONFIRMAR, { status: "accepted", result: { outcome: "accepted" } });
    expect(respuestaGuardada(contenidoDe("confirmacion", dc, espera), dc)).toBe("Aprobar plan");
    const dr = tarjeta("request_confirmation", CONFIRMAR, { status: "rejected", result: { outcome: "rejected", reason: "falta el costo" } });
    expect(respuestaGuardada(contenidoDe("confirmacion", dr, espera), dr)).toBe("Pedir cambios: falta el costo");
    const dk = tarjeta("request_checkbox_confirmation", CASILLAS, { status: "accepted", result: { outcome: "accepted", selectedOptionIds: ["uno", "dos"] } });
    expect(respuestaGuardada(contenidoDe("casillas", dk, espera), dk)).toBe("Instalar en las marcadas: Betalandia, El Mirador");
    const dt = tarjeta("suggest_tasks", TAREAS, { status: "accepted", result: { createdTasks: [{ clientKey: "t1" }, { clientKey: "t4" }] } });
    expect(respuestaGuardada(contenidoDe("tareas", dt, espera), dt)).toBe("Se crearon 2 tareas");
    expect(respuestaGuardada(null, aprobacion({ status: "approved", decisionNote: "dale" }))).toBe("Aprobada: dale");
    expect(respuestaGuardada(null, aprobacion({ status: "revision_requested" }))).toBe("Pidió cambios");
  });
});

describe("textos", () => {
  it("a tu nombre y negrita", () => {
    expect(aTuNombre({ identifier: "BET-268" })).toBe("Queda a tu nombre en BET-268");
    expect(aTuNombre({ identifier: null })).toBe("Queda a tu nombre");
    expect(partesNegrita("El detalle está en **plan** de BET-268")).toEqual([
      { b: false, t: "El detalle está en " },
      { b: true, t: "plan" },
      { b: false, t: " de BET-268" },
    ]);
  });
});
