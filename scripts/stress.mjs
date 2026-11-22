// Teste de estresse do gerador de treinos.
// Cria centenas de perfis de atleta (iniciante, intermediário e avançado, com e sem
// tempo, com e sem prova, piscinas, materiais, estilos, dias e tempos de aula
// diferentes), gera a periodização inteira de cada um e confere as regras do
// treinador treino a treino.
//
// Uso:  node scripts/stress.mjs [quantidade de perfis] [semente]
//       ex.: node scripts/stress.mjs 600 7
import { computeLevel } from '../server/athlete.js'
import { feedbackAdjustment, generateTrainings, planStages, refreshTimes, trainingDates } from '../server/generator.js'
import { loadLibrary } from '../server/series/index.js'
import { loadRules } from '../server/series/regras.js'

const rules = loadRules()
const library = loadLibrary()
const serieById = new Map(Object.values(library).flat().map((s) => [s.id, s]))
const QUANTOS = Number(process.argv[2] ?? 600)
let semente = Number(process.argv[3] ?? 7)

// ---------- Sorteio que se repete ----------
const random = () => {
    semente = (semente + 0x6d2b79f5) | 0
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const um = (lista) => lista[Math.floor(random() * lista.length)]
const alguns = (lista, min = 0) => {
    const escolhidos = lista.filter(() => random() < 0.5)
    return escolhidos.length >= min ? escolhidos : lista.slice(0, min)
}

// ---------- Perfis ----------
const SEM_PARAR = { ate_50: 50, '50_100': 50, '100_200': 100, '200_400': 200, '400_1000': 400, '1000_2000': 1000, mais_2000: 2000 }
const HOJE = '2026-11-23'
const addDays = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

function perfil(i) {
    const continuousDistance = um(Object.keys(SEM_PARAR))
    const strokes = ['crawl', ...alguns(['costas', 'peito', 'borboleta'])]
    const time400 = random() < 0.65 ? { hundredths: Math.round((4.5 + random() * 6) * 6000), source: um(['teste', 'informado']) } : null
    const anamnese = {
        swimmingSince: um(['menos_6m', '6m_2a', '2a_5a', 'mais_5a']),
        recentBreak: um(['nao', 'nao', 'menos_1m', '1_6m', 'mais_6m']),
        continuousDistance,
        strokes,
        bestStroke: strokes.length > 1 ? um(strokes) : null,
        trainingDays: um([[1, 4], [1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]]),
        sessionMinutes: um([30, 40, 45, 60, 75, 90, 120]),
        poolLength: um([25, 25, 50]),
        equipment: alguns(['pe_de_pato', 'pe_de_pato_peito', 'palmar', 'prancha', 'pull_buoy', 'snorkel', 'paraquedas']),
    }
    const { level, recemIntermediario } = computeLevel(anamnese, time400)
    // Preparação: sem prova (8 semanas, A-T-R) ou com prova a 20 dias até 8 meses
    const comProva = random() < 0.7
    const dias = um([20, 30, 45, 60, 84, 100, 120, 150, 180, 240])
    const fim = comProva ? addDays(HOJE, dias) : addDays(HOJE, rules.periodizacao.semanasSemProva * 7 - 1)
    const provas = comProva && random() < 0.4 ? [addDays(HOJE, Math.floor(dias / 2))] : []
    const evento = comProva ? um(['200 m livre', '400 m livre', '1,5 km', '100 m peito']) : ''
    return {
        nome: `atleta ${i + 1}`,
        athlete: { ...anamnese, level, recemIntermediario, time400, modalidade: comProva ? um(['triatlo', 'piscina_25', 'piscina_50', 'maratona_aquatica']) : null },
        periodizacao: {
            inicio: HOJE, fim, provas, semProva: !comProva,
            testeNaTransicao: Boolean(time400) && random() < 0.6, evento,
        },
        inicioDosTreinos: um([HOJE, addDays(HOJE, -40)]),
    }
}

// ---------- Regras conferidas ----------
const regras = new Map() // nome -> { conferidas, falhas: [] }
function confere(nome, ok, exemplo) {
    if (!regras.has(nome)) regras.set(nome, { conferidas: 0, falhas: [] })
    const r = regras.get(nome)
    r.conferidas++
    if (!ok && r.falhas.length < 5) r.falhas.push(exemplo())
    if (!ok) r.total = (r.total ?? 0) + 1
}

const etapas = rules.periodizacao.etapas
const ehLeve = (a) => SEM_PARAR[a.continuousDistance] <= rules.quemNadaPouco.paraQuemNadaAte
const noCondicionamento = (a) => SEM_PARAR[a.continuousDistance] < rules.condicionamento.paraQuemNadaMenosDe
const maiorRepeticao = (p) => {
    const reps = [...(p.serieTexto ?? '').matchAll(/x (\d+)/g)].map((m) => Number(m[1]))
    return reps.length ? Math.max(...reps) : serieById.get(p.serieId)?.maiorDistancia ?? 0
}
const linhasDeSerie = (texto) => texto.split('\n').filter((l) => /^\d+ª série:/.test(l))
const materialDaLinha = (l) => (l.match(/(NAD|c\/[A-ZÉ+ ]+?)(?= ·|$)/) ?? [''])[0].trim()

function confereAtleta({ nome, athlete, periodizacao, inicioDosTreinos }) {
    const t0 = performance.now()
    const treinos = generateTrainings({ rules, library, athlete, today: HOJE, random, periodizacao, inicioDosTreinos })
    const ms = performance.now() - t0
    const a = athlete
    const quem = `${nome} (${a.level}, nada ${a.continuousDistance}, ${a.trainingDays.length}x/sem, ${a.sessionMinutes} min, ${a.time400 ? 'com tempo' : 'sem tempo'})`
    const minutosDoTreino = Math.min(a.sessionMinutes, rules.niveis[a.level].maxMinutosDeTreino ?? Infinity)

    // Datas: todos os dias de treino até o fim, só nos dias da anamnese
    const esperadas = trainingDates(HOJE, a.trainingDays, daysBetween(HOJE, periodizacao.fim) + 1)
    confere('Gera todos os treinos da periodização (até a prova / 8 semanas)', treinos.length === esperadas.length,
        () => `${quem}: ${treinos.length} de ${esperadas.length}`)
    confere('Gera rápido (menos de 1,5 s por atleta)', ms < 1500, () => `${quem}: ${Math.round(ms)} ms`)

    // Etapas: começa na Acumulação, termina na Realização (6 a 8 dias), recuperação depois da Transição
    const plano = planStages(rules, daysBetween(periodizacao.inicio, periodizacao.fim) + 1, a.level, a.trainingDays.length, periodizacao.semProva)
    const nomes = plano.map((p) => p.etapa)
    const total = daysBetween(periodizacao.inicio, periodizacao.fim) + 1
    if (total >= 28) {
        confere('Periodização começa pela Acumulação', etapas[nomes[0]].fase === 'acumulacao', () => `${quem}: ${nomes.join(' ')}`)
        confere('Periodização termina na Realização de 6 a 8 dias', nomes.at(-1) === 'realizacao' && plano.at(-1).dias >= 6 && plano.at(-1).dias <= 8,
            () => `${quem}: ${JSON.stringify(plano.at(-1))}`)
        confere('Etapas dentro dos dias mínimo e máximo', plano.every((p) => p.dias <= etapas[p.etapa].dias[1]),
            () => `${quem}: ${JSON.stringify(plano)}`)
    }
    if (periodizacao.semProva) {
        confere('Sem prova: periodização padrão A-T-R', nomes.join(' ') === 'acumulacao1 transicao1 realizacao', () => `${quem}: ${nomes.join(' ')}`)
    } else {
        plano.forEach((p, k) => {
            if (etapas[p.etapa].fase !== 'transicao') return
            const antesDaR = plano[k + 1]?.etapa === 'realizacao'
            const deveTer = !antesDaR || a.trainingDays.length > rules.periodizacao.recuperacaoAntesDaRealizacaoAcimaDe
            confere('Semana de recuperação depois da Transição (antes da Realização só acima de 3x/semana)',
                (plano[k + 1]?.etapa === 'recuperacao') === deveTer, () => `${quem}: ${nomes.join(' ')}`)
        })
        // Ciclo do nível: iniciante e intermediário com 2 Acumulações antes de cada Transição (se coube)
        if (a.level !== 'avancado' && nomes.filter((e) => etapas[e].fase === 'transicao').length > 1) {
            const ts = nomes.map((e, k) => (etapas[e].fase === 'transicao' ? k : -1)).filter((k) => k >= 0)
            confere('Iniciante/intermediário: duas Acumulações antes de cada Transição (ciclos completos)',
                ts.every((k) => etapas[nomes[k - 1]]?.fase === 'acumulacao' && etapas[nomes[k - 2]]?.fase === 'acumulacao'),
                () => `${quem}: ${nomes.join(' ')}`)
        }
    }

    let anterior = null
    let testes = 0
    const fatoresR = []
    treinos.forEach((t, i) => {
        const etapa = t.plano.etapa
        const fase = t.plano.fase
        const partes = t.partes
        const ordem = partes.map((p) => p.parte)
        const principais = partes.filter((p) => p.parte === 'principal')
        const ehTeste = ordem.includes('teste')
        if (ehTeste) testes++

        // Plano interno completo
        confere('Plano interno completo (fase, etapa, esforço, volume, material...)',
            ['numero', 'fase', 'etapa', 'intensidade', 'esforcoEsperado', 'metrosPrincipal', 'tipoPrincipal', 'diaDeTeste', 'recuperacao', 'material', 'fatorPrincipal']
                .every((k) => t.plano[k] !== undefined), () => `${quem} ${t.date}: ${JSON.stringify(t.plano)}`)

        // Tempo do treino
        confere('Treino cabe na aula (até 20% a mais; iniciante até 50 min)', t.minutos <= minutosDoTreino * 1.2 + 1,
            () => `${quem} ${t.date}: ${t.minutos} min para ${minutosDoTreino}`)
        confere('Treino tem aquecimento e série principal (ou teste)', ordem.includes('aquecimento') && (principais.length > 0 || ehTeste),
            () => `${quem} ${t.date}: ${ordem.join(', ')}`)

        // Velocidade: com o estilo escrito e nunca 1/1
        for (const v of partes.filter((x) => x.parte === 'velocidade')) {
            confere('Velocidade com o estilo escrito (CR, CO, PE, BO, MD...)', /\b(CR|CO|PE|BO|MD|ME)\b|estilo/.test(v.texto), () => `${quem}: ${v.texto}`)
            confere('Velocidade nunca com 1/1 (descanso de 20" a 30")', !/1\/1/.test(v.texto), () => `${quem}: ${v.texto}`)
        }
        if (a.level === 'iniciante') confere('Iniciante sem velocidade', !ordem.includes('velocidade'), () => `${quem} ${t.date}`)
        if (ehLeve(a)) confere('Quem nada até 100 m: sem velocidade', !ordem.includes('velocidade'), () => `${quem} ${t.date}`)
        if (etapa === 'recuperacao') confere('Semana de recuperação: sem velocidade', !ordem.includes('velocidade'), () => `${quem} ${t.date}`)

        // Teste
        if (ehTeste) {
            confere('Condicionamento (não nada 400 m) nunca faz teste', !noCondicionamento(a), () => `${quem} ${t.date}`)
            if (!a.time400) confere('Sem tempo: teste só depois de 1 mês de treino', daysBetween(inicioDosTreinos, t.date) >= 30, () => `${quem} ${t.date}`)
            else confere('Teste da periodização no começo da Transição', fase === 'transicao', () => `${quem} ${t.date}: ${fase}`)
        }

        for (const p of partes.filter((x) => x.serieId)) {
            const serie = serieById.get(p.serieId)
            // Distância sem parar (com pé de pato, até 75 m)
            const limite = p.material?.includes('pe_de_pato') ? Math.max(SEM_PARAR[a.continuousDistance], 75) : SEM_PARAR[a.continuousDistance]
            confere('Repetições dentro do que o atleta nada sem parar', maiorRepeticao(p) <= limite,
                () => `${quem} ${t.date}: ${p.serieTexto} (aguenta ${limite})`)
            confere('Só material que o atleta tem', (p.material ?? []).every((m) => a.equipment.includes(m)),
                () => `${quem} ${t.date}: ${p.texto.split('\n')[0]}`)
            if (serie) {
                confere('Série fecha na piscina do atleta', serie.piscinas.includes(a.poolLength), () => `${quem}: ${p.serieId}`)
                confere('Estilos exigidos pela série o atleta nada', serie.exige.estilos.every((s) => a.strokes.includes(s)),
                    () => `${quem}: ${p.serieId} ${serie.exige.estilos}`)
            }
        }

        for (const p of principais) {
            const linhas = linhasDeSerie(p.texto)
            // Material diferente em cada série
            if (linhas.length >= 2 && !serieById.get(p.serieId)?.exige.material.length && !serieById.get(p.serieId)?.materialPorSerie) {
                const mats = linhas.map(materialDaLinha)
                // Exceções sem saída: só um tipo de pé de pato e duas séries seguidas que
                // precisam dele (A3), ou a série de 75 m de quem nada pouco (toda com pé de pato)
                const opcoesComPe = rules.materialEntreAsSeries && a.equipment.includes('pe_de_pato')
                    ? rules.material.principal.opcoes.filter((m) => m.includes('pe_de_pato') && m.every((x) => a.equipment.includes(x))).length : 0
                const forte = (l) => /\bA3\b|ritmo forte/.test(l)
                const semSaida = (k) => (opcoesComPe <= 1 && forte(linhas[k]) && forte(linhas[k + 1])) ||
                    maiorRepeticao(p) > SEM_PARAR[a.continuousDistance]
                if (mats.every(Boolean)) {
                    confere('(2x), (3x)...: material diferente da série anterior', mats.slice(1).every((m, k) => m !== mats[k] || semSaida(k)),
                        () => `${quem} ${t.date}:\n${p.texto}`)
                }
            }
            // A3 com pé de pato
            if (a.equipment.includes('pe_de_pato')) {
                for (const l of p.texto.split('\n').filter((x) => /\bA3\b|ritmo forte/.test(x))) {
                    const temPe = /PÉ/.test(l) || /PÉ/.test(p.texto.split('\n')[0])
                    confere('A3 sempre com pé de pato', temPe, () => `${quem} ${t.date}:\n${p.texto}`)
                }
            }
            // Quem nada até 100 m: só ritmo leve
            if (ehLeve(a)) {
                confere('Quem nada até 100 m: só ritmo leve', p.intensidades?.valores?.every((v) => v === 'A1'),
                    () => `${quem} ${t.date}: ${p.texto}`)
            }
            // Acumulação: só A1/A2 (o 400 com 30 AC pode)
            if (fase === 'acumulacao' || etapa === 'recuperacao') {
                confere('Acumulação e recuperação: só A1/A2 (sem A3, AC, NEG, POS, final forte)',
                    !/\bA3\b|ritmo forte|(?<!30 )AC\)|\(NEG\)|\(POS\)|NAD x 25 fo/.test(p.texto), () => `${quem} ${t.date} ${etapa}: ${p.texto}`)
            }
            if (etapa === 'recuperacao') {
                confere('Semana de recuperação: só ritmo leve', p.intensidades?.valores?.every((v) => v === 'A1'), () => `${quem} ${t.date}: ${p.texto}`)
            }
            // Sem tempo: nada de cd, A1/A2/A3 ou AC; ritmo com %
            if (!a.time400) {
                confere('Sem tempo: sem cd na principal (descanso no lugar)', !/cd \d/.test(p.texto), () => `${quem} ${t.date}: ${p.texto}`)
                confere('Sem tempo: sem A1/A2/A3 escritos (ritmo leve/moderado/forte)', !/\bA[123]\b/.test(p.texto), () => `${quem} ${t.date}: ${p.texto}`)
                confere('Sem tempo: sem AC', !/AC\)/.test(p.texto), () => `${quem} ${t.date}: ${p.texto}`)
                if (/ritmo /.test(p.texto)) confere('Sem tempo: ritmo com o % do máximo', /% do seu máximo/.test(p.texto), () => p.texto)
            }
            // Descanso mínimo para quem nada até 400 m
            if (SEM_PARAR[a.continuousDistance] <= rules.descansoMinimo.paraQuemNadaAte) {
                for (const m of p.texto.matchAll(/c\/(\d+)" de descanso/g)) {
                    confere('Quem nada até 400 m: descanso de pelo menos 20"', Number(m[1]) >= 20, () => `${quem}: ${p.texto}`)
                }
            }
        }

        // Recuperação: sem A3 em menos de 48 h depois de um treino com A3 (fora quem treina pouco)
        if (anterior?.plano.intensidade === 'A3' && daysBetween(anterior.date, t.date) < 2 && !ehTeste) {
            const dispensada = a.trainingDays.length <= rules.recuperacaoDispensada.maxTreinosPorSemana &&
                a.sessionMinutes < rules.recuperacaoDispensada.aulaAbaixoDeMinutos && a.modalidade !== 'triatlo'
            if (!dispensada) confere('Recuperação: sem A3 nas 48 h depois de um A3', t.plano.intensidade !== 'A3', () => `${quem} ${anterior.date} -> ${t.date}`)
        }

        // Não repetir a série no treino seguinte (id, como saiu e família)
        if (anterior) {
            const partesSemRepetir = rules.naoRepetirNoTreinoSeguinte.partes
            for (const p of partes.filter((x) => partesSemRepetir.includes(x.parte) && x.serieId)) {
                const antes = anterior.partes.filter((x) => partesSemRepetir.includes(x.parte))
                const repetiu = antes.some((x) => x.serieId === p.serieId || x.serieTexto === p.serieTexto ||
                    (p.serieFamilia && x.serieFamilia === p.serieFamilia))
                confere('Mesma série nunca em treinos seguidos', !repetiu, () => `${quem} ${anterior.date} e ${t.date}: ${p.serieTexto}`)
            }
        }

        // Volumes
        if (fase === 'transicao' && !t.plano.condicionamento) {
            const semProva = !(periodizacao.provas ?? []).some((d) => daysBetween(t.date, d) >= 0 && daysBetween(t.date, d) < 7)
            if (semProva) confere('Transição com 85% do volume da principal', Math.abs(t.plano.fatorPrincipal - 0.85) < 0.011, () => `${quem} ${t.date}: ${t.plano.fatorPrincipal}`)
        }
        if (etapa === 'realizacao' && !t.plano.condicionamento) fatoresR.push(t.plano.fatorPrincipal)

        anterior = t
        void i
    })
    if (fatoresR.length >= 2) {
        confere('Realização: volume caindo treino a treino (85% até 60%)',
            fatoresR.every((f, k) => k === 0 || f <= fatoresR[k - 1]) && fatoresR.at(-1) <= 0.61 && fatoresR[0] <= 0.86,
            () => `${quem}: ${fatoresR.join(', ')}`)
    }
    // Tempo novo (teste de 400 m): os treinos não feitos ganham os tempos sem mudar as séries
    if (!a.time400) {
        const comTempo = { ...a, time400: { hundredths: 36000 } }
        const amostra = treinos.slice(0, 6)
        for (const t of amostra) {
            const novas = refreshTimes(rules, comTempo, t)
            confere('Tempo novo: as mesmas séries, agora com o cd', novas.every((p, k) => p.serieId === t.partes[k].serieId) &&
                novas.filter((p) => p.parte === 'principal').every((p) => !/ritmo (leve|moderado|forte)/.test(p.texto)),
            () => `${quem} ${t.date}`)
        }
    }
    confere('No máximo um teste na periodização (o de quem não tem tempo, ou o da Transição)', testes <= 1, () => `${quem}: ${testes} testes`)
    return { ms, treinos: treinos.length, level: a.level }
}

