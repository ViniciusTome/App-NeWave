import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../services/api'
import styles from './tutorial.module.css'

// Evento para abrir o tutorial de qualquer lugar (Perfil -> Suporte -> "Ver o tutorial")
export const OPEN_TUTORIAL = 'newave:tutorial'

// Os passos do tutorial: onde fica cada coisa e como usar
const PASSOS = [
    {
        titulo: 'Bem-vindo ao NeWave!',
        texto: 'Seus treinos de natação montados para você, do primeiro dia até a prova. Veja em 1 minuto como usar o app.',
        icone: '🌊',
    },
    {
        titulo: '1. Gere os seus treinos',
        texto: 'Toque em "Gerar treinos", no alto da tela. Na 1ª vez você responde algumas perguntas sobre o seu nado (só uma vez) e escolhe a prova alvo ou o seu objetivo. O app monta todos os treinos da preparação.',
        icone: '✨',
    },
    {
        titulo: '2. O treino do dia',
        texto: 'Na página Início ficam os seus treinos, com o de hoje primeiro. As partes (aquecimento, velocidade, série principal...) vêm na ordem em que você nada.',
        icone: '🏊',
    },
    {
        titulo: '3. Como ler o treino',
        texto: 'As abreviações em azul, com o sublinhado pontilhado, são clicáveis: toque para ver o que querem dizer. Ex.: a/c = saída a cada; D20" = descanso de 20 segundos. O botão "Glossário" do treino mostra todos os termos dele.',
        icone: '📖',
    },
    {
        titulo: '4. Conclua e diga como foi',
        texto: 'Terminou? Toque em "Concluir treino" e diga de 1 a 10 como foi a série principal. É assim que o app ajusta os próximos treinos: mais leves se estiver pesado, mais fortes se estiver fácil.',
        icone: '✅',
    },
    {
        titulo: '5. Testes e tempos',
        texto: 'Em Desempenho você registra o teste de 400 m (botão "+ Teste") e acompanha a sua evolução. Com o teste, o app calcula os seus tempos de saída.',
        icone: '⏱️',
    },
    {
        titulo: '6. A sua periodização',
        texto: 'Em Treinos você vê a preparação inteira (Acumulação, Transição e Realização), o volume da semana e do mês e a intensidade de cada fase.',
        icone: '📅',
    },
    {
        titulo: '7. O seu perfil',
        texto: 'No Perfil você atualiza as suas respostas, coloca as provas no calendário, escolhe o modelo de treino e fala com o suporte. Para ver este tutorial de novo: Perfil → Suporte → "Ver o tutorial".',
        icone: '👤',
    },
]

// Tutorial do app: abre sozinho na 1ª vez que a pessoa entra (a conta guarda que já viu)
// e pode ser aberto de novo pelo Perfil.
export const Tutorial = () => {
    const { user, updateUser } = useAuth()
    const [aberto, setAberto] = useState(false)
    const [passo, setPasso] = useState(0)

    useEffect(() => {
        if (user && user.tutorialSeen === false) setAberto(true)
    }, [user])

    useEffect(() => {
        const abrir = () => {
            setPasso(0)
            setAberto(true)
        }
        window.addEventListener(OPEN_TUTORIAL, abrir)
        return () => window.removeEventListener(OPEN_TUTORIAL, abrir)
    }, [])

    const fechar = () => {
        setAberto(false)
        if (user && !user.tutorialSeen) {
            updateUser({ tutorialSeen: true })
            api('/account/tutorial', { method: 'POST' }).catch(() => {})
        }
    }

    const atual = PASSOS[passo]
    const ultimo = passo === PASSOS.length - 1

    return (
        <Modal open={aberto} onClose={fechar} title='Como usar o app'>
            <div className={styles.passo}>
                <span className={styles.icone} aria-hidden='true'>{atual.icone}</span>
                <h3 className={styles.titulo}>{atual.titulo}</h3>
                <p className={styles.texto}>{atual.texto}</p>
                <div className={styles.pontos} aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
                    {PASSOS.map((_, i) => (
                        <button key={i} type='button' className={i === passo ? styles.pontoAtual : styles.ponto}
                            onClick={() => setPasso(i)} aria-label={`Ir para o passo ${i + 1}`} aria-current={i === passo} />
                    ))}
                </div>
                <div className={styles.acoes}>
                    {passo === 0
                        ? <button type='button' className={styles.secundario} onClick={fechar}>Pular</button>
                        : <button type='button' className={styles.secundario} onClick={() => setPasso((p) => p - 1)}>Voltar</button>}
                    {ultimo
                        ? <button type='button' className={styles.primario} onClick={fechar}>Começar</button>
                        : <button type='button' className={styles.primario} onClick={() => setPasso((p) => p + 1)}>Próximo</button>}
                </div>
            </div>
        </Modal>
    )
}
