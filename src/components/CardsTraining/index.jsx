import { useEffect, useRef, useState } from 'react'
import { Card } from '../Card'
import { Modal } from '../Modal'
import { Training } from '../Training'
import { TrainingGlossary } from '../TrainingGlossary'
import { formatDate } from '../../utils/format'
import { FASES, formatMeters } from '../../utils/periodization'
import chevron from '../../assets/chevron.svg'
import styles from './cardstraining.module.css'

const situacao = (training, today) => {
    if (training.completed) return 'Realizado'
    if (training.missed) return 'Falta'
    if (training.date < today) return 'Sem resposta'
    if (training.date === today) return 'Hoje'
    return 'Agendado'
}

// Carrossel com todos os treinos da fase escolhida no bloco da periodização.
// Começa no treino do dia; clicar num cartão abre o treino inteiro.
export const CardsTraining = ({ trainings, fase, today }) => {
    const carousel = useRef(null)
    const [selected, setSelected] = useState(null)
    const nomeDaFase = FASES.find((f) => f.id === fase)?.nome

    // Ao trocar de fase, vai até o treino de hoje (ou o próximo)
    useEffect(() => {
        const el = carousel.current
        if (!el) return
        const alvo = el.querySelector('[data-proximo="true"]')
        el.scrollLeft = alvo ? alvo.offsetLeft - el.offsetLeft - 8 : 0
    }, [fase, trainings.length])

    if (!fase || trainings.length === 0) return null
    const proximo = trainings.find((t) => t.date >= today)
    const move = (sentido) => {
        carousel.current.scrollLeft += sentido * carousel.current.offsetWidth * 0.8
    }
    const titleOf = (t) => t.title || 'Treino'

    return (
        <section className={styles.wrapper} aria-label={`Treinos da ${nomeDaFase}`}>
            <div className={styles.top}>
                <h3>{nomeDaFase} · {trainings.length} treinos</h3>
                <div className={styles.arrows}>
                    <button type='button' onClick={() => move(-1)}><img src={chevron} alt='Voltar' /></button>
                    <button type='button' onClick={() => move(1)}><img src={chevron} alt='Avançar' /></button>
                </div>
            </div>
            <div className={styles.container} ref={carousel}>
                {trainings.map((training) => (
                    <button
                        type='button'
                        key={training.id}
                        data-proximo={training === proximo}
                        className={`${styles.cardTraining} ${training === proximo ? styles.next : ''}`}
                        onClick={() => setSelected(training)}
                        aria-label={`Ver ${titleOf(training)} de ${formatDate(training.date)}`}
                    >
                        <span className={`${styles.status} ${styles[situacao(training, today).replace(' ', '')]}`}>
                            {situacao(training, today)}
                        </span>
                        <Card training={training} inTrainingPage='true' />
                    </button>
                ))}
            </div>
            <Modal
                open={selected !== null}
                onClose={() => setSelected(null)}
                title={selected ? `${titleOf(selected)} · ${formatDate(selected.date)}` : ''}
            >
                {selected && (
                    <>
                        <p className={styles.info}>
                            {[
                                situacao(selected, today),
                                selected.periodizacao?.nomeDaEtapa,
                                selected.periodizacao?.intensidade && `principal em ${selected.periodizacao.intensidade}`,
                                selected.metros > 0 && formatMeters(selected.metros),
                                selected.minutos > 0 && `~${selected.minutos} min`,
                            ].filter(Boolean).join(' · ')}
                        </p>
                        {selected.partes && <div className={styles.glossary}><TrainingGlossary training={selected} /></div>}
                        <Training training={selected} />
                    </>
                )}
            </Modal>
        </section>
    )
}