// ---------- Feedback ----------
function confereFeedback() {
    const base = { level: 'intermediario', continuousDistance: '1000_2000' }
    const plano = { esforcoEsperado: 6, fatorPrincipal: 1 }
    const notas = (...ns) => ns.map((difficulty) => ({ difficulty, reason: 'respiracao', plan: plano }))
    confere('Feedback: 1 ou 2 treinos pesados não mudam nada', feedbackAdjustment(rules, base, notas(9, 9)).carga === 0, () => '9, 9')
    confere('Feedback: 3 seguidos com 8+ diminuem a principal', feedbackAdjustment(rules, base, notas(8, 9, 8)).carga === -1, () => '8, 9, 8')
    confere('Feedback: avançado só conta 9 e 10', feedbackAdjustment(rules, { ...base, level: 'avancado' }, notas(8, 8, 8)).carga === 0, () => 'avançado 8, 8, 8')
    confere('Feedback: avançado com 9, 10, 9 diminui', feedbackAdjustment(rules, { ...base, level: 'avancado' }, notas(9, 10, 9)).carga === -1, () => 'avançado 9, 10, 9')
    confere('Feedback: não ajusta duas vezes pelos mesmos treinos', feedbackAdjustment(rules, base, notas(9, 9, 9), 0.9).carga === 0, () => 'já ajustado')
    confere('Feedback: 3 seguidos fáceis aumentam', feedbackAdjustment(rules, base, notas(2, 3, 4)).carga === 1, () => '2, 3, 4')
}

