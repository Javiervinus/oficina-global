// Cómo dice la voz el nombre de una tarea y la pregunta de una tarjeta (0.8.0, JST-241), con títulos y preguntas
// de las 4 empresas: los de JSTM, de la real; los demás, inventados con la misma forma que los reales.
import { describe, expect, it } from "vitest";
import { rolesDeEmpresa } from "../src/avisos.js";
import { analizarPregunta, cortarNatural, normalizarRol, preguntaParaVoz, sinRolDelante, tareaParaVoz, TOPES_AVISO, TOPES_OFICINA } from "../src/paraVoz.js";
import { numerosParaDecir, paraDecir } from "../generador/pronunciar.js";

/** Los agentes de Migo (nombre, cargo y rol), con la forma de los de la real. */
const MIGO = [
  ["Hermes", "Asistente Hermes (servidor)", "general"],
  ["Ingeniero", "Ingeniero de implementación Migo", "engineer"],
  ["Qa", "QA de producto", "qa"],
  ["RevisorCodigo", "Revisor de código", "qa"],
  ["Disenador", "Diseñador de producto", "designer"],
  ["Speckit", "Operador de Spec Kit y Jira", "pm"],
  ["Ceo - cto", null, "ceo"],
  ["Revisor", "Revisor independiente", "security"],
].map(([nombre, rol, rolApi]) => ({ companyId: "mig", nombre: nombre!, rol, rolApi }));
const ROLES_MIGO = rolesDeEmpresa(MIGO, "mig");
const NINGUNO = new Set<string>();

/** Empresa, título, lo que dice «terminé» (sin el rol de adelante si es de Migo) y lo que dice la oficina (8 palabras y 60 letras; desde la 0.9.1, sin dejar sola la condición del principio). */
const TAREAS: ReadonlyArray<readonly [string, string, string, string]> = [
    ["BET", "BET-117 · H5 Backend — Ajustes de la auditoría de accesos: API de pedidos, carga de archivos, hash de la clave JWT, sesión, logs y lint (A1-A3, C2, C5)", "H5 Backend — Ajustes de la auditoría de accesos: API de pedidos, carga de archivos", "H5 Backend — Ajustes de la auditoría"],
    ["BET", "CORE-220 Reportes por área: acceso con id.ejemplo.cl, paneles limitados por perfil y retiro de columnas con datos sensibles", "Reportes por área: acceso con id.ejemplo.cl", "Reportes por área: acceso con id.ejemplo.cl"],
    ["BET", "CI backend: apagar por ahora una parte de las pruebas del PR, mientras se arma un esquema mejor (viene de BET-529)", "CI backend: apagar por ahora una parte de las pruebas del PR", "CI backend: apagar por ahora una parte"],
    ["BET", "BT-5676 [TI] Agregar captcha al registro", "Agregar captcha al registro", "Agregar captcha al registro"],
    ["BET", "BET-11 · QA: paso a paso de los 4 ajustes gráficos de FE-9 y fotos de la guía (slot 4)", "QA: paso a paso de los 4 ajustes gráficos y fotos de la guía", "QA: paso a paso"],
    ["BET", "BT-6927 · Hotfix 2.7.9 — botones en plural y «Guardar» con el campo del correo vacío", "Hotfix 2.7.9 — botones en plural y Guardar con el campo del correo vacío", "Hotfix 2.7.9 — botones en plural y Guardar"],
    ["BET", "Review productivity for BET-419", "Review productivity", "Review productivity"],
    ["ELM", "Reporte semanal de errores (semanas 1–4)", "Reporte semanal de errores", "Reporte semanal de errores"],
    ["ELM", "Piloto en AWS Lambda (≤ $80.000 CLP) y resumen semanal", "Piloto en AWS Lambda y resumen semanal", "Piloto en AWS Lambda y resumen semanal"],
    ["ELM", "Evaluar que un agente revise los logs al final de la prueba (1 nov)", "Evaluar que un agente revise los logs al final de la prueba", "Evaluar que un agente revise los logs"],
    ["JST", "Oficina 0.6.0: con «Entregas» prendida, la entrega en la mesa no suena si los dos ya estaban en el descanso y su frase es nueva", "Oficina 0.6.0: con Entregas prendida, la entrega en la mesa no suena", "Oficina 0.6.0"],
    ["JST", "QA de «Oficina global» 0.6.0: la voz lee las conversaciones y los globos elegidos en «Voces»", "QA de Oficina global 0.6.0: la voz lee las conversaciones y los globos elegidos en Voces", "QA de Oficina global 0.6.0"],
    ["JST", "Oficina 0.6.0: «Terminé» suena sin 🔊: el «✓ listo» sale recién cuando termina el run, 26–98 s después", "Oficina 0.6.0: Terminé suena: el listo sale recién cuando termina el run, 26–98 s después", "Oficina 0.6.0: Terminé suena: el listo sale recién"],
    ["JST", "Oficina 0.3.0: justo después de cargar, una entrega puede quedarse sin sobre aunque diga «En vivo»", "Oficina 0.3.0: justo después de cargar, una entrega puede quedarse sin sobre", "Oficina 0.3.0"],
    ["JST", "Instalar en la real la 0.6.0 de «Oficina global» (la voz lee los globos) cuando pase su QA", "Instalar en la real la 0.6.0 de Oficina global cuando pase su QA", "Instalar en la real la 0.6.0"],
    ["MIG", "KAN-188 · Ingeniero: el nombre y el correo en cada tarjeta de cuenta de «Esperan tu firma» (servidor y app)", "el nombre y el correo en cada tarjeta de cuenta de Esperan tu firma", "Ingeniero: el nombre y el correo"],
    ["MIG", "037 · Plan técnico: conexión Hermes–Migo (/speckit-plan)", "037, Plan técnico: conexión Hermes–Migo", "037, Plan técnico: conexión Hermes–Migo"],
    ["MIG", "Bug: no deja cambiar el formato de PDF a CSV con filtros (Reporte mensual de prueba 42x90); la ayuda muestra un camino y no anda", "Bug: no deja cambiar el formato de PDF a CSV con filtros", "Bug: no deja cambiar el formato de PDF"],
    ["MIG", "KAN-190 · Ingeniero: el filtro de Exportar reportes ve los usuarios nuevos sin F5, y la vista chica en A4", "el filtro de Exportar reportes ve los usuarios nuevos sin F5", "Ingeniero: el filtro"],
    ["MIG", "Registro: «Crear la cuenta» debe traer el correo leído de la invitación y proponer el usuario según el dominio (casos Acme, Globex 000123456)", "Registro: Crear la cuenta debe traer el correo leído de la invitación", "Registro"],
];

