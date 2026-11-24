import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../services/api'
import styles from './tutorial.module.css'

// Evento para abrir o tutorial de qualquer lugar (Perfil -> Suporte -> "Ver o tutorial")
export const OPEN_TUTORIAL = 'newave:tutorial'

// Os passos, como nos jogos: a tela escurece, a coisa fica em destaque e um balão com
// uma setinha explica o que ela faz. `alvo` = o data-tour do elemento na tela.
// `opcional`: só aparece se o elemento existir (ex.: "Concluir treino" precisa de treino).
const PASSOS = [
    {
        titulo: 'Bem-vindo ao NeWave!',
        texto: 'Vou te mostrar onde fica cada coisa do app. Leva só 1 minuto.',
    },
    {
        alvo: 'gerar',
        titulo: 'Gerar treinos',
        texto: 'Comece por aqui. Você responde algumas perguntas sobre o seu nado (só na 1ª vez) e escolhe a prova alvo ou o seu objetivo. O app monta todos os treinos da preparação.',
    },
    {
        alvo: 'treinos',
        titulo: 'Os seus treinos',
        texto: 'Aqui aparecem os seus treinos, com o de hoje em destaque. As partes (aquecimento, série principal...) vêm na ordem em que você nada.',
    },
    {
        alvo: 'abreviacao',
        opcional: true,
        titulo: 'Abreviações clicáveis',
        texto: 'Tudo o que está em azul com sublinhado pontilhado é clicável: toque para ver o que quer dizer. Ex.: a/c = saída a cada.',
    },
    {
        alvo: 'glossario-treino',
        opcional: true,
        titulo: 'Glossário do treino',
        texto: 'Mostra a explicação de todos os termos que aparecem neste treino.',
    },
    {
        alvo: 'concluir',
        opcional: true,
        titulo: 'Concluir treino',
        texto: 'Terminou de nadar? Toque aqui e diga de 1 a 10 como foi a série principal. É assim que o app ajusta os próximos treinos.',
    },
    {
        alvo: 'menu-treinos',
        titulo: 'Treinos e periodização',
        texto: 'A sua preparação inteira: Acumulação, Transição e Realização, o volume da semana e do mês e a intensidade de cada fase.',
    },
    {
        alvo: 'menu-desempenho',
        titulo: 'Desempenho',
        texto: 'Registre o teste de 400 m (botão "+ Teste") e acompanhe a evolução dos seus tempos e as notas dos treinos.',
    },
    {
        alvo: 'menu-glossario',
        titulo: 'Glossário',
        texto: 'Todos os termos e abreviações dos treinos, com busca.',
    },
    {
        alvo: 'menu-perfil',
        titulo: 'Perfil',
        texto: 'As suas respostas, o calendário de provas, o modelo de treino e o suporte. Lá também dá para ver este tutorial de novo.',
    },
    {
        alvo: 'menu-sair',
        titulo: 'Sair',
        texto: 'Para sair da sua conta.',
    },
    {
        titulo: 'Pronto!',
        texto: 'Agora é com você: toque em "Gerar treinos" para começar. Bom treino!',
    },
]

const MARGEM = 12 // distância do balão até o elemento
const FOLGA = 6 // o destaque fica um pouco maior que o elemento

// O elemento do passo que está visível na tela (no celular e no computador o menu muda de lugar)
function acharAlvo(alvo) {
    if (!alvo) return null
    return [...document.querySelectorAll(`[data-tour="${alvo}"]`)]
        .find((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0
        }) ?? null
}

// A área do elemento com tudo o que está dentro dele (no menu, o nome passa da largura do item)
function areaDe(el) {
    const caixas = [el, ...el.querySelectorAll('*')].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const top = Math.min(...caixas.map((r) => r.top))
    // (sem passar das bordas da tela: o carrossel tem treinos escondidos à direita)
    const left = Math.max(4, Math.min(...caixas.map((r) => r.left)))
    const right = Math.min(window.innerWidth - 4, Math.max(...caixas.map((r) => r.right)))
    const bottom = Math.max(...caixas.map((r) => r.bottom))
    return { top, left, right, bottom, width: right - left, height: bottom - top }
}

// Onde o balão fica: do lado com mais espaço (direita, esquerda, embaixo ou em cima)
function posicionar(rect, balao) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = balao.width
    const h = balao.height
    const dentro = (v, min, max) => Math.max(min, Math.min(v, max))
    const centroY = rect.top + rect.height / 2
    const centroX = rect.left + rect.width / 2
    if (vw - rect.right >= w + MARGEM * 2) {
        const top = dentro(centroY - h / 2, MARGEM, vh - h - MARGEM)
        return { lado: 'direita', left: rect.right + MARGEM + FOLGA, top, seta: centroY - top }
    }
    if (rect.left >= w + MARGEM * 2) {
        const top = dentro(centroY - h / 2, MARGEM, vh - h - MARGEM)
        return { lado: 'esquerda', left: rect.left - w - MARGEM - FOLGA, top, seta: centroY - top }
    }
    const left = dentro(centroX - w / 2, MARGEM, vw - w - MARGEM)
    if (vh - rect.bottom >= h + MARGEM * 2) {
        return { lado: 'embaixo', left, top: rect.bottom + MARGEM + FOLGA, seta: centroX - left }
    }
    return { lado: 'em-cima', left, top: Math.max(MARGEM, rect.top - h - MARGEM - FOLGA), seta: centroX - left }
}

