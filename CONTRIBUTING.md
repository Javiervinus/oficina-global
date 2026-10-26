# Contributing to Oficina global

*[Leer en español](CONTRIBUTING.es.md)*

Thanks for helping. Issues and pull requests can be in English or Spanish.

## How changes get in

1. Fork the repository and create a branch from `main`.
2. Make your change and run, with Node 22.14 or later:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   ```

3. If your change touches the plugin (anything besides docs, tests or `.github/`), bump the version in `package.json` in the same pull request:

   ```sh
   npm version patch --no-git-tag-version   # a fix
   npm version minor --no-git-tag-version   # something new
   ```

4. Open a pull request against `main`. GitHub Actions runs the tests, the type check, the build and checks the version. The first time you contribute, a maintainer has to allow the checks to run.
5. A maintainer reviews it. Nothing reaches `main` without a pull request, and only maintainers merge.

## Releases

Merging a pull request into `main` is the release: if `package.json` has a version that is not on npm yet, the [Publish to npm](.github/workflows/publish.yml) workflow builds it, tests it and publishes it to npm with provenance (npm trusted publishing, no tokens), then creates the `vX.Y.Z` GitHub Release. If the version did not change, it publishes nothing.

## Good to know

- The maintainers work in an internal workspace and bring each change here as a pull request; their commits start with an internal issue id (`JST-123: …`). Code comments are in Spanish and mention those issues too.
- The logic in `src/` stays free of React and the DOM, and it has tests in `tests/`; the interface is in `src/ui/`.
- `src/instancia.ts` is empty on purpose: it is where each instance sets its own agents' fixed characters and name pronunciations. Please don't add data from your instance.
- Never commit tokens, emails, server addresses or task titles from a real Paperclip instance.

By contributing you agree that your contribution is licensed under the [MIT](LICENSE) license.