/** Empresa, la pregunta o el título de una tarjeta, lo que dice la voz, si es pregunta y si se cortó. */
const PREGUNTAS: ReadonlyArray<readonly [string, string, string, boolean, boolean]> = [
    ["MIG", "¿Reinicio el motor de Docker? (Betalandia se cae ~1 min)", "¿Reinicio el motor de Docker?", true, false],
    ["BET", "BET-252: ¿apruebas la maqueta del cambio de clave?", "¿Apruebas la maqueta del cambio de clave?", true, false],
    ["BET", "BT-6927 · Hotfix de web-admin: ¿commit + PR?", "Hotfix de web-admin: ¿commit y PR?", true, false],
    ["JST", "Qué IA escribe las conversaciones de la Oficina", "¿Qué IA escribe las conversaciones de la Oficina?", true, false],
    ["JST", "¿Qué IA escribe las conversaciones del descanso, las frases sueltas y lo que dicen las mascotas?", "¿Qué IA escribe las conversaciones del descanso?", true, true],
    ["MIG", "Cuando subes la foto de un usuario nuevo, ¿quieres que el asistente te pregunte si se muestra tal cual en el Perfil?", "¿Quieres que el asistente te pregunte si se muestra tal cual en el Perfil?", true, false],
    ["MIG", "Si Hermes anota una reserva antes de que Migo anote esa misma reserva, y más de una reserva de Hermes calza, ¿qué hace Migo mientras tú decides?", "¿Qué hace Migo mientras tú decides?", true, false],
    ["BET", "P1 · ¿Cuáles tests apago en los PR?", "¿Cuáles tests apago en los PR?", true, false],
    ["BET", "D-1 y D-9 · ¿Se alinea al design system lo que ya existe en id.ejemplo.cl?", "¿Se alinea al design system lo que ya existe en id.ejemplo.cl?", true, false],
    ["BET", "¿Ya mergeaste el PR #2107 en develop? A las 02:48 UTC GitHub todavía lo mostraba abierto.", "¿Ya mergeaste el PR 2107 en develop?", true, false],
    ["BET", "¿Cierro los dos worktrees vacíos de BET-49 y BET-50?", "¿Cierro los dos worktrees vacíos?", true, false],
    ["BET", "¿Apruebas el commit y el PR contra develop que programan el respaldo cifrado semanal (viernes 05:17 UTC), y que publique en CORE-224 el comentario del borrador...", "¿Apruebas el commit y el PR contra develop que programan el respaldo cifrado semanal?", true, true],
    ["ELM", "Aprobar el sprint 4 (26 oct al 1 nov)", "Aprobar el sprint 4", false, false],
    ["ELM", "¿Apruebas el sprint 4 para publicarlo desde el lunes 26?", "¿Apruebas el sprint 4 para publicarlo desde el lunes 26?", true, false],
    ["ELM", "Sentry: ¿quién crea la cuenta antes del lunes 12 de octubre?", "Sentry: ¿quién crea la cuenta antes del lunes 12 de octubre?", true, false],
    ["JST", "¿Instalo ahora la 0.4.0 (conversaciones y mascotas) con sus 2 defectos medios? Los arreglos llegan después, en la 0.5.1.", "¿Instalo ahora la 0.4.0 con sus 2 defectos medios?", true, false],
    ["JST", "**¿Por qué?** Mira [el doc](https://x.y/z) 👀", "¿Por qué?", true, false],
    ["MIG", "Marca los cambios de estado que quieres que aplique en Jira.", "Marca los cambios de estado que quieres que aplique en Jira", false, false],
];

