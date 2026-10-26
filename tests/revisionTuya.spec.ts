// JST-252: un agente pasa su tarea a tu revisión sin dejar una tarjeta (asignada
// a ti, o con una etapa de revisión tuya). El ítem `review` del feed llega sin
// agente (`assigneeAgentId: null`, sin `relatedIssue`): se une al agente que
// pasó la tarea a revisión, así sube su mano y la voz dice «te necesito para
// revisar», no «terminé».
import { afterEach, describe, expect, it, vi } from "vitest";
import { pideDe, textoVoz } from "../src/avisos.js";
import { agenteQuePasoARevision, armarEmpresa, esperasPorAgente, pasoARevision, revisionesSinAgente, type DatosEmpresa } from "../src/estado.js";
import { ESPERA_REVISION_MS, FinEnRevision } from "../src/pregunta.js";
import { Sincronizador } from "../src/sincronizador.js";
import type { AgenteApi, ItemAtencion } from "../src/shared.js";

const EMPRESA = { id: "c1", name: "JSTM", issuePrefix: "JST", status: "active" };
const SONDA = "a-sonda";
const USUARIO = "u-usuario";
const TAREA = "t-035747";
const TITULO = "Prueba QA242, revisión revision-usuario-sin-tarjeta 035747";

const agente = (id: string, name: string): AgenteApi => ({ id, companyId: "c1", name, status: "idle", adapterType: "claude_local" });
const AGENTES = [agente(SONDA, "Sonda QA168 Voz Lorenzo"), agente("a-cos", "Chief of staff")];

/** El ítem `review` tal como llega en la QA (attention.js de 2026.824.1): la tarea quedó del usuario. */
const revisionTuya = (extra: Partial<ItemAtencion> = {}): ItemAtencion => ({
  id: `review:review:${TAREA}`,
  sourceKind: "review",
  subject: { kind: "issue", id: TAREA, title: TITULO, identifier: "JST-999", status: "in_review", href: "/JST/issues/JST-999", metadata: { assigneeAgentId: null, assigneeUserId: USUARIO } },
  relatedIssue: null,
  createdAt: "2026-10-25T03:50:00.000Z",
  detail: { kind: "generic", summaryExcerpt: TITULO },
  ...extra,
});

/** Una tarjeta del mismo agente en la misma tarea. */
const tarjeta: ItemAtencion = {
  id: "issue_thread_interaction:x1",
  sourceKind: "issue_thread_interaction",
  subject: { kind: "interaction", id: "x1", title: "¿Se ve bien el globo?", metadata: { kind: "request_confirmation", createdByAgentId: SONDA } },
  relatedIssue: { kind: "issue", id: TAREA, identifier: "JST-999", title: TITULO, metadata: { assigneeAgentId: null } },
  createdAt: "2026-10-25T03:57:40.000Z",
};

/** El `issue.updated` del PATCH a `in_review` asignada al usuario (routes/issues.js: `...updateFields`, `changes`, `_previous`). */
const pasoDe = (actorType: string, agentId: string | null, extra: Record<string, unknown> = {}) => ({
  actorType,
  actorId: agentId ?? USUARIO,
  agentId,
  action: "issue.updated",
  entityType: "issue",
  entityId: TAREA,
  createdAt: "2026-10-25T03:57:47.000Z",
  details: {
    status: "in_review",
    assigneeAgentId: null,
    assigneeUserId: USUARIO,
    identifier: "JST-999",
    changes: { status: { from: "in_progress", to: "in_review" }, assigneeAgentId: { from: SONDA, to: null }, assigneeUserId: { from: null, to: USUARIO } },
    _previous: { status: "in_progress", assigneeAgentId: SONDA, assigneeUserId: null },
  },
  ...extra,
});

