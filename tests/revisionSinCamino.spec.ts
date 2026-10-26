// JST-266: en la real, «Integración y CI, de Betalandia: te necesito para
// revisar: …» se oía cada 15 a 25 min por BET-627. La tarea está `in_review`
// pero sigue del agente, que espera el CI con un monitor. Cuando el monitor
// vence, el feed trae unos 20 s una revisión «sin camino» (hasta que el
// planificador lo dispara) y la vigía la tomaba como una llegada nueva.
import { afterEach, describe, expect, it, vi } from "vitest";
import { esperaQueAvisa, pideDe, rolesDeEmpresa, textoVoz } from "../src/avisos.js";
import { armarEmpresa, cambioDeEstado, REVISION_SIN_CAMINO_MS, seguirSinCamino, sinCaminoDelAgente, type Espera } from "../src/estado.js";
import { sinRolDelante } from "../src/paraVoz.js";
import { Sincronizador } from "../src/sincronizador.js";
import type { AgenteApi, ItemAtencion } from "../src/shared.js";

const BET = { id: "00000000-0000-4000-8000-000000000001", name: "Betalandia", issuePrefix: "BET", status: "active" };
const CI = "00000000-0000-4000-8000-000000000002";
const TAREA = "00000000-0000-4000-8000-000000000003";
const TITULO = "BET-518 · Integración y CI — commit, tests y PR a develop con la casilla «¿Es usuario invitado?» + seguimiento del CI";

const agente = (id: string, name: string, title: string | null, role: string): AgenteApi => ({ id, companyId: BET.id, name, title, role, status: "idle", adapterType: "claude_local" });
/** Los agentes de Betalandia, con la forma de los de la real el 25-10. */
const AGENTES = [
  agente("a-rev", "Revisor de Codigo (Codex)", "Revisor de Código (Codex, GPT-6.1 Sol)", "engineer"),
  agente("a-be", "Ingeniero Backend Java / REST", "Backend Java / REST", "engineer"),
  agente(CI, "Ingeniero de Integracion y CI", "Integración y CI", "devops"),
  agente("a-qa", "QA & Automatizacion de Tests", "QA & Automatizacion", "qa"),
  agente("a-lt", "Líder Técnico", null, "ceo"),
];
const ROLES = rolesDeEmpresa(
  AGENTES.map((a) => ({ companyId: a.companyId, nombre: a.name, rol: a.title ?? null, rolApi: a.role ?? null })),
  BET.id,
);

/** El ítem `review` de BET-627 tal como lo trae el feed de la real (attention.js de 2026.824.1, revisión sin camino). */
const sinCamino = (extra: Partial<ItemAtencion> = {}): ItemAtencion => ({
  id: `review:review:${TAREA}`,
  sourceKind: "review",
  subject: {
    kind: "issue",
    id: TAREA,
    title: TITULO,
    identifier: "BET-627",
    status: "in_review",
    href: "/BET/issues/BET-627",
    metadata: { assigneeAgentId: CI, assigneeUserId: null, reviewAttentionState: "stalled" },
  },
  relatedIssue: null,
  createdAt: "2026-10-25T14:52:44.265Z",
  detail: { kind: "generic", summaryExcerpt: TITULO },
  ...extra,
});

/** Una revisión que quedó tuya (JST-252): la tarea está asignada al usuario. */
const tuya: ItemAtencion = {
  id: "review:review:t-tuya",
  sourceKind: "review",
  subject: { kind: "issue", id: "t-tuya", title: "Revisar la 0.9.3", identifier: "BET-700", status: "in_review", metadata: { assigneeAgentId: null, assigneeUserId: "u-usuario", reviewAttentionState: "stalled" } },
  relatedIssue: null,
};