/** Lo que no puede quedar al final de lo que se dice. */
const CONECTOR = /^(a|al|con|de|del|el|en|la|las|lo|los|para|por|que|sin|su|sus|un|una|unos|unas|y|o|e|u|cada|todo|todos|muy|más|for|of|the)$/i;

describe("«terminé» dice qué terminó: el nombre de la tarea (tareaParaVoz, 0.8.0)", () => {
  it("títulos de las 4 empresas: sin código, paréntesis ni comillas, cortados en un límite natural", () => {
    for (const [empresa, titulo, voz, oficina] of TAREAS) {
      expect(tareaParaVoz(sinRolDelante(titulo, empresa === "MIG" ? ROLES_MIGO : NINGUNO)), titulo).toBe(voz);
      expect(tareaParaVoz(titulo, TOPES_OFICINA), titulo).toBe(oficina);
    }
    expect(new Set(TAREAS.map((t) => t[0]))).toEqual(new Set(["BET", "ELM", "JST", "MIG"]));
  });

  it("nunca más de ~90 letras y 16 palabras, ni termina en un conector, un signo o a media palabra", () => {
    for (const [, titulo] of TAREAS) {
      for (const [topes, t] of [[TOPES_AVISO, tareaParaVoz(titulo)], [TOPES_OFICINA, tareaParaVoz(titulo, TOPES_OFICINA)]] as const) {
        expect(t.length, titulo).toBeLessThanOrEqual(topes.letras);
        expect(t.split(" ").length, titulo).toBeLessThanOrEqual(topes.palabras);
        expect(t, titulo).not.toMatch(/[\s,;:·—–\-/&+]$/);
        expect(t.split(" ").at(-1)!.replace(/[?.!]$/, ""), titulo).not.toMatch(CONECTOR);
        expect(t, titulo).not.toMatch(/[«»"“”()[\]🔊✓…]/u);
      }
    }
  });

  it("los 4 ejemplos de la tarea: «en cada.», el rol adelante y los números", () => {
    // Antes: «Ingeniero: el nombre y el correo en cada.»
    expect(tareaParaVoz(sinRolDelante("KAN-188 · Ingeniero: el nombre y el correo en cada tarjeta de cuenta de «Esperan tu firma» (servidor y app)", ROLES_MIGO))).toBe(
      "el nombre y el correo en cada tarjeta de cuenta de Esperan tu firma",
    );
    // Antes: «Oficina 0.6.0: con Entregas prendida, la entrega.»
    expect(tareaParaVoz("Oficina 0.6.0: con «Entregas» prendida, la entrega en la mesa no suena si los dos ya estaban en el descanso y su frase es nueva")).toBe(
      "Oficina 0.6.0: con Entregas prendida, la entrega en la mesa no suena",
    );
    // Antes: «037 Plan técnico.»; la voz dice «cero treinta y siete».
    expect(tareaParaVoz("037 · Plan técnico: conexión Hermes–Migo (/speckit-plan)")).toBe("037, Plan técnico: conexión Hermes–Migo");
    expect(numerosParaDecir("037, Plan técnico: conexión Hermes–Migo")).toBe("cero treinta y siete, Plan técnico: conexión Hermes–Migo");
  });

  it("el corte: entero si cabe; si no, el límite natural más largo; uno débil si el fuerte queda muy corto", () => {
    const t = { palabras: 8, letras: 60 };
    expect(cortarNatural("Instalar la Oficina global en la real", t)).toBe("Instalar la Oficina global en la real");
    // Antes de «cuando» (fuerte).
    expect(cortarNatural("Instalar la Oficina global cuando pase su re-QA y el usuario diga que sí", t)).toBe("Instalar la Oficina global");
    // El fuerte («Oficina 0.6.0», 2) es muy corto al lado del débil (antes de «y», 7).
    expect(cortarNatural("Oficina 0.6.0: la voz lee las conversaciones y los globos elegidos", t)).toBe("Oficina 0.6.0: la voz lee las conversaciones");
    // Sin límite natural: hasta donde quepa, sin terminar en un conector.
    expect(cortarNatural("uno dos tres cuatro cinco seis siete el ocho nueve", t)).toBe("uno dos tres cuatro cinco seis siete");
  });
});

describe("la condición del principio no queda sola, y «%» se dice (0.9.1, JST-253)", () => {
  it("los 6 títulos de la QA de la 0.8.0: sigue hasta lo principal si cabe; si no, lo de antes de los dos puntos", () => {
    const casos: ReadonlyArray<readonly [string, string]> = [
      // Antes: «Oficina global 0.1.2: si Personal no responde al recargar.»
      ["«Oficina global» 0.1.2: si Personal no responde al recargar, aparece su sala a oscuras con aviso y el TV baja a 2x", "Oficina global 0.1.2: si Personal no responde al recargar, aparece su sala a oscuras"],
      ["«Oficina global»: sin «Te toca» y con nadie trabajando, también sale «Todos libres… ni esperándote» (en el TV, 2 banners)", "Oficina global: sin Te toca y con nadie trabajando, también sale Todos libres"],
      // Lo principal que cabe («, la ficha») no se entiende: va lo de antes de los dos puntos.
      ["«Oficina global»: en el modo TV desde un celular vertical, la ficha de un agente sale cortada por los lados y la × de cerrar queda fuera", "Oficina global"],
      // Dos seguidas («En el panel, al entrar a una cuenta,»).
      ["CORE-125 En el panel, al entrar a una cuenta, agregar botón de ver historial que traiga los datos de todos los cambios y deje consultar a la IA por ellos", "En el panel, al entrar a una cuenta, agregar botón de ver historial"],
      ["Avisos: si Avisos se recarga justo después de abrir una tarea no tocada, la vuelve a mostrar sin ver (caché de 2 s)", "Avisos"],
      ["Pestañas guardadas: siguiendo el documento `instalacion`, las pestañas dormidas de The Marvellous Suspender se guardan con una dirección que deja de funcionar", "Pestañas guardadas: siguiendo el documento instalacion, las pestañas dormidas"],
    ];
    for (const [titulo, voz] of casos) expect(tareaParaVoz(titulo), titulo).toBe(voz);
  });

  it("en la oficina (8 palabras y 60 letras) y en el Resumen, lo mismo", () => {
    expect(tareaParaVoz("Oficina global 0.1.4: al cargar, el piso pasa un momento por 3x antes de quedar en 2x donde no cabe a 3x", TOPES_OFICINA)).toBe("Oficina global 0.1.4");
    expect(tareaParaVoz("Oficina 0.2.0: con muchas esperas, la píldora activa queda fuera de la tira de pasos", TOPES_OFICINA)).toBe("Oficina 0.2.0");
    expect(tareaParaVoz("Oficina 0.2.0: con muchas esperas, la píldora activa queda fuera de la tira de pasos", { palabras: 11, letras: 64 })).toBe(
      "Oficina 0.2.0: con muchas esperas, la píldora activa queda fuera",
    );
  });

  it("sin la coma no es una condición suelta, y una condición después de lo principal se puede cortar", () => {
    expect(tareaParaVoz("BET-11 · Diagnóstico: en la app el modo oscuro queda activo solo para el equipo interno y no para los demás")).toBe(
      "Diagnóstico: en la app el modo oscuro queda activo solo para el equipo interno",
    );
    expect(tareaParaVoz("Sin resultados: el conteo de «Quitar …» incluye tareas cerradas que el kanban no muestra", TOPES_OFICINA)).toBe("Sin resultados");
    expect(tareaParaVoz("Oficina global: a 1440×900 en tema oscuro el filtro no muestra los nombres de las empresas")).toBe(
      "Oficina global: a 1440 por 900 en tema oscuro el filtro no muestra los nombres",
    );
    expect(cortarNatural("Desactivar los tests del PR, si fallan, en el CI de develop y main", { palabras: 8, letras: 60 })).toBe("Desactivar los tests del PR, si fallan");
  });

  it("si no hay otro corte, el de la condición: es mejor que cortar donde caiga", () => {
    expect(cortarNatural("Si Personal no responde al recargar, aparece su sala a oscuras con aviso", { palabras: 7, letras: 60 })).toBe("Si Personal no responde al recargar");
  });

  it("«50 %» se dice «50 por ciento», también en «te necesito», y el corte no lo separa del número", () => {
    // Antes: «Revisar el 50 de las maquetas de la 056.»
    expect(tareaParaVoz("Diseñador: revisar el 50 % de las maquetas de la 056 (UX/UI)")).toBe("Diseñador: revisar el 50 por ciento de las maquetas de la 056");
    expect(paraDecir("revisar el 50 por ciento de las maquetas de la 056", "qwen3")).toBe("revisar el cincuenta por ciento de las maquetas de la cero cincuenta y seis");
    expect(tareaParaVoz("CORE-143 Subir la cobertura de pruebas del módulo de reportes por sobre 80%")).toBe("Subir la cobertura de pruebas del módulo de reportes por sobre 80 por ciento");
    expect(tareaParaVoz("QA-4 · 056 Cobertura por líneas al 95 % (SC-012) y pruebas de login sin Skip")).toBe("056 Cobertura por líneas al 95 por ciento y pruebas de login sin Skip");
    expect(preguntaParaVoz("¿Subo la cobertura al 95%?")).toBe("¿Subo la cobertura al 95 por ciento?");
    // Antes del «por» no se corta: «Cobertura por líneas al 95» perdía el «por ciento».
    expect(cortarNatural("Cobertura por líneas al 95 por ciento y pruebas", { palabras: 6, letras: 60 })).toBe("Cobertura por líneas");
    expect(cortarNatural("Cobertura al 95 por ciento de las líneas nuevas", { palabras: 5, letras: 60 })).toBe("Cobertura al 95 por ciento");
  });
});

describe("sin el rol adelante (sinRolDelante)", () => {
  it("solo si es un rol de esa empresa; «QA de X» y «Spec:» se quedan", () => {
    expect([...ROLES_MIGO]).toEqual(expect.arrayContaining(["ingeniero", "qa", "speckit", "disenador", "disenador de producto", "ceo - cto", "revisor"]));
    expect(sinRolDelante("Ingeniero: algo", ROLES_MIGO)).toBe("algo");
    expect(sinRolDelante("KAN-190 · Ingeniero: el filtro", ROLES_MIGO)).toBe("KAN-190 · el filtro");
    expect(sinRolDelante("038 · Qa: algo", ROLES_MIGO)).toBe("038 · algo");
    expect(sinRolDelante("Ingeniero de implementación Migo: algo", ROLES_MIGO)).toBe("algo");
    expect(sinRolDelante("QA de la 039: algo", ROLES_MIGO)).toBe("QA de la 039: algo");
    expect(sinRolDelante("Spec: algo", ROLES_MIGO)).toBe("Spec: algo");
    expect(sinRolDelante("BE-7 · 056 Backend: logs", rolesDeEmpresa([{ companyId: "b", nombre: "Ingeniero Backend Java / REST", rol: "Backend Java / REST", rolApi: "engineer" }], "b"))).toBe("BE-7 · 056 Backend: logs");
    // En otra empresa «Ingeniero» no es un rol.
    expect(sinRolDelante("Ingeniero: algo", rolesDeEmpresa(MIGO, "otra"))).toBe("Ingeniero: algo");
    // Con barra y sin tildes: «Diseñador/a de Producto (UX/UI)» es «diseñador de producto».
    expect(normalizarRol("Diseñador/a de Producto (UX/UI)")).toBe("disenador de producto");
    expect(sinRolDelante("Diseñador de producto: maqueta", rolesDeEmpresa([{ companyId: "j", nombre: "Diseñador/a de Producto (UX/UI)", rol: null, rolApi: "designer" }], "j"))).toBe("maqueta");
  });
});

describe("«te necesito» dice la pregunta breve (preguntaParaVoz)", () => {
  it("preguntas y títulos de tarjetas de las 4 empresas", () => {
    for (const [, texto, voz, pregunta, cortada] of PREGUNTAS) {
      expect(analizarPregunta(texto), texto).toMatchObject({ texto: voz, pregunta, cortada });
      expect(preguntaParaVoz(texto)).toBe(voz);
    }
    expect(new Set(PREGUNTAS.map((t) => t[0]))).toEqual(new Set(["BET", "ELM", "JST", "MIG"]));
  });

  it("una pregunta empieza con «¿» y termina en «?»; nunca pasa de los topes ni termina en un conector", () => {
    for (const [, texto] of PREGUNTAS) {
      const q = analizarPregunta(texto)!;
      if (q.pregunta) expect(q.texto, texto).toMatch(/^[^¿]*¿.*\?$/u);
      expect(q.texto.length, texto).toBeLessThanOrEqual(TOPES_AVISO.letras + 2);
      expect(q.texto.replace(/[¿?]/g, "").split(" ").at(-1), texto).not.toMatch(/^(a|al|con|de|del|el|en|la|las|los|para|por|un|una|y)$/i);
    }
  });

  it("sin nada que decir, «»", () => {
    expect(preguntaParaVoz("")).toBe("");
    expect(preguntaParaVoz(null)).toBe("");
    expect(preguntaParaVoz("(JST-12) 🔊 ✓")).toBe("");
  });
});

describe("los números que la voz decía mal (numerosParaDecir, 0.8.0)", () => {
  it("versiones con «punto», ceros adelante con «cero»; las horas, los miles y los decimales con coma quedan igual", () => {
    expect(numerosParaDecir("Oficina 0.6.0: algo")).toBe("Oficina cero punto seis punto cero: algo");
    expect(numerosParaDecir("hotfix 9.4.11.")).toBe("hotfix nueve punto cuatro punto once.");
    expect(numerosParaDecir("la 0.8")).toBe("la cero punto ocho");
    expect(numerosParaDecir("037 y 007")).toBe("cero treinta y siete y cero cero siete");
    expect(numerosParaDecir("a las 09:47, 6.700 tests, 100.000 CLP y 0,4 s")).toBe("a las 09:47, 6.700 tests, 100.000 CLP y 0,4 s");
    expect(paraDecir("Oficina 0.6.0", "edge")).toBe("Oficina cero punto seis punto cero");
    // Los clones ya no dicen «seis. setecientos».
    expect(paraDecir("6.700 tests", "qwen3")).toBe("seis mil setecientos tests");
  });
});
