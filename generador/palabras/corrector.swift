// Lee palabras (una por línea) y escribe las que el corrector de macOS da por
// buenas en español (JST-251). Lo usa `armar_palabras.mjs`: así la lista no trae
// faltas de los subtítulos («tambien», «aqui»), nombres («john») ni palabras
// inventadas («solven»).
import AppKit

let corrector = NSSpellChecker.shared
let idioma = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "es"
if !corrector.availableLanguages.contains(idioma) {
  FileHandle.standardError.write("El corrector de macOS no tiene «\(idioma)»: \(corrector.availableLanguages)\n".data(using: .utf8)!)
  exit(2)
}
while let palabra = readLine() {
  let mala = corrector.checkSpelling(of: palabra, startingAt: 0, language: idioma, wrap: false, inSpellDocumentWithTag: 0, wordCount: nil)
  if mala.location == NSNotFound { print(palabra) }
}
