// Estilos de la 0.3.4 «De qué se trata cada tarea» (design-spec de JST-138, C ·
// Rótulo de la sala): el rótulo de cada sala, el de 1x bajo el piso, el anillo
// dorado del globo del que habla y el texto al pasar el mouse con el nombre
// completo. El rótulo se ve igual en tema oscuro y claro (§3.2). Todo en
// pixeles de arte por `--px`, como el resto del piso.
export const CSS_ROTULO = /* css */ `
/* Rótulo de la sala (§3.1 y §3.2): encima del piso, los muebles y los personajes; debajo de los globos */
.of-ro { position: absolute; z-index: 850; box-sizing: border-box;
  left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px); width: calc(var(--w) * var(--px) * 1px); height: calc(10px * var(--px));
  display: flex; align-items: center; gap: calc(1px * var(--px)); padding: 0 calc(2px * var(--px)) 0 calc(2.5px * var(--px));
  background: rgba(22, 18, 28, .9); color: #f4f1ea; border: 1px solid var(--of-room-line); border-left: calc(1px * var(--px)) solid #e2b23c;
  border-radius: calc(2px * var(--px)); box-shadow: 0 1px 0 var(--of-room-line);
  font-size: calc(4px * var(--px) + 3px); font-weight: 500; line-height: 1; letter-spacing: 0; white-space: nowrap; cursor: default; transition: opacity .2s; }
.of-ro:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 2px; }
.of-tvb .of-piso.is-x3 .of-ro { font-size: 16px; }
.of-tvb .of-piso.is-x2 .of-ro { font-size: 12px; }
.of-ro-in { display: flex; align-items: center; gap: calc(1.5px * var(--px)); flex: 1; min-width: 0; height: 100%; animation: of-ro-in .25s ease-out; }
@keyframes of-ro-in { from { opacity: 0; } }
.of-rm .of-ro-in { animation: none; }
/* Con la pestaña oculta, en pausa y no «none»: al volver, quitar «none» haría el fundido de nuevo en todos (JST-158) */
.of-oculta .of-ro-in { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .of-ro-in { animation: none; } }
.of-ro svg.of-i { flex: none; width: calc(4px * var(--px) + 3px); height: calc(4px * var(--px) + 3px); }
.of-ro-in.is-toca svg.of-i { color: #c4b5fd; }
.of-ro-in.is-trabaja svg.of-i, .of-ro-in.is-cola svg.of-i { color: #93c5fd; }
.of-ro-in.is-sobre svg.of-i { color: #e2b23c; }
.of-ro-in.is-charla svg.of-i, .of-ro-in.is-libre svg.of-i, .of-ro-in.is-pausa svg.of-i { color: #d1d5db; }
.of-ro-in.is-error svg.of-i { color: #fca5a5; }
/* 0.5.0 (JST-163): «✓ listo» en verde, la entrega en dorado, y la hora estimada en una pastilla a la derecha */
.of-ro-in.is-listo svg.of-i { color: #86efac; }
.of-ro-in.is-listo .of-ro-cod { background: #16a34a; color: #fff; }
.of-ro-in.is-entrega svg.of-i { color: #e2b23c; }
.of-ro-eta { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: calc(.5px * var(--px) + 1px) calc(1px * var(--px) + 1px);
  border-radius: 3px; background: rgba(255, 255, 255, .14); color: #f4f1ea; font-weight: 600; font-size: .92em; font-variant-numeric: tabular-nums; }
.of-ro .of-ro-eta svg.of-i { width: 1em; height: 1em; color: inherit; }
.of-ro-eta.is-lleva { color: #dcd6cc; }
.of-ro-cod { flex: none; font: 600 .94em/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #fffdf7; color: #2a2230;
  padding: calc(.5px * var(--px) + 1px) calc(1px * var(--px) + 1px); border-radius: 3px; }
.of-ro-in.is-toca .of-ro-cod { background: #7c3aed; color: #fff; }
.of-ro em { flex: none; font: 600 1em/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-style: normal; color: #c4b5fd; margin-left: -2px; }
/* El nombre ocupa lo que queda de la línea: se corta por palabras (§5) y, de red de seguridad, con «…» del navegador */
.of-ro-t { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* El nombre del agente (1x) no se come la línea: con un nombre largo se corta con «…» y deja lugar a la tarea */
.of-ro-quien { flex: 0 1 auto; min-width: 0; max-width: 32%; overflow: hidden; text-overflow: ellipsis; font-weight: 600; color: #fff; }
.of-ro .of-cotag { flex: none; }
/* Quieto (mouse o foco encima, o movimiento reducido): ‹ › a la derecha (§3.5) */
.of-ro-nav { flex: none; display: flex; gap: 2px; margin-left: auto; }
.of-ro-nav button { display: grid; place-items: center; width: calc(7px * var(--px)); height: calc(7px * var(--px)); padding: 0; border: 0; border-radius: 3px;
  background: rgba(255, 255, 255, .12); color: #f4f1ea; cursor: pointer; }
.of-ro-nav button:hover { background: rgba(255, 255, 255, .24); }
.of-ro-nav button:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 1px; }
.of-ro-nav svg.of-i { width: calc(4px * var(--px) + 2px); height: calc(4px * var(--px) + 2px); }
/* Pantallas táctiles: sin ‹ › (tocar el rótulo pasa al siguiente) y con 44 px que se pueden tocar, sin dibujarse.
   La zona crece 12 px más allá del borde: el ::before se mide desde adentro del borde de 1 px, de ahí los 13 */
@media (hover: none) {
  .of-ro-nav { display: none; }
  .of-ro::before { content: ""; position: absolute; left: 0; right: 0; top: -13px; bottom: -13px; }
}
/* Con un estado resaltado, el rótulo baja como todo lo que no se resalta (§3.2) */
.of[data-hl] .of-ro { opacity: .35; }

/* A 1x (widget, piso entero del celular): un solo rótulo bajo el piso (§3.6), del ancho del piso aunque el piso se
   salga de su contenedor, como en el celular (JST-154) */
.of-ro.is-piso { --px: 2; position: relative; left: auto; top: auto; height: 30px; margin-top: -2px; align-self: center;
  font-size: 12px; padding: 0 10px; border-left-width: 3px; border-radius: 6px; }
.of-wb .of-ro.is-piso { margin-top: -4px; }
.of-tvb .of-ro.is-piso { margin-top: 0; }
.of-ro.is-piso .of-ro-in { gap: 6px; }
.of-ro.is-piso svg.of-i { width: 13px; height: 13px; }
.of-ro.is-piso .of-ro-cod { padding: 2px 4px; }
.of-ro.is-piso .of-ro-nav button { width: 18px; height: 18px; }
.of-ro.is-piso .of-ro-nav svg.of-i { width: 12px; height: 12px; }

/* El anillo dorado en el globo del que habla el rótulo (§3.2) */
.of-bub.is-anillo { box-shadow: 0 0 0 1px var(--of-room-line), 0 0 0 calc(1px * var(--px) + 1px) #e2b23c; }

/* Texto al pasar el mouse: el nombre completo de la tarea, en varias líneas si hace falta (§4) */
.of-tip { white-space: normal; max-width: 320px; }
`;