describe("quién pasó la tarea a revisión (pasoARevision, agenteQuePasoARevision)", () => {
  it("el PATCH del agente a in_review, asignada a ti o con tu etapa de revisión: la tarea y ese agente", () => {
    expect(pasoARevision(pasoDe("agent", SONDA))).toEqual({ issueId: TAREA, agenteId: SONDA });
    // Con la etapa de revisión del usuario, Paperclip pasa la tarea al participante: los mismos `changes`.
    const etapa = pasoDe("agent", SONDA, { details: { status: "in_review", changes: { status: { from: "in_progress", to: "in_review" }, assigneeAgentId: { from: SONDA, to: null } } } });
    expect(pasoARevision(etapa)).toEqual({ issueId: TAREA, agenteId: SONDA });
  });

  it("si la pasó el usuario, no es de ningún agente; otros cambios no cuentan", () => {
    expect(pasoARevision(pasoDe("user", null))).toEqual({ issueId: TAREA, agenteId: null });
    expect(pasoARevision(pasoDe("agent", SONDA, { details: { changes: { status: { from: "todo", to: "in_progress" } } } }))).toBeNull();
    expect(pasoARevision(pasoDe("agent", SONDA, { details: { changes: { title: { from: "a", to: "b" } }, status: "in_review" } }))).toBeNull();
    expect(pasoARevision(pasoDe("agent", SONDA, { action: "issue.comment_added" }))).toBeNull();
  });

  it("las líneas viejas sin `changes` (status y `_previous`) también sirven", () => {
    const vieja = pasoDe("agent", SONDA, { details: { status: "in_review", _previous: { status: "in_progress" } } });
    expect(pasoARevision(vieja)).toEqual({ issueId: TAREA, agenteId: SONDA });
    expect(pasoARevision(pasoDe("agent", SONDA, { details: { status: "in_review", _previous: { status: "in_review" } } }))).toBeNull();
  });

  it("de la actividad de la tarea, la última vez que pasó a revisión (en cualquier orden)", () => {
    const antes = pasoDe("agent", "a-cos", { createdAt: "2026-10-24T10:00:00.000Z" });
    const comentario = { action: "issue.comment_added", actorType: "agent", agentId: "a-cos", entityId: TAREA, createdAt: "2026-10-25T04:00:00.000Z" };
    expect(agenteQuePasoARevision([comentario, pasoDe("agent", SONDA), antes])).toBe(SONDA);
    expect(agenteQuePasoARevision([antes, pasoDe("agent", SONDA)])).toBe(SONDA);
    expect(agenteQuePasoARevision([comentario])).toBeNull();
  });
});

describe("la revisión tuya se une al agente que la pasó (esperasPorAgente)", () => {
  const entregas = new Map([[TAREA, SONDA]]);

  it("sin saber quién la pasó queda sin agente (lo de antes); sabiéndolo, es una revisión de ese agente", () => {
    expect(esperasPorAgente([revisionTuya()], AGENTES).sinAgente).toHaveLength(1);
    const { porAgente, sinAgente } = esperasPorAgente([revisionTuya()], AGENTES, new Map(), entregas);
    expect(sinAgente).toEqual([]);
    expect(porAgente.get(SONDA)).toMatchObject([{ tipo: "revision", issueId: TAREA, identifier: "JST-999", tituloTarea: TITULO }]);
  });

  it("si la pasó el usuario, o un agente que no está en la empresa, sigue sin agente", () => {
    expect(esperasPorAgente([revisionTuya()], AGENTES, new Map(), new Map([[TAREA, null]])).sinAgente).toHaveLength(1);
    expect(esperasPorAgente([revisionTuya()], AGENTES, new Map(), new Map([[TAREA, "a-otra-empresa"]])).sinAgente).toHaveLength(1);
  });

  it("con una tarjeta en la misma tarea, cuenta solo la tarjeta (la revisión no la tapa ni suma «y 1 más»)", () => {
    const { porAgente } = esperasPorAgente([revisionTuya(), tarjeta], AGENTES, new Map(), entregas);
    expect(porAgente.get(SONDA)?.map((e) => e.tipo)).toEqual(["tarjeta"]);
    expect(revisionesSinAgente([revisionTuya(), tarjeta], AGENTES, new Map())).toEqual([]);
  });

  it("una revisión que sigue del agente (detenida o con aprobación) se une como antes, sin leer nada", () => {
    const delAgente = revisionTuya({ subject: { kind: "issue", id: TAREA, title: TITULO, metadata: { assigneeAgentId: "a-cos" } } });
    expect(esperasPorAgente([delAgente], AGENTES, new Map(), entregas).porAgente.get("a-cos")).toHaveLength(1);
    expect(revisionesSinAgente([delAgente], AGENTES, new Map())).toEqual([]);
  });

  it("pide la actividad solo de las revisiones sin agente que todavía no se saben", () => {
    expect(revisionesSinAgente([revisionTuya(), revisionTuya()], AGENTES, new Map())).toEqual([TAREA]);
    expect(revisionesSinAgente([revisionTuya()], AGENTES, new Map([[TAREA, null]]))).toEqual([]);
    expect(revisionesSinAgente(null, AGENTES, new Map())).toEqual([]);
  });
});

