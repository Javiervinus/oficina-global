// Estilos de la ventana para responder (§5), design-spec de JST-95. Mismos tokens `--of-*` de `estilos.ts`.
// Portados de `a.css` (`.rw*`) y `nuevo.css` (contenido de cada espera) del prototipo.
export const CSS_VENTANA = /* css */ `
/* ---------- Contenedor: diálogo de 600 px (computador) o pantalla entera (celular) ---------- */
.of-rw-bg { position: fixed; inset: 0; z-index: 1090; background: var(--of-backdrop); animation: of-fade .15s; }
.of-rw { position: fixed; z-index: 1100; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 600px; max-width: calc(100% - 24px); max-height: calc(100vh - 96px);
  display: flex; flex-direction: column; background: var(--of-popover); color: var(--of-fg); border-radius: 14px; box-shadow: var(--of-shadow-pop);
  font-size: 14px; line-height: 20px; animation: of-rwin .16s cubic-bezier(.16,1,.3,1); outline: none; }
@keyframes of-rwin { from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); } }
.of-rw-h { display: flex; align-items: center; gap: 12px; padding: 14px 14px 12px 16px; border-bottom: 1px solid var(--of-border); flex: none; }
.of-rw-id { flex: 1; min-width: 0; }
.of-rw-n { font-size: 15px; font-weight: 600; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-rw-c { display: flex; align-items: center; gap: 6px; font-size: 12.5px; line-height: 18px; color: var(--of-muted-fg); margin-top: 3px; white-space: nowrap; }
.of-rw-c .of-dotsep { opacity: .6; }
.of-rw-h .of-ibtn { color: var(--of-muted-fg); }

/* Pasos: una píldora por espera (solo con 2 o más) */
.of-rw-steps { display: flex; gap: 4px; padding: 10px 16px 0; overflow-x: auto; scrollbar-width: none; flex: none; }
.of-rw-steps::-webkit-scrollbar { display: none; }
.of-rw-step { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px 0 8px; border-radius: 9px; border: 1px solid var(--of-border); background: transparent;
  color: var(--of-muted-fg); font-size: 12.5px; white-space: nowrap; flex: none; }
.of-rw-step:hover { border-color: var(--of-border-strong); }
.of-rw-step .of-n { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--of-muted); font-size: 11px; font-weight: 600; color: var(--of-fg); flex: none; }
.of-rw-step .of-l { display: flex; flex-direction: column; line-height: 14px; text-align: left; }
.of-rw-step .of-l em { font-style: normal; font: 500 11px/14px ui-monospace, SFMono-Regular, Menlo, monospace; }
.of-rw-step.is-on { border-color: var(--of-s-toca); color: var(--of-fg); background: color-mix(in srgb, var(--of-s-toca) 7%, transparent); }
.of-rw-step.is-on .of-n { background: var(--of-s-toca); color: #fff; }
.of-rw-step.is-ok .of-n { background: var(--of-st-done); color: #fff; }
.of-rw-step.is-ext { border-style: dashed; }

/* Cuerpo y pie */
.of-rw-b { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 12px; overflow: auto; min-height: 0; flex: 1 1 auto; }
.of-rw-f { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--of-border); flex: none; }
.of-rw-f .of-btn { height: 34px; }
/* Los primarios violeta y rojo siguen de su color al pasar el mouse (en estilos.ts el hover de .is-primary va después y los aclaraba). */
.of-rw .of-btn.is-toca:not(:disabled):hover { background: var(--of-s-toca); border-color: var(--of-s-toca); color: #fff; filter: brightness(1.08); }
.of-rw .of-btn.is-danger:not(:disabled):hover { background: var(--of-s-error); border-color: var(--of-s-error); color: #fff; filter: brightness(1.08); }

/* Celular: pantalla entera, sube desde abajo; pie con botones de 44 px repartidos */
.of-rw.is-m { left: 0; right: 0; top: 0; bottom: 0; width: auto; max-width: none; max-height: none; transform: none; border-radius: 0; animation: of-rwup .2s cubic-bezier(.16,1,.3,1); }
@keyframes of-rwup { from { transform: translateY(40px); opacity: .5; } }
.of-rw.is-m .of-rw-h { padding: 10px 8px 10px 12px; }
.of-rw.is-m .of-rw-b { flex: 1; padding: 14px 16px; }
.of-rw.is-m .of-rw-f { flex-wrap: wrap; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); gap: 8px; }
.of-rw.is-m .of-rw-f .of-rwho { width: 100%; justify-content: center; }
.of-rw.is-m .of-rw-f .of-sp { display: none; }
.of-rw.is-m .of-rw-f .of-btn { flex: 1; height: 44px; font-size: 14px; }
.of-rw.is-m .of-opt { padding: 11px 12px; }
.of-rw.is-m .of-rw-steps { padding: 10px 12px 0; }

/* Movimiento reducido: sin entrada; los esqueletos no laten (el girador sí gira) */
.of-rw.is-quieto, .of-rw-bg.is-quieto { animation: none; }
.of-rw.is-quieto .of-sk, .of-rsk.is-quieto .of-sk { animation: none; }
@media (prefers-reduced-motion: reduce) { .of-rw, .of-rw-bg { animation: none; } .of-rw .of-sk { animation: none; } }

/* ---------- Contenido de cada espera ---------- */
.of-rmeta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--of-muted-fg); }
.of-rk { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-weight: 600; font-size: 11.5px;
  color: var(--of-s-toca-fg); background: color-mix(in srgb, var(--of-s-toca) var(--of-s-alpha), transparent); }
.of-rk svg { color: var(--of-s-toca); }
.of-rk.is-fuera { color: var(--of-muted-fg); background: var(--of-muted); }
.of-rk.is-fuera svg { color: var(--of-muted-fg); }
.of-rtid { display: inline-flex; align-items: center; gap: 2px; font: 500 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--of-muted-fg); }
.of-rtid:hover { color: var(--of-fg); }
.of-rtitle { margin: 0; font-size: 16px; line-height: 22px; font-weight: 600; letter-spacing: -.005em; text-wrap: pretty; }
.of-rtt { display: block; font-size: 12.5px; color: var(--of-muted-fg); line-height: 18px; margin-top: 2px; }
.of-rdet { margin: 0; font-size: 13px; line-height: 20px; color: var(--of-fg); opacity: .9; white-space: pre-line; overflow-wrap: anywhere; }
.of-rdet b { font-weight: 600; }
.of-rq { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.of-rq + .of-rq { margin-top: 10px; }
.of-rq legend { padding: 0; margin-bottom: 6px; font-size: 13.5px; font-weight: 600; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; width: 100%; }
.of-rq legend em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--of-muted-fg); }
.of-rq.is-busy { opacity: .6; pointer-events: none; }
.of-rhelp { margin: -4px 0 2px; font-size: 12.5px; line-height: 18px; color: var(--of-muted-fg); }
.of-optw { display: flex; flex-direction: column; gap: 6px; }

/* Opciones: tarjetas con la marca de 16 px (círculo o cuadrado); el input real va oculto pero se usa con el teclado */
.of-opt { position: relative; display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--of-border-strong); cursor: pointer; line-height: 18px; transition: border-color .12s, background .12s; }
.of-opt:hover { border-color: color-mix(in srgb, var(--of-s-toca) 55%, var(--of-border-strong)); }
.of-opt.is-on { border-color: var(--of-s-toca); background: color-mix(in srgb, var(--of-s-toca) 8%, transparent); box-shadow: inset 0 0 0 1px var(--of-s-toca); }
.of-opt > input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
.of-opt:has(> input:focus-visible) { outline: 2px solid var(--of-ring); outline-offset: 2px; }
.of-opt .of-mk { width: 16px; height: 16px; flex: none; margin-top: 1px; border-radius: 50%; border: 1.5px solid var(--of-border-strong); display: grid; place-items: center; color: #fff; }
.of-opt.is-multi .of-mk { border-radius: 4px; }
.of-opt.is-on .of-mk { background: var(--of-s-toca); border-color: var(--of-s-toca); }
.of-opt .of-mk svg.of-i { width: 11px; height: 11px; stroke-width: 3; }
.of-opt .of-ol { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.of-opt .of-ol b { font-weight: 500; font-size: 13.5px; }
.of-opt .of-ol span { font-size: 12.5px; color: var(--of-muted-fg); }
.of-opt.is-child { margin-left: 22px; }
.of-rlbl { font-size: 12.5px; font-weight: 600; margin-top: 4px; }
.of-rlbl em { font-style: normal; font-weight: 400; color: var(--of-muted-fg); }
.of-rtx { width: 100%; resize: vertical; min-height: 56px; border: 1px solid var(--of-input); border-radius: 8px; padding: 8px 10px; background: transparent; color: var(--of-fg);
  font: inherit; font-size: 13.5px; line-height: 20px; }
.of-rtx:focus { outline: 0; border-color: var(--of-s-toca); box-shadow: 0 0 0 3px color-mix(in srgb, var(--of-s-toca) 20%, transparent); }
.of-rtx:disabled { opacity: .6; }

/* Notas (estados de la ventana) */
.of-rnote { display: flex; gap: 8px; align-items: flex-start; padding: 9px 12px; border-radius: 8px; font-size: 13px; line-height: 19px; border: 1px solid var(--of-border); }
.of-rnote > svg { margin-top: 2px; flex: none; }
.of-rnote b { font-weight: 600; }
.of-rnote.is-info { background: var(--of-muted); }
.of-rnote.is-info > svg { color: var(--of-muted-fg); }
.of-rnote.is-ok { border-color: color-mix(in srgb, var(--of-st-done) 40%, var(--of-border)); background: color-mix(in srgb, var(--of-st-done) 9%, transparent); }
.of-rnote.is-ok > svg { color: var(--of-st-done); }
.of-rnote.is-err { border-color: var(--of-danger-border); background: var(--of-danger-bg); }
.of-rnote.is-err > svg { color: var(--of-s-error); }
.of-rnote.is-warn { border-color: color-mix(in srgb, var(--of-s-pausa) 45%, var(--of-border)); background: color-mix(in srgb, var(--of-s-pausa) 8%, transparent); }
.of-rnote.is-warn > svg { color: var(--of-s-pausa); }

/* Aprobación: riesgos y lo que recomienda */
.of-rrisk { border: 1px solid var(--of-risk-bd); background: var(--of-risk-bg); border-radius: 8px; padding: 8px 12px 9px; }
.of-rrh { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--of-risk-fg); }
.of-rrisk ul { margin: 4px 0 0; padding-left: 18px; list-style: disc; font-size: 13px; line-height: 19px; }  /* el CSS base de Paperclip quita las viñetas */
.of-rrisk li + li { margin-top: 2px; }
.of-rrec { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; line-height: 18px; color: var(--of-muted-fg); }
.of-rrec svg { margin-top: 2px; flex: none; }
.of-rrec b { color: var(--of-fg); font-weight: 500; }

/* Respuesta guardada («Ya está respondida») */
.of-rans { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; border-radius: 8px; border: 1px dashed var(--of-border-strong); font-size: 13px; line-height: 19px; }
.of-rans span { font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--of-muted-fg); }
.of-rans b { font-weight: 500; overflow-wrap: anywhere; }
.of-rwho { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

/* Cargando: 4 barras de 12 px y 2 bloques de 44 px */
.of-rsk { display: flex; flex-direction: column; gap: 8px; }
.of-rsk .of-sk { display: block; height: 12px; border-radius: 4px; }
.of-rsk .of-sk.is-big { height: 44px; border-radius: 8px; width: 100%; }
`;
