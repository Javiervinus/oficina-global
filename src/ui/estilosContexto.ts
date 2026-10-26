// Estilos de «Leer contexto» en la barra de arriba (JST-276, design-spec de
// JST-282 rev 2 §3 a §5): los del prototipo `propuesta-a.html` (`.lc-a*`) con el
// prefijo `of-ctx` (`.of-lc` ya es de los personajes del descanso) y los tokens
// `--of-*` de `estilos.ts`. El botón va en la barra de Paperclip dentro de un
// `.of-layer` (para tener los tokens); el panel «sin voz» y el aviso del
// celular, en una capa sobre la página.
export const CSS_CONTEXTO = /* css */ `
.of-ctxw { position: relative; display: inline-flex; align-items: center; flex: none; }
.of-ctx { height: 30px; min-width: 132px; display: inline-flex; align-items: center; gap: 7px; padding: 0 10px 0 9px; border: 1px solid var(--of-input); border-radius: 8px;
  background: transparent; color: var(--of-fg); font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer; }
.of-ctx > svg.of-i { width: 15px; height: 15px; flex: none; }
.of-ctx:hover { background: var(--of-hover-strong); }
.of-ctx.is-cargando { cursor: progress; }
.of-ctx.is-cargando > svg.of-i { color: var(--of-muted-fg); }
.of-ctx.is-leyendo { background: var(--of-muted); border-color: var(--of-border-strong); }
.of-ctx-n { margin-left: auto; padding-left: 6px; font-size: 12px; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; }
.of-ctx.is-fin > svg.of-i { color: var(--of-st-done); }
.of-ctx.is-error > svg.of-i { color: var(--of-s-error); }
.of-ctx.is-error .of-ctx-t { color: var(--of-danger-fg); }
/* Celular: solo el ícono, 44 × 44 (como el «Resumen» de la barra en la Oficina, .of-rstop) */
.of-ctx.is-m { min-width: 0; width: 44px; height: 44px; padding: 0; justify-content: center; border: 0; margin-right: -4px; }
.of-ctx.is-m > svg.of-i { width: 19px; height: 19px; }
.of-ctx.is-m:hover { background: transparent; }
.of-ctx.is-m.is-leyendo, .of-ctx.is-m.is-cargando { background: var(--of-muted); }

/* Sin voz en español: todas las frases, escritas, bajo el botón (computador) o bajo la barra (celular) */
.of-ctx-esc { position: fixed; z-index: 1150; width: 380px; max-width: calc(100vw - 16px); max-height: 340px; overflow: auto; padding: 6px 8px 8px; background: var(--of-popover);
  border: 1px solid var(--of-border-strong); border-radius: 12px; box-shadow: var(--of-shadow-pop); font-size: 13.5px; line-height: 20px; color: var(--of-fg); text-align: left; }
.of-ctx-eh { display: flex; align-items: flex-start; gap: 8px; padding: 6px 2px 8px 6px; font-size: 12.5px; line-height: 17px; color: var(--of-muted-fg); }
.of-ctx-eh > svg { margin-top: 1px; flex: none; }
.of-ctx-eh b { color: var(--of-fg); font-weight: 500; }
.of-ctx-eh > span { flex: 1; }
.of-ctx-eh .of-ibtn { width: 26px; height: 26px; margin: -4px -2px 0 0; flex: none; }
.of-ctx-esc p { margin: 0; padding: 5px 8px 5px 10px; border-radius: 8px; position: relative; }
.of-ctx-esc p.is-fut { color: var(--of-muted-fg); }
.of-ctx-esc p.is-cur { background: var(--of-hover-strong); }
.of-ctx-esc p.is-cur::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: var(--of-fg); }
.of-ctx-esc.is-m { width: auto; max-width: none; max-height: 52vh; font-size: 14px; }
.of-ctx-esc.is-m .of-ctx-eh .of-ibtn { width: 44px; height: 44px; margin: -12px -6px -8px 0; }

/* Celular: «No se pudo», 8 px bajo la barra, 4 s */
.of-ctx-toast { position: fixed; z-index: 1150; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--of-popover); border: 1px solid var(--of-danger-border);
  box-shadow: var(--of-shadow-pop); font-size: 13.5px; line-height: 19px; color: var(--of-fg); }
.of-ctx-toast > svg { color: var(--of-s-error); flex: none; }
`;
