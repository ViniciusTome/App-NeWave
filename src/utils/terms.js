// Termos que aparecem no texto dos treinos: a abreviação, o nome por extenso (para a 1ª
// preparação do atleta: "com pé de pato (c/PÉ)") e o termo do glossário (o ícone "?").
// A ordem importa: os mais longos primeiro.
import glossario from '../data/glossario.json'

const MATERIAL = { 'PÉ de peito': 'pé de pato de peito', PÉ: 'pé de pato', PALM: 'palmar', BOIA: 'pull buoy', SNK: 'snorkel', PARA: 'paraquedas' }
const GLOSSARIO_DO_MATERIAL = { 'PÉ de peito': 'Pé de pato de peito', PÉ: 'c/PÉ', PALM: 'c/PALM', BOIA: 'BOIA', SNK: 'SNK', PARA: 'PARA' }
const NADO = { CR: 'crawl', CO: 'costas', PE: 'peito', BO: 'borboleta', MD: 'medley', ME: 'melhor estilo' }
const RITMO = { A1: 'leve', A2: 'moderado', A3: 'forte' }

// [regex, (match) => ({ extenso, sigla do glossário })]
const REGRAS = [
    // (os ritmos entre parênteses no card, ex.: "(NEG)", ficam sem os parênteses duplos)
    [/\(?(\d+) NAD x 25 fo\)?/u, (m) => ({ extenso: `${m[1]} m nadando e 25 m forte (${m[1]} NAD x 25 fo)`, sigla: '75 NAD x 25 fo' })],
    [/(c\/)?(PÉ de peito|PÉ|PALM|BOIA|SNK|PARA)(?![\p{L}])/u, (m) => ({
        extenso: `${m[1] ? 'com ' : ''}${MATERIAL[m[2]]} (${m[0]})`, sigla: GLOSSARIO_DO_MATERIAL[m[2]],
    })],
    [/a\/c ((?:\d+')?(?:\d+")?)/u, (m) => ({ extenso: `saída a cada ${m[1]} (a/c)`, sigla: 'a/c' })],
    [/D(\d+['"](?:\d+")?(?: a \d+['"])?) de descanso/u, (m) => ({ extenso: `descanso de ${m[1]} (D)`, sigla: 'D20" de descanso' })],
    [/c\/(\d+'(?:\d+")?(?: a \d+')?) de intervalo/u, (m) => ({ extenso: `intervalo de ${m[1]} entre as séries`, sigla: "c/2' de intervalo" })],
    [/\(?(\d+) AC\b\)?/u, (m) => ({ extenso: `${m[1]} acima (${m[1]} AC)`, sigla: 'AC' })],
    [/\(?sai\/che\)?/u, () => ({ extenso: 'saída e chegada (sai/che)', sigla: 'sai/che' })],
    [/T\/(\d+)/u, (m) => ({ extenso: `trocando a cada ${m[1]} m (T/${m[1]})`, sigla: 'T/25' })],
    [/\bRP\b/u, () => ({ extenso: 'ritmo de prova (RP)', sigla: 'RP' })],
    [/\(?\b(NEG|POS)\b\)?/u, (m) => ({ extenso: `${m[1] === 'NEG' ? 'negativo' : 'positivo'} (${m[1]})`, sigla: m[1] })],
    [/\bNAD\b/u, () => ({ extenso: 'nadando (NAD)', sigla: 'NAD' })],
    [/\b(CR|CO|PE|BO|MD|ME)\b(?!\d)/u, (m) => ({ extenso: `${NADO[m[1]]} (${m[1]})`, sigla: m[1] })],
    [/\b(PR|BR)\b/u, (m) => ({ extenso: `${m[1] === 'PR' ? 'perna' : 'braçada'} (${m[1]})`, sigla: m[1] })],
    [/\b(A[123])\b/u, (m) => ({ extenso: `${RITMO[m[1]]} (${m[1]})`, sigla: m[1] })],
    [/máx/u, () => ({ extenso: 'máximo (máx)', sigla: 'máx' })],
]

const porSigla = new Map(glossario.flatMap((c) => c.termos).map((t) => [t.sigla, t]))
export const glossaryTerm = (sigla) => porSigla.get(sigla) ?? null

// Divide o texto em pedaços: texto comum (string) ou termo { texto, extenso, termo }
export function splitTerms(texto) {
    const pedacos = []
    let resto = texto
    while (resto) {
        let melhor = null
        for (const [re, fazer] of REGRAS) {
            const m = re.exec(resto)
            if (m && (!melhor || m.index < melhor.m.index || (m.index === melhor.m.index && m[0].length > melhor.m[0].length))) melhor = { m, fazer }
        }
        if (!melhor) {
            pedacos.push(resto)
            break
        }
        const { m, fazer } = melhor
        if (m.index > 0) pedacos.push(resto.slice(0, m.index))
        const { extenso, sigla } = fazer(m)
        pedacos.push({ texto: m[0], extenso, termo: glossaryTerm(sigla) })
        resto = resto.slice(m.index + m[0].length)
    }
    return pedacos
}
