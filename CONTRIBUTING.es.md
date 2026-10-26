# Contribuir a la Oficina global

*[Read in English](CONTRIBUTING.md)*

Gracias por ayudar. Los issues y pull requests pueden ir en español o en inglés.

## Cómo entra un cambio

1. Haz un fork del repositorio y una rama desde `main`.
2. Haz tu cambio y corre, con Node 22.14 o más nuevo:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   ```

3. Si tu cambio toca el plugin (cualquier cosa fuera de textos, pruebas o `.github/`), sube la versión de `package.json` en el mismo pull request:

   ```sh
   npm version patch --no-git-tag-version   # un arreglo
   npm version minor --no-git-tag-version   # algo nuevo
   ```

4. Abre un pull request contra `main`. GitHub Actions corre las pruebas, los tipos y el build, y revisa la versión. La primera vez que contribuyes, un mantenedor tiene que autorizar que corran.
5. Un mantenedor lo revisa. Nada llega a `main` sin pull request, y solo los mantenedores fusionan.

## Versiones

Fusionar un pull request en `main` es publicar: si `package.json` trae una versión que todavía no está en npm, el workflow [Publish to npm](.github/workflows/publish.yml) la arma, la prueba y la publica en npm con procedencia (trusted publishing de npm, sin tokens), y crea el Release `vX.Y.Z` en GitHub. Si la versión no cambió, no publica nada.

## Para saber

- Los mantenedores trabajan en un espacio interno y traen cada cambio aquí como pull request; sus commits empiezan con el código de una tarea interna (`JST-123: …`). Los comentarios del código están en español y también nombran esas tareas.
- La lógica de `src/` va sin React ni DOM y tiene pruebas en `tests/`; la interfaz está en `src/ui/`.
- `src/instancia.ts` va vacío a propósito: ahí cada instancia pone el personaje fijo de sus agentes y cómo se pronuncian sus nombres. No agregues datos de tu instancia.
- Nunca subas tokens, correos, direcciones de servidores ni títulos de tareas de una instancia real de Paperclip.

Al contribuir aceptas que tu aporte queda con la licencia [MIT](LICENSE).
