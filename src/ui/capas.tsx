// Capas flotantes (ficha, tooltip y avisos breves). Van en un portal sobre
// `document.body` para que ningún contenedor del host las recorte; el
// envoltorio `.of-layer` les da los tokens del plugin. En el modo TV van
// dentro de la vista TV, porque en pantalla completa solo se ve ese elemento.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Capa({ children, dentro }: { children: ReactNode; dentro?: HTMLElement | null }) {
  return createPortal(<div className="of-layer">{children}</div>, dentro ?? document.body);
}

// ---------------------------------------------------------------------------
// Esc cierra la capa de más arriba (design-spec de JST-95 §5 y §11): el
// permiso o el panel del encabezado, después la ventana, después la ficha y,
// en el TV, por último sale del TV.
// ---------------------------------------------------------------------------

const pilaEsc: Array<{ fn: () => void }> = [];
let escuchandoEsc = false;

function alEsc(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  const arriba = pilaEsc.at(-1);
  if (!arriba) return;
  e.preventDefault();
  arriba.fn();
}

/** Mientras `activo`, Esc llama a `fn` si esta es la capa de más arriba (la última que se abrió). */
export function useEsc(activo: boolean, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!activo) return;
    if (!escuchandoEsc) {
      document.addEventListener("keydown", alEsc);
      escuchandoEsc = true;
    }
    const capa = { fn: () => ref.current() };
    pilaEsc.push(capa);
    return () => {
      const i = pilaEsc.indexOf(capa);
      if (i >= 0) pilaEsc.splice(i, 1);
    };
  }, [activo]);
}

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Lo enfocable dentro de `el`, en orden. */
export function enfocables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(ENFOCABLES)).filter((x) => !x.closest("[inert]") && x.offsetParent !== null);
}

/** El foco no sale de `ref` mientras está abierto (Tab y Mayús+Tab dan la vuelta). */
export function useAtraparFoco(ref: { current: HTMLElement | null }, activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    const tecla = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== "Tab" || !el) return;
      const lista = enfocables(el);
      if (lista.length === 0) return;
      const primero = lista[0]!;
      const ultimo = lista.at(-1)!;
      const dentro = el.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === primero || !dentro)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [ref, activo]);
}

// ---------------------------------------------------------------------------
// Tooltip al pasar el mouse (computador): la misma frase del `aria-label`
// ---------------------------------------------------------------------------

interface Tip {
  texto: string;
  rect: DOMRect;
}

export function useTooltip(activo: boolean) {
  const [tip, setTip] = useState<Tip | null>(null);
  const onMouseOver = useCallback(
    (e: ReactMouseEvent) => {
      if (!activo) return;
      const el = (e.target as Element).closest<HTMLElement>("[data-tip]");
      if (!el) {
        setTip(null);
        return;
      }
      const texto = el.dataset.tip ?? "";
      setTip((prev) => (prev && prev.texto === texto ? prev : { texto, rect: el.getBoundingClientRect() }));
    },
    [activo],
  );
  const onMouseLeave = useCallback(() => setTip(null), []);
  return { tip, handlers: { onMouseOver, onMouseLeave }, ocultar: () => setTip(null) };
}

export function Tooltip({ tip, dentro }: { tip: Tip | null; dentro?: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const r = tip.rect;
    const left = Math.min(innerWidth - el.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - el.offsetWidth / 2));
    const top = Math.max(8, r.top - el.offsetHeight - 6);
    if (!pos || pos.left !== left || pos.top !== top) setPos({ left, top });
  });
  if (!tip) return null;
  return (
    <Capa dentro={dentro}>
      <div ref={ref} className="of-tip" role="tooltip" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
        {tip.texto}
      </div>
    </Capa>
  );
}

// ---------------------------------------------------------------------------
// Avisos breves (toasts)
// ---------------------------------------------------------------------------

export function useAvisos() {
  const [avisos, setAvisos] = useState<Array<{ id: number; contenido: ReactNode }>>([]);
  const siguiente = useRef(0);
  const mostrar = useCallback((contenido: ReactNode, ms = 3200) => {
    const id = ++siguiente.current;
    setAvisos((lista) => [...lista, { id, contenido }]);
    setTimeout(() => setAvisos((lista) => lista.filter((a) => a.id !== id)), ms);
  }, []);
  return { avisos, mostrar };
}

export function Avisos({ avisos, dentro }: { avisos: Array<{ id: number; contenido: ReactNode }>; dentro?: HTMLElement | null }) {
  if (avisos.length === 0) return null;
  return (
    <Capa dentro={dentro}>
      <div className="of-toasts" role="status">
        {avisos.map((a) => (
          <div key={a.id} className="of-toast">
            {a.contenido}
          </div>
        ))}
      </div>
    </Capa>
  );
}
