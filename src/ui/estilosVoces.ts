// Estilos de «Quién habla» y «Voces de los agentes» (0.11.0, JST-325): los del
// prototipo de JST-324 (`voces-elegir-a.estilos.css`, clases `vz-*`) con los tokens
// `--of-*` de `estilos.ts`.
export const CSS_VOCES = /* css */ `
/* ---------- «Quién habla» (A y B, en el panel «Voces») ---------- */
.vz-qh { display: flex; flex-direction: column; gap: 2px; }
.vz-qh + .of-vz-cab { margin-top: 4px; }
.vz-cab1 { display: block !important; margin-bottom: 0 !important; }
.vz-q { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; column-gap: 10px; min-height: 40px; padding: 4px 6px 4px 8px; border-radius: 7px;
  box-sizing: border-box; width: 100%; border: 0; background: transparent; color: var(--of-fg); text-align: left; font: inherit; }
.vz-q > svg { color: var(--of-muted-fg); }
.vz-q-t { display: flex; flex-direction: column; min-width: 0; line-height: 18px; }
.vz-q-t b { font-weight: 500; }
.vz-q-t em { font-style: normal; font-size: 12px; line-height: 16px; color: var(--of-muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vz-q.is-link { cursor: pointer; }
.vz-q.is-link:hover { background: var(--of-hover-strong); }
.vz-q.is-link:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 1px; }
.vz-q-go { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; font-weight: 500; color: var(--of-muted-fg); }
.vz-q.is-link:hover .vz-q-go { color: var(--of-fg); }

/* El disparador: «Catalina ▾» */
.vz-sel { display: inline-flex; align-items: center; gap: 6px; height: 28px; max-width: 176px; padding: 0 8px 0 10px; border-radius: 8px; border: 1px solid var(--of-input); background: transparent;
  color: var(--of-fg); font-family: inherit; font-size: 12.5px; font-weight: 500; line-height: 1; cursor: pointer; }
.vz-sel:hover { background: var(--of-hover-strong); }
.vz-sel.is-open { border-color: var(--of-s-toca); box-shadow: 0 0 0 1px var(--of-s-toca); }
.vz-sel:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 2px; }
.vz-sel.is-ancho { max-width: none; width: 100%; height: 32px; justify-content: space-between; }
.vz-sel-t { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vz-sel.is-ancho .vz-sel-t { flex: 1; text-align: left; }
.vz-sel > svg:last-child { color: var(--of-muted-fg); flex: none; }
/* Mientras graba la voz nueva, el loader ocupa el lugar del chevron: el nombre («Clon #42») se lee entero. */
.vz-sel.is-gira { padding-right: 10px; }
.vz-sel.is-gira > svg:last-child { display: none; }

/* La lista de voces: se abre bajo su fila */
.vz-lista { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 6px; padding: 4px; border-radius: 10px; border: 1px solid var(--of-border); background: color-mix(in srgb, var(--of-muted) 55%, var(--of-popover)); }
.vz-gt { padding: 6px 8px 2px; font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--of-muted-fg); }
.vz-op { display: flex; align-items: center; gap: 4px; border-radius: 7px; }
.vz-op:hover:not(.is-off) { background: var(--of-hover-strong); }
.vz-op-b { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 10px; padding: 6px 8px; border: 0; background: transparent; color: var(--of-fg); text-align: left; font: inherit; cursor: pointer; border-radius: 7px; }
.vz-op-b:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.vz-rd { width: 16px; height: 16px; flex: none; margin-top: 1px; border-radius: 50%; border: 1.5px solid var(--of-border-strong); display: grid; place-items: center; box-sizing: border-box; }
.vz-rd i { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
.vz-op.is-on .vz-rd { background: var(--of-s-toca); border-color: var(--of-s-toca); }
.vz-op-t { display: flex; flex-direction: column; min-width: 0; line-height: 18px; }
.vz-op-t b { font-weight: 500; display: flex; align-items: baseline; gap: 6px; }
.vz-op-t em { font-style: normal; font-size: 12px; line-height: 16px; color: var(--of-muted-fg); }
.vz-op-t em svg { vertical-align: -2px; }
.vz-num { font-size: 11px; font-weight: 500; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; }
.vz-op.is-off .vz-op-b { cursor: not-allowed; }
.vz-op.is-off .vz-op-t b, .vz-op.is-off .vz-rd { opacity: .5; }
.vz-op.is-off .vz-op-t em { color: var(--of-muted-fg); }
.vz-op.is-off .vz-op-t em svg { color: var(--of-s-trabaja, var(--of-muted-fg)); }
.vz-op.is-sk { padding: 8px; gap: 10px; }
.vz-sk { display: inline-block; height: 10px; width: 64px; border-radius: 5px; background: var(--of-border-strong); animation: vz-sk 1.2s ease-in-out infinite; vertical-align: middle; }
.vz-sk.is-l { width: 110px; height: 11px; margin: 3px 0; } .vz-sk.is-s { width: 160px; height: 9px; margin: 3px 0; }
@keyframes vz-sk { 50% { opacity: .45; } }

/* ▶ de cada voz: 32 × 32 (44 en el celular) */
.vz-play { width: 32px; height: 32px; flex: none; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--of-fg); cursor: pointer; }
.vz-play svg { fill: currentColor; }
.vz-play:hover { background: var(--of-hover-strong); }
.vz-play.is-on { background: var(--of-s-toca); color: #fff; }
.vz-play:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 1px; }
.vz-play.is-xs { width: 28px; height: 28px; border: 1px solid var(--of-input); }
.vz-play.is-xs.is-on { border-color: var(--of-s-toca); }
.vz-play-x { width: 32px; flex: none; }

/* «Volver a como estaba» y su confirmación; el error al guardar */
.vz-volver { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 28px; margin: 2px 0 0 2px; padding: 0 6px; border: 0; border-radius: 7px; background: transparent;
  color: var(--of-muted-fg); font-family: inherit; font-size: 12.5px; font-weight: 500; line-height: 1; cursor: pointer; }
.vz-volver:hover { color: var(--of-fg); background: var(--of-hover-strong); }
.vz-conf { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px; border-radius: 8px; background: var(--of-muted); font-size: 12.5px; line-height: 18px; }
.vz-conf b { font-weight: 600; }
.vz-conf-b { display: flex; justify-content: flex-end; gap: 6px; }
.vz-err { display: flex; align-items: center; gap: 8px; margin-top: 4px; padding: 8px 10px; border-radius: 8px; font-size: 12.5px; line-height: 17px;
  background: color-mix(in srgb, var(--of-s-error) 12%, transparent); color: var(--of-fg); }
.vz-err > svg { color: var(--of-s-error); flex: none; }
.vz-err > span { flex: 1; }
.vz-err b { font-weight: 600; }

/* ---------- A · «Voces de los agentes» (una página dentro del panel) ---------- */
.vz-pag-h { gap: 6px; margin: -4px 0 0 -6px; }
.vz-atras { width: 28px; height: 28px; border-color: transparent; }
.vz-cos { display: flex; flex-direction: column; gap: 6px; }
.vz-co { border: 1px solid var(--of-border); border-radius: 10px; overflow: hidden; }
.vz-co.is-open { border-color: var(--of-border-strong); }
.vz-co-h { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 0 10px 0 8px; border: 0; background: transparent; color: var(--of-fg); font: inherit; text-align: left; cursor: pointer; }
.vz-co-h:hover { background: var(--of-hover-strong); }
.vz-co-h > svg { color: var(--of-muted-fg); flex: none; }
.vz-co-h b { font-weight: 500; }
.vz-co-n { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; }
.vz-co-b { display: flex; flex-direction: column; gap: 1px; padding: 2px 4px 6px; border-top: 1px solid var(--of-border); }
.vz-ag { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; column-gap: 8px; min-height: 40px; padding: 2px 2px 2px 6px; border-radius: 7px; }
.vz-co-b .vz-ag:hover { background: var(--of-hover-strong); }
.vz-ag-c { position: relative; display: block; width: 16px; height: 22px; overflow: hidden; --px: 1; }
.vz-ag-t { display: flex; flex-direction: column; min-width: 0; line-height: 18px; }
.vz-ag-t b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vz-ag-t em { font-style: normal; font-size: 12px; line-height: 16px; color: var(--of-muted-fg); }
.vz-ag .vz-sel { max-width: 112px; }
.vz-prep { color: var(--of-s-toca-fg, var(--of-muted-fg)) !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vz-barra { display: block; height: 2px; margin-top: 3px; border-radius: 1px; background: var(--of-border-strong); overflow: hidden; }
.vz-barra i { display: block; height: 100%; background: var(--of-s-toca); transition: width .3s; }

/* ---------- Celular: objetivos de 44 px ---------- */
.of-hsheet .vz-q { min-height: 48px; }
.of-hsheet .vz-sel, .of-sheet .vz-sel { height: 36px; }
.of-hsheet .vz-play, .of-sheet .vz-play { width: 44px; height: 44px; }
.of-hsheet .vz-play.is-xs, .of-sheet .vz-play.is-xs { width: 36px; height: 36px; }
.of-hsheet .vz-op-b, .of-sheet .vz-op-b { padding: 9px 8px; }
.of-hsheet .vz-co-h { min-height: 48px; }
.of-hsheet .vz-ag { min-height: 48px; }
.of-hsheet .vz-ag .vz-sel { max-width: 104px; }
.of-hsheet .vz-volver, .of-sheet .vz-volver { height: 40px; }
.of-hsheet .vz-play-x { width: 44px; }
.vz-prep-f { display: flex; flex-direction: column; margin-top: -4px; font-size: 12px; line-height: 16px; }
.vz-prep-f .vz-barra { margin-top: 4px; }
.of-hsheet .vz-prep, .of-sheet .vz-prep { white-space: normal; }
.vz-prep-f .vz-prep { white-space: normal; }
.vz-subt-voz { flex: none; font-size: 12px; font-weight: 500; color: rgba(255,255,255,.62); padding-right: 10px; border-right: 1px solid rgba(255,255,255,.2); white-space: nowrap; }
.vz-nota { margin: 4px 0 0; font-size: 12px; line-height: 16px; color: var(--of-muted-fg); }
.vz-pag > p { margin: 0 0 8px; }
@media (prefers-reduced-motion: reduce) { .vz-barra i, .vz-sk { transition: none; animation: none; } }
`;