describe("una revisión sin camino del agente cuenta si sigue 1 min (seguirSinCamino)", () => {
  it("solo la sin camino de una tarea que sigue del agente; la tuya y las de una aprobación cuentan al tiro", () => {
    expect(sinCaminoDelAgente(sinCamino())).toBe(true);
    expect(sinCaminoDelAgente(tuya)).toBe(false);
    const conAprobacion = sinCamino({ subject: { ...sinCamino().subject, metadata: { assigneeAgentId: CI, assigneeUserId: null } } });
    expect(sinCaminoDelAgente(conAprobacion)).toBe(false);
    const { porConfirmar, releerEn } = seguirSinCamino([tuya, conAprobacion], new Map(), 0);
    expect(porConfirmar.size).toBe(0);
    expect(releerEn).toBeNull();
  });

  it("al abrir (primera lectura) cuenta: no se sabe desde cuándo está, y lo que ya esperaba no avisa", () => {
    const { vistas, porConfirmar, releerEn } = seguirSinCamino([sinCamino()], null, 1_000);
    expect(porConfirmar.size).toBe(0);
    expect(releerEn).toBeNull();
    expect(vistas.get(sinCamino().id)).toEqual({ desde: 1_000, cuenta: true });
  });

  it("la del monitor de BET-627: aparece unos 20 s y sale; nunca cuenta, y una que sigue cuenta al minuto", () => {
    const id = sinCamino().id;
    // 16:22:34: aparece (el monitor venció a las 16:22:28).
    let r = seguirSinCamino([sinCamino()], new Map(), 0);
    expect([...r.porConfirmar]).toEqual([id]);
    expect(r.releerEn).toBe(REVISION_SIN_CAMINO_MS);
    // 16:22:47: sigue, todavía no cuenta.
    r = seguirSinCamino([sinCamino()], r.vistas, 13_000);
    expect([...r.porConfirmar]).toEqual([id]);
    expect(r.releerEn).toBe(REVISION_SIN_CAMINO_MS - 13_000);
    // 16:22:55: salió (el planificador disparó el monitor).
    r = seguirSinCamino([], r.vistas, 21_000);
    expect(r.vistas.size).toBe(0);
    expect(r.releerEn).toBeNull();
    // Vuelve 26 min después: empieza de nuevo.
    r = seguirSinCamino([sinCamino()], r.vistas, 26 * 60_000);
    expect([...r.porConfirmar]).toEqual([id]);
    // Si sigue sin camino al minuto (el agente no volvió a programar el monitor), cuenta, y sigue contando.
    r = seguirSinCamino([sinCamino()], r.vistas, 27 * 60_000);
    expect(r.porConfirmar.size).toBe(0);
    r = seguirSinCamino([sinCamino()], r.vistas, 40 * 60_000);
    expect(r.porConfirmar.size).toBe(0);
  });

  it("la oficina armada: la por confirmar no sube la mano; la tuya sí", () => {
    const datos = { empresa: BET, agentes: AGENTES, runs: [], atencion: [sinCamino()] };
    const ci = (porConfirmar?: Set<string>) => armarEmpresa({ ...datos, porConfirmar }, new Map()).find((a) => a.id === CI)!;
    expect(ci().teNecesita).toMatchObject([{ tipo: "revision", issueId: TAREA }]);
    expect(ci(new Set([sinCamino().id])).teNecesita).toEqual([]);
  });
});

