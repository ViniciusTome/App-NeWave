// Técnica (educativos) no treino. Fica separada do gerador de propósito: o gerador
// só chama `montarTecnica` no aquecimento e no solto depois da velocidade, e o
// resultado vai junto com a parte (texto, metragem e tempo).
//
// - educativos.json: os educativos da planilha do treinador (por estilo e conteúdo;
//   saídas e viradas como sequência de passos).
// - treinador.json: as técnicas do treinador (palmateio máximo, menor número de
//   braçadas, respiração, apneia, ondulação submersa, mãos fechadas) e as séries de
//   fundamento (saída, virada).
// - regras.json: onde entra, quantas repetições, o descanso e o "foco do dia".
import { readFileSync } from 'node:fs'

const NIVEIS = ['iniciante', 'intermediario', 'avancado']
const ESTILOS = ['crawl', 'costas', 'peito', 'borboleta', 'medley']
const QUATRO = ['crawl', 'costas', 'peito', 'borboleta']
const ABREV = { crawl: 'CR', costas: 'CO', peito: 'PE', borboleta: 'BO', medley: 'MD' }
// Material que o app conhece (anamnese): quem tem não precisa do "se tiver"
const NO_APP = { prancha: 'prancha', boia: 'pull_buoy', paraquedas: 'paraquedas' }

const ler = (arquivo) => JSON.parse(readFileSync(new URL(arquivo, import.meta.url), 'utf8'))

// Confere os arquivos: ids únicos, estilos e níveis conhecidos, passos 1, 2, 3...
export function validarTecnica(itens) {
    const problemas = []
    const ids = new Set()
    const passos = new Map()
    for (const item of itens) {
        const onde = `técnica "${item.id}"`
        if (!item.id || ids.has(item.id)) problemas.push(`${onde}: id vazio ou repetido.`)
        ids.add(item.id)
        if (!Array.isArray(item.estilos) || item.estilos.length === 0 || item.estilos.some((e) => !ESTILOS.includes(e))) {
            problemas.push(`${onde}: estilos precisa ser uma lista com: ${ESTILOS.join(', ')}.`)
        }
        if (item.niveis && item.niveis.some((n) => !NIVEIS.includes(n))) problemas.push(`${onde}: níveis: ${NIVEIS.join(', ')}.`)
        if (!item.texto?.trim()) problemas.push(`${onde}: falta o texto.`)
        if (item.sequencia) passos.set(item.sequencia, [...(passos.get(item.sequencia) ?? []), item.passo])
    }
    for (const [sequencia, lista] of passos) {
        const ordem = [...lista].sort((a, b) => a - b)
        if (ordem.some((p, i) => p !== i + 1)) problemas.push(`sequência "${sequencia}": os passos precisam ser 1, 2, 3...`)
    }
    return problemas
}

export function loadTecnica() {
    const regras = ler('./regras.json')
    const itens = [...ler('./educativos.json'), ...ler('./treinador.json')]
    const problemas = validarTecnica(itens)
    if (problemas.length > 0) throw new Error(`Técnica com problemas:\n- ${problemas.join('\n- ')}`)
    const sequencias = new Map()
    for (const item of itens.filter((i) => i.sequencia)) {
        sequencias.set(item.sequencia, [...(sequencias.get(item.sequencia) ?? []), item].sort((a, b) => a.passo - b.passo))
    }
    return { regras, itens, sequencias }
}

// Estado entre os treinos: em que passo de cada sequência o atleta está e quantos
// solto já teve (o foco do dia é um sim, um não). Continua do plano dos treinos já feitos.
export function estadoDaTecnica(historico = []) {
    const estado = { passos: {}, soltos: 0 }
    for (const treino of historico) {
        for (const r of treino.plan?.tecnica ?? []) {
            if (r.sequencia) estado.passos[r.sequencia] = Math.max(estado.passos[r.sequencia] ?? 0, r.passo)
            if (r.parte === 'solto') estado.soltos++
        }
    }
    return estado
}

function sorteia(opcoes, random) {
    const total = opcoes.reduce((s, o) => s + o.peso, 0)
    let r = random() * total
    for (const o of opcoes) {
        r -= o.peso
        if (r < 0) return o.item
    }
    return opcoes.at(-1)?.item
}

