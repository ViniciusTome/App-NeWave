// Termos do glossário (src/data/glossario.json) que aparecem num treino.
import glossario from '../data/glossario.json'

const escape = (texto) => texto.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

// Acha o termo no texto do treino. Siglas em maiúsculas (CR, PE, NAD) precisam
// estar escritas igual; palavras ("solto", "forte") valem com qualquer caixa.
function appearsIn(termo, texto) {
    if (termo.detectar === false) return false
    if (typeof termo.detectar === 'string') return new RegExp(termo.detectar, 'u').test(texto)
    return termo.sigla.split(' / ').some((token) => {
        const flags = token === token.toUpperCase() ? 'u' : 'iu'
        return new RegExp(`(?<![\\p{L}\\p{N}])${escape(token)}(?![\\p{L}\\p{N}])`, flags).test(texto)
    })
}

// Termos do glossário que aparecem no treino, na ordem do glossário
export function termsInTraining(training) {
    const texto = (training.partes ?? [])
        .map((p) => [p.titulo, p.texto, p.observacao].filter(Boolean).join('\n'))
        .join('\n')
    return glossario.flatMap((categoria) => categoria.termos).filter((t) => appearsIn(t, texto))
}