describe("Sincronizador: la revisión del hueco del monitor no sube la mano (JST-266)", () => {
  type SocketFalso = { onopen?: () => void; onmessage?: (m: { data: string }) => void; onclose?: () => void; close: () => void };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** API falsa de Betalandia: `feed` es lo que devuelve «Te toca» en cada momento. */
  function oficina(estado: { feed: ItemAtencion[] }) {
    const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
    const fetch = vi.fn(async (url: string) => {
      const ruta = url.replace(/^\/api/, "");
      if (ruta === "/companies") return json([BET]);
      if (ruta === `/companies/${BET.id}/agents`) return json(AGENTES);
      if (ruta === `/companies/${BET.id}/live-runs`) return json([]);
      if (ruta === `/companies/${BET.id}/attention`) return json({ items: estado.feed });
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
    // `ahora` lee el reloj de cada momento (con `Date.now` a secas se queda con el de antes de `useFakeTimers`).
    const sync = new Sincronizador({ cx: { base: "", crearSocket }, respaldoMs: 600_000, sinCanalMs: 600_000, ahora: () => Date.now() });
    const ci = () => sync.agentes().find((a) => a.id === CI)!;
    const lecturas = () => fetch.mock.calls.filter((c) => c[0] === `/api/companies/${BET.id}/attention`).length;
    // Otra tarea de la empresa cambia: se relee «Te toca» (Betalandia tiene muchos cambios por hora).
    const otroCambio = () =>
      sockets[0]!.onmessage!({
        data: JSON.stringify({ id: 9, companyId: BET.id, type: "activity.logged", createdAt: new Date().toISOString(), payload: { action: "issue.updated", entityId: "t-otra", details: { changes: { title: { from: "a", to: "b" } } } } }),
      });
    return { sync, ci, lecturas, otroCambio };
  }

  it("aparece ~20 s cuando el monitor vence y sale: la mano nunca sube y no se relee de más", async () => {
    const estado = { feed: [] as ItemAtencion[] };
    const { sync, ci, lecturas, otroCambio } = oficina(estado);
    await sync.iniciar();
    await vi.waitFor(() => expect(sync.canalesAbiertos()).toBe(1));
    vi.useFakeTimers();
    estado.feed = [sinCamino()];
    otroCambio();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ci().teNecesita).toEqual([]);
    // El planificador dispara el monitor: el ítem sale con la siguiente lectura.
    await vi.advanceTimersByTimeAsync(19_000);
    estado.feed = [];
    otroCambio();
    await vi.advanceTimersByTimeAsync(1_000);
    const n = lecturas();
    await vi.advanceTimersByTimeAsync(2 * REVISION_SIN_CAMINO_MS);
    expect(ci().teNecesita).toEqual([]);
    expect(lecturas()).toBe(n);
    sync.detener();
  });

  it("si sigue sin camino, la relectura al minuto la confirma y sube la mano, sin esperar otro evento", async () => {
    const estado = { feed: [] as ItemAtencion[] };
    const { sync, ci, otroCambio } = oficina(estado);
    await sync.iniciar();
    await vi.waitFor(() => expect(sync.canalesAbiertos()).toBe(1));
    vi.useFakeTimers();
    estado.feed = [sinCamino()];
    otroCambio();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ci().teNecesita).toEqual([]);
    await vi.advanceTimersByTimeAsync(REVISION_SIN_CAMINO_MS - 2_000);
    expect(ci().teNecesita).toEqual([]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(ci().teNecesita).toMatchObject([{ tipo: "revision", issueId: TAREA, identifier: "BET-627" }]);
    sync.detener();
  });

  it("al abrir la página con la revisión ya en el feed, cuenta al tiro (como antes)", async () => {
    const { sync, ci } = oficina({ feed: [sinCamino()] });
    await sync.iniciar();
    expect(ci().teNecesita).toMatchObject([{ tipo: "revision", issueId: TAREA }]);
    sync.detener();
  });
});

describe("la vigía avisa una vez por cada paso a revisión (esperaQueAvisa, cambioDeEstado)", () => {
  const espera = (tipo: Espera["tipo"], issueId: string): Espera => ({ tipo, itemId: `${tipo}:${issueId}`, sujetoId: null, clase: null, issueId, identifier: null, titulo: null, tituloTarea: null, href: null, desde: null });

  it("la revisión ya dicha que vuelve al feed no avisa; otra espera del mismo agente sí", () => {
    const dichas = new Set([TAREA]);
    expect(esperaQueAvisa([espera("revision", TAREA)], new Set())).toBe(0);
    expect(esperaQueAvisa([espera("revision", TAREA)], dichas)).toBe(-1);
    expect(esperaQueAvisa([espera("revision", TAREA), espera("tarjeta", TAREA)], dichas)).toBe(1);
    expect(esperaQueAvisa([espera("revision", TAREA), espera("revision", "t-otra")], dichas)).toBe(1);
  });

  it("un cambio de estado de la tarea abre otro paso; el disparo del monitor y otros cambios no", () => {
    const linea = (action: string, details: unknown) => ({ action, entityId: TAREA, actorType: "agent", agentId: CI, details });
    expect(cambioDeEstado(linea("issue.updated", { changes: { status: { from: "in_progress", to: "in_review" } } }))).toBe(TAREA);
    expect(cambioDeEstado(linea("issue.updated", { changes: { status: { from: "in_review", to: "in_progress" } } }))).toBe(TAREA);
    expect(cambioDeEstado(linea("issue.updated", { status: "in_review", _previous: { status: "in_progress" } }))).toBe(TAREA);
    // Lo que hace el agente al volver a programar el monitor (15:15:46 en la real).
    expect(cambioDeEstado(linea("issue.updated", { changes: { executionRunId: { from: "r1", to: null }, executionState: { from: {}, to: {} } } }))).toBeNull();
    expect(cambioDeEstado(linea("issue.monitor_triggered", { attemptCount: 2 }))).toBeNull();
  });
});

describe("el texto de la voz de BET-627 (JST-266)", () => {
  it("sin el rol repetido delante de la raya ni el punto después del «?»", () => {
    expect(sinRolDelante(TITULO, ROLES)).toBe("BET-518 · commit, tests y PR a develop con la casilla «¿Es usuario invitado?» + seguimiento del CI");
    // Sin el rol, el nombre de la tarea cabe entero (antes se cortaba en el «?» y le seguía un punto).
    const pide = pideDe([{ ...espera(), tituloTarea: TITULO }], ROLES)!;
    expect(textoVoz("Integración y CI", "Betalandia", "toca", "nombre-empresa", { pide })).toBe(
      "Integración y CI, de Betalandia: te necesito para revisar: commit, tests y PR a develop con la casilla ¿Es usuario invitado? y seguimiento del CI.",
    );
    // Lo que espera termina en «?»: sin otro punto, en las 3 presentaciones.
    const termina = { tipo: "revisar" as const, texto: "Commit, tests y PR a develop con la casilla «¿Es usuario invitado?»", mas: 0 };
    expect(textoVoz("Integración y CI", "Betalandia", "toca", "nombre-empresa", { pide: termina })).toBe(
      "Integración y CI, de Betalandia: te necesito para revisar: Commit, tests y PR a develop con la casilla ¿Es usuario invitado?",
    );
    expect(textoVoz("Integración y CI", "Betalandia", "toca", "nombre", { pide: termina })).toBe("Integración y CI: te necesito para revisar: Commit, tests y PR a develop con la casilla ¿Es usuario invitado?");
    expect(textoVoz("Integración y CI", "Betalandia", "toca", "frase", { pide: termina })).toBe("Te necesito para revisar: Commit, tests y PR a develop con la casilla ¿Es usuario invitado?");
    expect(textoVoz("Integración y CI", "Betalandia", "toca", "nombre-empresa", { pide: { ...termina, mas: 2 } })).toBe(
      "Integración y CI, de Betalandia: te necesito para revisar: Commit, tests y PR a develop con la casilla ¿Es usuario invitado? Y 2 más.",
    );
    // Lo de siempre sigue con su punto.
    expect(textoVoz("Integración y CI", "Betalandia", "toca", "nombre-empresa")).toBe("Integración y CI, de Betalandia: te necesito.");
    expect(textoVoz("Integración y CI", "Betalandia", "fin", "nombre-empresa", { tarea: "Pruebas de Explorar" })).toBe("Integración y CI, de Betalandia: terminé. Pruebas de Explorar.");
  });

  it("BET-625 (con dos puntos) ya salía bien; una raya sin rol delante o «CEO - CTO:» quedan como antes", () => {
    expect(sinRolDelante("BET-544 · Integración: commit, tests y PR a develop con las pruebas de Explorar (BET-480)", ROLES)).toBe("BET-544 · commit, tests y PR a develop con las pruebas de Explorar (BET-480)");
    expect(sinRolDelante("BET-509 · Explorar — tests de la lista", ROLES)).toBe("BET-509 · Explorar — tests de la lista");
    expect(sinRolDelante("Líder Técnico — revisar el PR", ROLES)).toBe("revisar el PR");
    const migo = new Set(["ceo - cto", "ceo", "ingeniero"]);
    expect(sinRolDelante("CEO - CTO: plan de la 039", migo)).toBe("plan de la 039");
    expect(sinRolDelante("Ingeniero — QA: algo", migo)).toBe("QA: algo");
  });

  function espera(): Espera {
    return { tipo: "revision", itemId: sinCamino().id, sujetoId: TAREA, clase: null, issueId: TAREA, identifier: "BET-627", titulo: TITULO, tituloTarea: TITULO, href: null, desde: null };
  }
});