// Monta a técnica de uma parte. `parte` = 'aquecimento' ou 'solto' (o solto depois
// da velocidade). Devolve null quando não entra (aula curta, nada serve).
// { texto, metros, segundos, registro }
export function montarTecnica({ tecnica, athlete, parte, pace = 120, random = Math.random, recentes = null, estado = null }) {
    const { regras, itens, sequencias } = tecnica
    const cfg = parte === 'aquecimento' ? regras.partes.aquecimento : regras.partes.soltoDepoisDaVelocidade
    if (!cfg || (athlete.sessionMinutes ?? 0) < cfg.apartirDeMinutos) return null
    const nivel = athlete.level ?? 'iniciante'
    const nada = new Set(athlete.strokes?.length ? athlete.strokes : ['crawl'])
    const equipamento = new Set(athlete.equipment ?? [])
    const estilosDo = (item) => (item.estilos.includes('medley')
        ? (QUATRO.every((e) => nada.has(e)) ? ['medley'] : [])
        : item.estilos.filter((e) => nada.has(e)))
    const serve = (item) => (!item.niveis || item.niveis.includes(nivel)) &&
        (item.material ?? []).every((m) => equipamento.has(m)) && estilosDo(item).length > 0
    const pesoDoEstilo = (e) => (e === athlete.estiloDaProva ? 3 : e === 'crawl' ? regras.pesoDoCrawl ?? 1 : 1)
    const vezes = (item) => recentes?.vezes(`tec:${item.id}`) ?? 0

    // No solto, um treino sim, um não: o foco do dia (saída ou virada)
    let escolha = null
    if (parte === 'solto' && estado) {
        estado.soltos++
        if (estado.soltos % (regras.focoDoDia?.aCadaTreinos ?? 2) === 0) escolha = focoDoDia()
    }
    if (!escolha) {
        const candidatos = itens.filter((i) => !i.sequencia && i.conteudo !== 'fundamento' && serve(i))
        const menos = Math.min(...candidatos.map(vezes))
        const livres = candidatos.filter((i) => vezes(i) === menos) // sem repetir os dos últimos treinos
        const item = sorteia(livres.map((i) => ({ item: i, peso: Math.max(...estilosDo(i).map(pesoDoEstilo)) })), random)
        if (item) escolha = { item, tipo: 'educativo' }
    }
    if (!escolha) return null

    const { item } = escolha
    const estilo = sorteia(estilosDo(item).map((e) => ({ item: e, peso: pesoDoEstilo(e) })), random)
    let repeticoes = item.formato?.repeticoes ?? (escolha.tipo === 'passo' ? 4 : regras.repeticoes[nivel] ?? 4)
    let distancia = item.formato?.distancia ?? regras.distancia
    // Piscina de 50 m: o educativo de 25 m vira 50 m (metade das repetições)
    if (athlete.poolLength === 50 && distancia === 25) {
        distancia = 50
        repeticoes = Math.max(2, Math.ceil(repeticoes / 2))
    }
    const descanso = item.formato?.descanso ?? regras.descanso
    const seTiver = (item.seTiver ?? []).filter((m) => !(NO_APP[m] && equipamento.has(NO_APP[m])))
    const extra = seTiver.length > 0 ? ` (se tiver ${seTiver.join(' ou ')})` : ''
    const serie = `${repeticoes} x ${distancia} m`
    const fim = `D${descanso}" de descanso`
    let texto
    if (escolha.tipo === 'passo') {
        const nome = regras.nomes?.[item.conteudo] ?? item.conteudo
        texto = `Foco do dia · ${nome}${item.nomeDaSequencia ? ` (${item.nomeDaSequencia.toLowerCase()})` : ''}, ` +
            `passo ${item.passo} de ${escolha.total} · ${serie} · ${ABREV[estilo]}: ${item.texto}${extra} · ${fim}`
    } else if (escolha.tipo === 'fundamento') {
        texto = `Foco do dia · ${regras.nomes?.[item.fundamento] ?? item.fundamento} · ${serie} · ${ABREV[estilo]}: ${item.texto}${extra} · ${fim}`
    } else {
        texto = `Técnica · ${serie} · ${ABREV[estilo]}: ${item.texto}${extra} · ${fim}`
    }
    recentes?.add(`tec:${item.id}`)
    if (escolha.tipo === 'passo') estado.passos[item.sequencia] = item.passo
    const metros = repeticoes * distancia
    // Educativo é mais devagar que o nado normal (~40% a mais)
    const segundos = Math.round(repeticoes * ((distancia / 100) * pace * 1.4 + descanso))
    return {
        texto, metros, segundos,
        registro: { parte, id: item.id, estilo, ...(escolha.tipo === 'passo' && { sequencia: item.sequencia, passo: item.passo }) },
    }

    // Próximo passo de uma sequência (saída, virada...) ou uma série do fundamento
    function focoDoDia() {
        const opcoes = []
        for (const [sequencia, passos] of sequencias) {
            if (!serve(passos[0]) && !passos.some(serve)) continue
            const feito = estado.passos[sequencia] ?? 0
            const proximo = passos.find((p) => p.passo > feito && serve(p))
            if (proximo) opcoes.push({ item: { item: proximo, tipo: 'passo', total: passos.length }, peso: regras.focoDoDia?.pesoDosPassos ?? 1 })
        }
        for (const item of itens.filter((i) => i.conteudo === 'fundamento' && serve(i))) {
            opcoes.push({ item: { item, tipo: 'fundamento' }, peso: regras.focoDoDia?.pesoDasSeries ?? 1 })
        }
        return opcoes.length > 0 ? sorteia(opcoes, random) : null
    }
}