describe("la voz: «te necesito para revisar», no «terminé» (FinEnRevision con la oficina armada)", () => {
  afterEach(() => vi.useRealTimers());

  it("el feed trae la revisión ~1 s después del evento: sube la mano y dice «te necesito para revisar: ‹tarea›»", async () => {
    vi.useFakeTimers();
    const dichos: string[] = [];
    const r = new FinEnRevision<ReturnType<typeof armarEmpresa>[number]>({
      terminar: (a) => dichos.push(textoVoz(a.nombre, "JSTM", "fin", "nombre-empresa", { tarea: TITULO })),
      preguntar: (a, i) => dichos.push(textoVoz(a.nombre, "JSTM", "toca", "nombre-empresa", { pide: pideDe([a.teNecesita[i]!]), tarea: TITULO })),
    });
    const datos = (atencion: ItemAtencion[]): DatosEmpresa => ({ empresa: EMPRESA, agentes: AGENTES, runs: [], atencion });
    const sonda = (atencion: ItemAtencion[], entregas = new Map<string, string | null>()) => armarEmpresa(datos(atencion), new Map(), entregas).find((a) => a.id === SONDA)!;

    // El evento llega antes que la relectura del feed: todavía no espera nada.
    r.paso(sonda([]), TAREA, TITULO);
    await vi.advanceTimersByTimeAsync(1_000);
    const conRevision = sonda([revisionTuya()], new Map([[TAREA, SONDA]]));
    expect(conRevision.teNecesita).toHaveLength(1);
    r.revisar([conRevision]);
    await vi.advanceTimersByTimeAsync(ESPERA_REVISION_MS);
    expect(dichos).toEqual(["Sonda QA168 Voz Lorenzo, de JSTM: te necesito para revisar: Prueba QA242, revisión revision-usuario-sin-tarjeta 035747."]);
  });

  it("antes de JST-252 (sin saber quién la pasó) decía «terminé» a los 8 s", async () => {
    vi.useFakeTimers();
    const dichos: string[] = [];
    const r = new FinEnRevision<ReturnType<typeof armarEmpresa>[number]>({ terminar: () => dichos.push("terminé"), preguntar: () => dichos.push("te necesito") });
    const sinUnir = armarEmpresa({ empresa: EMPRESA, agentes: AGENTES, runs: [], atencion: [revisionTuya()] }, new Map()).find((a) => a.id === SONDA)!;
    r.paso(sinUnir, TAREA, TITULO);
    r.revisar([sinUnir]);
    await vi.advanceTimersByTimeAsync(ESPERA_REVISION_MS);
    expect(dichos).toEqual(["terminé"]);
  });
});