// Tutorial do app, no estilo dos jogos. Abre sozinho na 1ª vez que a pessoa entra (a conta
// guarda que já viu) e pode ser aberto de novo pelo Perfil.
export const Tutorial = () => {
    const { user, updateUser } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [passos, setPassos] = useState(null) // null = fechado
    const [passo, setPasso] = useState(0)
    const [rect, setRect] = useState(null)
    const [pos, setPos] = useState(null)
    const balao = useRef(null)
    const proximoRef = useRef(null)

    // Começa na página inicial, onde estão os treinos
    const comecar = useCallback(() => {
        const abrir = () => {
            setPassos(PASSOS.filter((p) => !p.opcional || acharAlvo(p.alvo)))
            setPasso(0)
        }
        if (location.pathname !== '/page/home') {
            navigate('/page/home')
            setTimeout(abrir, 700)
        } else {
            setTimeout(abrir, 400)
        }
    }, [location.pathname, navigate])

    useEffect(() => {
        if (user && user.tutorialSeen === false && passos === null) comecar()
        // (só na 1ª vez: depois de visto, a conta guarda)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.tutorialSeen])

    useEffect(() => {
        window.addEventListener(OPEN_TUTORIAL, comecar)
        return () => window.removeEventListener(OPEN_TUTORIAL, comecar)
    }, [comecar])

    const fechar = useCallback(() => {
        setPassos(null)
        setRect(null)
        if (user && !user.tutorialSeen) {
            updateUser({ tutorialSeen: true })
            api('/account/tutorial', { method: 'POST' }).catch(() => {})
        }
    }, [user, updateUser])

    const atual = passos?.[passo] ?? null

    // Mede o elemento do passo (e de novo quando a tela muda de tamanho ou rola)
    useLayoutEffect(() => {
        if (!atual) return undefined
        const el = acharAlvo(atual.alvo)
        // Elemento mais alto que boa parte da tela (ex.: os treinos no celular): destaca só a
        // parte de cima, com o balão logo abaixo
        const alto = (r) => r.height > window.innerHeight * 0.45
        if (el) el.scrollIntoView({ block: alto(areaDe(el)) ? 'start' : 'center', inline: 'nearest' })
        const medir = () => {
            const alvo = acharAlvo(atual.alvo)
            if (!alvo) return setRect(null)
            const r = areaDe(alvo)
            if (!alto(r)) return setRect(r)
            const top = Math.max(r.top, 8)
            const height = Math.min(r.bottom - top, window.innerHeight * 0.3)
            setRect({ ...r, top, height, bottom: top + height })
        }
        medir()
        window.addEventListener('resize', medir)
        window.addEventListener('scroll', medir, true)
        return () => {
            window.removeEventListener('resize', medir)
            window.removeEventListener('scroll', medir, true)
        }
    }, [atual])

    // Posiciona o balão ao lado do elemento
    useLayoutEffect(() => {
        if (!atual || !balao.current) return
        setPos(rect ? posicionar(rect, balao.current.getBoundingClientRect()) : null)
    }, [rect, atual])

    // Teclado: Esc fecha; setas andam
    useEffect(() => {
        if (!atual) return undefined
        proximoRef.current?.focus()
        const tecla = (e) => {
            if (e.key === 'Escape') fechar()
            if (e.key === 'ArrowRight' && passo < passos.length - 1) setPasso((p) => p + 1)
            if (e.key === 'ArrowLeft' && passo > 0) setPasso((p) => p - 1)
        }
        window.addEventListener('keydown', tecla)
        return () => window.removeEventListener('keydown', tecla)
    }, [atual, passo, passos, fechar])

    if (!atual) return null
    const ultimo = passo === passos.length - 1
    const noCentro = !rect || !pos

    return (
        <div className={styles.camada} role='dialog' aria-modal='true' aria-labelledby='tutorial-titulo' aria-describedby='tutorial-texto'>
            {rect ? (
                <div className={styles.destaque} style={{
                    top: rect.top - FOLGA, left: rect.left - FOLGA, width: rect.width + FOLGA * 2, height: rect.height + FOLGA * 2,
                }} />
            ) : (
                <div className={styles.fundo} />
            )}
            <div
                ref={balao}
                className={`${styles.balao} ${noCentro ? styles.centro : styles[pos.lado.replace('-', '')]}`}
                style={noCentro ? undefined : { top: pos.top, left: pos.left, '--seta': `${pos.seta}px` }}
            >
                <p className={styles.contador}>{passo + 1} de {passos.length}</p>
                <h3 id='tutorial-titulo' className={styles.titulo}>{atual.titulo}</h3>
                <p id='tutorial-texto' className={styles.texto}>{atual.texto}</p>
                <div className={styles.acoes}>
                    <button type='button' className={styles.pular} onClick={fechar}>{ultimo ? 'Fechar' : 'Pular'}</button>
                    <div className={styles.navegar}>
                        {passo > 0 && (
                            <button type='button' className={styles.secundario} onClick={() => setPasso((p) => p - 1)}>Voltar</button>
                        )}
                        {ultimo
                            ? <button ref={proximoRef} type='button' className={styles.primario} onClick={fechar}>Começar</button>
                            : <button ref={proximoRef} type='button' className={styles.primario} onClick={() => setPasso((p) => p + 1)}>Próximo</button>}
                    </div>
                </div>
            </div>
        </div>
    )
}
