import { useEffect, useMemo, useRef, useState } from 'react'
import { esperaDepoisDe, planoDaSerie, relogio, textoDaRepeticao } from '../../utils/seriesClock'
import { useBeep, useClockTheme, useTick, useWakeLock } from './common'
import { Numeros } from './Numeros'
import { createPortal } from 'react-dom'
import styles from './clock.module.css'

const PREPARAR = 10 // segundos antes da 1ª saída

// Relógio de saída de uma série do treino, em tela cheia. Lê a série do card (repetições,
// a/c ou descanso, séries e intervalo) e avisa cada saída com bipe, vibração e uma
// contagem grande. Com a/c: sai a cada X. Com descanso: o atleta toca em "Cheguei" e o
// relógio conta o descanso até a próxima saída. Por tempo (ex.: 5 x 4' D1'): conta os 4 minutos
// de nado, apita e conta o descanso, sozinho. No fim de cada série, o intervalo soma o descanso
// da última repetição.
export const IntervalClock = ({ titulo, texto, onClose }) => {
    const plano = useMemo(() => planoDaSerie(texto), [texto])
    const [tema, trocarTema] = useClockTheme()
    const { liberar, bipe } = useBeep()
    // fase: parado | contagem (até a próxima saída) | nadando (descanso: até tocar Cheguei;
    // por tempo: até acabar o tempo de nado) | fim
    const [fase, setFase] = useState('parado')
    const [indice, setIndice] = useState(0) // a repetição da próxima saída (ou a que está nadando)
    const [alvo, setAlvo] = useState(null) // horário da próxima saída
    const [saiuEm, setSaiuEm] = useState(null) // horário da última saída
    const [pausadoEm, setPausadoEm] = useState(null)
    const rodando = (fase === 'contagem' || fase === 'nadando') && pausadoEm === null
    const [fimDoNado, setFimDoNado] = useState(null) // por tempo: horário em que acaba o nado
    const agora = useTick(rodando)
    const ultimoBipe = useRef(null)
    useWakeLock(true)

    const reps = plano?.reps ?? []
    const rep = reps[Math.min(indice, reps.length - 1)]
    const anterior = reps[indice - 1]
    const fimDeSerie = (i) => i + 1 < reps.length && reps[i + 1].serie !== reps[i].serie

    // Tempo até a próxima saída e os bipes: 3, 2, 1 e o longo na saída
    const falta = alvo !== null ? (alvo - (pausadoEm ?? agora)) / 1000 : null
    // Por tempo: acaba o nado -> apito longo e conta o descanso (no fim da série, o intervalo + o descanso)
    const faltaNadar = fimDoNado !== null ? (fimDoNado - (pausadoEm ?? agora)) / 1000 : null
    useEffect(() => {
        if (fase !== 'nadando' || rep?.modo !== 'tempo' || pausadoEm !== null || faltaNadar === null) return
        const segundo = Math.ceil(faltaNadar)
        if (faltaNadar <= 0) {
            bipe(true)
            ultimoBipe.current = null
            const fim = fimDoNado
            setFimDoNado(null)
            if (indice + 1 >= reps.length) {
                setFase('fim')
                return
            }
            setIndice(indice + 1)
            setFase('contagem')
            setAlvo(fim + esperaDepoisDe(plano, indice) * 1000)
        } else if (segundo <= 3 && ultimoBipe.current !== -segundo) {
            ultimoBipe.current = -segundo
            bipe(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agora, fase, pausadoEm, fimDoNado])

    useEffect(() => {
        if (fase !== 'contagem' || pausadoEm !== null || falta === null) return
        const segundo = Math.ceil(falta)
        if (falta <= 0) {
            bipe(true)
            ultimoBipe.current = null
            const saida = alvo
            setSaiuEm(saida)
            if (rep.modo === 'tempo') {
                setFase('nadando')
                setAlvo(null)
                setFimDoNado(saida + rep.nadar * 1000)
            } else if (rep.modo === 'descanso') {
                setFase('nadando')
                setAlvo(null)
            } else {
                // a/c: a próxima saída é X depois desta (com o intervalo, no fim da série)
                const proximo = indice + 1
                if (proximo >= reps.length) {
                    setFase('nadando')
                    setAlvo(null)
                } else {
                    setIndice(proximo)
                    setAlvo(saida + rep.segundos * 1000 + (fimDeSerie(indice) ? plano.intervalo * 1000 : 0))
                }
            }
        } else if (segundo <= 3 && ultimoBipe.current !== segundo) {
            ultimoBipe.current = segundo
            bipe(false)
        }
        // (confere a cada tique do relógio; o resto vem junto com o tique)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agora, fase, pausadoEm, alvo])

    const comecar = () => {
        liberar()
        setIndice(0)
        setFase('contagem')
        setAlvo(Date.now() + PREPARAR * 1000)
        setFimDoNado(null)
        setPausadoEm(null)
    }

    // Descanso: chegou -> conta o descanso (ou o intervalo, no fim da série) até a próxima
    const cheguei = () => {
        const proximo = indice + 1
        if (rep.modo === 'saida' || proximo >= reps.length) {
            setFase('fim')
            return
        }
        setIndice(proximo)
        setFase('contagem')
        // (no fim da série: o intervalo mais o descanso da última repetição)
        setAlvo(Date.now() + esperaDepoisDe(plano, indice) * 1000)
    }

    const pausar = () => {
        if (pausadoEm === null) setPausadoEm(Date.now())
        else {
            const parado = Date.now() - pausadoEm
            setAlvo((a) => (a === null ? a : a + parado))
            setSaiuEm((s) => (s === null ? s : s + parado))
            setFimDoNado((f) => (f === null ? f : f + parado))
            setPausadoEm(null)
        }
    }

    if (!plano) return null
    const nadandoHa = saiuEm !== null ? ((pausadoEm ?? agora) - saiuEm) / 1000 : 0
    const ultimaSaidaComAC = fase === 'nadando' && rep.modo === 'saida'
    const emIntervalo = fase === 'contagem' && anterior && anterior.serie !== rep.serie

    let numeros = relogio(PREPARAR)
    let legenda = `${reps.length} repetições · ${rep.modo === 'saida' ? `saída a cada ${relogio(rep.segundos)}`
        : rep.modo === 'tempo' ? `${textoDaRepeticao(rep)}${rep.segundos ? `, descanso de ${relogio(rep.segundos)}` : ''}`
            : `descanso de ${relogio(rep.segundos)}`}`
    if (fase === 'contagem') {
        numeros = relogio(falta)
        legenda = indice === 0 && saiuEm === null ? 'Prepare-se: a 1ª saída é no zero'
            : emIntervalo ? `Intervalo · a ${rep.serie}ª série sai no zero`
                : rep.modo === 'tempo' ? `Descanso · a ${rep.numero}ª de ${rep.total} sai no zero`
                    : `Próxima saída: ${rep.numero}ª de ${rep.total}`
    } else if (fase === 'nadando' && rep.modo === 'tempo') {
        // Por tempo: quanto falta de nado
        numeros = relogio(faltaNadar ?? 0)
        legenda = indice + 1 >= reps.length ? 'Última: nade até o apito' : 'Nadando: continue até o apito'
    } else if (fase === 'nadando') {
        numeros = relogio(nadandoHa)
        legenda = ultimaSaidaComAC ? 'Última repetição: toque em "Terminei" ao chegar' : 'Nadando: toque em "Cheguei" ao chegar'
    } else if (fase === 'fim') {
        numeros = 'FIM'
        legenda = 'Série concluída!'
    }

    // Direto no <body>: por cima da página inteira (o card do treino tem efeito de zoom)
    return createPortal(
        <div className={`${styles.tela} ${styles[tema]}`} role='dialog' aria-modal='true' aria-label={`Relógio de saída: ${titulo}`}>
            <div className={styles.topo}>
                <button type='button' className={styles.botaoPequeno} onClick={trocarTema}>
                    {tema === 'escuro' ? 'Tela clara' : 'Tela escura'}
                </button>
                <span className={styles.nome}>{titulo}</span>
                <button type='button' className={styles.botaoPequeno} onClick={onClose}>Fechar</button>
            </div>

            <p className={styles.serieTexto}>{texto.split('\n')[0]}</p>
            {fase !== 'parado' && fase !== 'fim' && (
                <p className={styles.repeticao}>
                    {plano.series > 1 && `Série ${rep.serie} de ${plano.series} · `}
                    {rep.nadar ? `${rep.numero}ª de ${rep.total} · ${textoDaRepeticao(rep)}` : textoDaRepeticao(rep)}
                </p>
            )}
            <Numeros>{numeros}</Numeros>
            <p className={styles.legenda} role='status'>{pausadoEm !== null ? 'Pausado' : legenda}</p>

            <div className={styles.controles}>
                {fase === 'parado' && <button type='button' className={styles.botaoGrande} onClick={comecar}>Começar</button>}
                {fase === 'nadando' && rep.modo !== 'tempo' && (
                    <button type='button' className={styles.botaoGrande} onClick={cheguei}>
                        {ultimaSaidaComAC || indice + 1 >= reps.length ? 'Terminei' : 'Cheguei'}
                    </button>
                )}
                {(fase === 'contagem' || fase === 'nadando') && (
                    <button type='button' className={styles.botaoGrande} onClick={pausar}>{pausadoEm !== null ? 'Continuar' : 'Pausar'}</button>
                )}
                {fase === 'fim' && <button type='button' className={styles.botaoGrande} onClick={onClose}>Fechar</button>}
            </div>
        </div>,
        document.body,

    )
}