// ---------- Roda ----------
const inicio = performance.now()
const porNivel = { iniciante: 0, intermediario: 0, avancado: 0 }
let treinosGerados = 0
let maisLento = 0
for (let i = 0; i < QUANTOS; i++) {
    const r = confereAtleta(perfil(i))
    porNivel[r.level]++
    treinosGerados += r.treinos
    maisLento = Math.max(maisLento, r.ms)
}
confereFeedback()
const segundos = (performance.now() - inicio) / 1000

console.log(`\nTeste de estresse: ${QUANTOS} atletas (iniciante ${porNivel.iniciante}, intermediário ${porNivel.intermediario}, avançado ${porNivel.avancado})`)
console.log(`${treinosGerados} treinos gerados em ${segundos.toFixed(1)} s (o atleta mais lento: ${Math.round(maisLento)} ms)\n`)
let falhou = 0
for (const [nome, r] of regras) {
    const ok = !r.total
    if (!ok) falhou++
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}  (${r.conferidas} conferências${ok ? '' : `, ${r.total} falhas`})`)
    for (const f of r.falhas) console.log(`        - ${f.replace(/\n/g, '\n          ')}`)
}
console.log(`\n${regras.size - falhou} de ${regras.size} regras sem falhas.`)
process.exitCode = falhou ? 1 : 0