describe("Sincronizador: quién pasó a revisión, del evento o de la actividad (JST-252)", () => {
  type SocketFalso = { onopen?: () => void; onmessage?: (m: { data: string }) => void; onclose?: () => void; close: () => void };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** API falsa de una empresa: `feed` es lo que devuelve «Te toca» en cada momento; `actividad`, la de la tarea. */
  function oficina(estado: { feed: ItemAtencion[]; actividad: unknown[] | number }) {
    const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
    const fetch = vi.fn(async (url: string) => {
      const ruta = url.replace(/^\/api/, "");
      if (ruta === "/companies") return json([EMPRESA]);
      if (ruta === "/companies/c1/agents") return json(AGENTES);
      if (ruta === "/companies/c1/live-runs") return json([]);
      if (ruta === "/companies/c1/attention") return json({ items: estado.feed });
      if (ruta === `/issues/${TAREA}/activity`) return typeof estado.actividad === "number" ? json({ error: "x" }, estado.actividad) : json(estado.actividad);
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetch);
    const sockets: SocketFalso[] = [];
    const crearSocket = () => {
      const s: SocketFalso = { close: () => undefined };
      sockets.push(s);
      queueMicrotask(() => s.onopen?.());
      return s as unknown as WebSocket;
    };
    const sync = new Sincronizador({ cx: { base: "", crearSocket }, respaldoMs: 600_000, sinCanalMs: 600_000 });
    const lecturasActividad = () => fetch.mock.calls.filter((c) => c[0] === `/api/issues/${TAREA}/activity`).length;
    const sonda = () => sync.agentes().find((a) => a.id === SONDA)!;
    const emitir = (payload: Record<string, unknown>) =>
      sockets[0]!.onmessage!({ data: JSON.stringify({ id: 9, companyId: "c1", type: "activity.logged", createdAt: new Date().toISOString(), payload }) });
    return { sync, sonda, emitir, lecturasActividad };
  }

  it("en vivo: el evento dice quién la pasó y la mano sube con la relectura del feed, sin leer la actividad", async () => {
    const estado = { feed: [] as ItemAtencion[], actividad: [] as unknown[] };
    const { sync, sonda, emitir, lecturasActividad } = oficina(estado);
    await sync.iniciar();
    await vi.waitFor(() => expect(sync.canalesAbiertos()).toBe(1));
    expect(sonda().teNecesita).toEqual([]);
    vi.useFakeTimers();
    // Paperclip guarda el cambio y después emite el evento: el feed ya trae la revisión.
    estado.feed = [revisionTuya()];
    emitir(pasoDe("agent", SONDA));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sonda().teNecesita).toMatchObject([{ tipo: "revision", issueId: TAREA }]);
    expect(lecturasActividad()).toBe(0);
    sync.detener();
  });

  it("al cargar la página con la revisión ya en el feed: lee la actividad de esa tarea una vez", async () => {
    const estado = { feed: [revisionTuya()], actividad: [pasoDe("agent", SONDA)] };
    const { sync, sonda, lecturasActividad } = oficina(estado);
    await sync.iniciar();
    expect(sonda().teNecesita).toMatchObject([{ tipo: "revision", issueId: TAREA }]);
    await sync.refrescarAtencion("c1");
    expect(lecturasActividad()).toBe(1);
    // Sale de revisión: se olvida; si vuelve, se lee otra vez.
    estado.feed = [];
    await sync.refrescarAtencion("c1");
    expect(sonda().teNecesita).toEqual([]);
    estado.feed = [revisionTuya()];
    estado.actividad = [pasoDe("user", null, { createdAt: "2026-10-25T05:00:00.000Z" }), pasoDe("agent", SONDA)];
    await sync.refrescarAtencion("c1");
    expect(lecturasActividad()).toBe(2);
    // Esta vez la pasó el usuario: no es de nadie.
    expect(sonda().teNecesita).toEqual([]);
    sync.detener();
  });

  it("si la actividad no se puede leer: sin permiso no se vuelve a pedir; una caída se reintenta con la lectura siguiente", async () => {
    const estado = { feed: [revisionTuya()], actividad: 500 as unknown[] | number };
    const { sync, sonda, lecturasActividad } = oficina(estado);
    await sync.iniciar();
    expect(sonda().teNecesita).toEqual([]);
    estado.actividad = 403;
    await sync.refrescarAtencion("c1");
    await sync.refrescarAtencion("c1");
    expect(lecturasActividad()).toBe(2);
    expect(sonda().teNecesita).toEqual([]);
    sync.detener();
  });
});
