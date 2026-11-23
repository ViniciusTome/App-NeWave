import { useCallback, useEffect, useState } from 'react'
import { Aside } from "../../components/Aside"
import { CardsTraining } from "../../components/CardsTraining"
import { Times } from "../../components/Dashboard/Times"
import { Intensity } from "../../components/Intensity"
import { Periodization } from "../../components/Periodization"
import { Volume } from "../../components/Volume"
import { api, TRAININGS_CHANGED } from '../../services/api'
import { todayIso } from '../../utils/format'
import { currentPhase } from '../../utils/periodization'

import styles from './trainingpage.module.css'

// Treinos/Periodização: as fases do plano (clicáveis), os treinos da fase escolhida,
// o volume (dia, semana e mês) e as intensidades.
export const TrainingPage = () => {
    const [trainings, setTrainings] = useState(null) // null = carregando
    const [loadError, setLoadError] = useState('')
    const [fase, setFase] = useState(null) // fase escolhida no bloco da periodização
    const today = todayIso()

    const load = useCallback(() => {
        return api('/trainings/periodization')
            .then(({ trainings }) => {
                setTrainings(trainings)
                setLoadError('')
            })
            .catch((err) => setLoadError(err.message))
    }, [])

    useEffect(() => {
        load()
        window.addEventListener(TRAININGS_CHANGED, load)
        return () => window.removeEventListener(TRAININGS_CHANGED, load)
    }, [load])

    // Começa na fase em que o atleta está
    const lista = trainings ?? []
    const faseEscolhida = fase ?? currentPhase(lista, today)
    const daFase = lista.filter((t) => (t.periodizacao?.fase ?? null) === faseEscolhida)

    return (
        <div className={styles.container}>
            <Aside/>
            <div className={styles.periodization} >
                <Periodization
                    trainings={trainings}
                    loadError={loadError}
                    selected={faseEscolhida}
                    current={currentPhase(lista, today)}
                    onSelect={setFase}
                />
                <CardsTraining trainings={daFase} fase={faseEscolhida} today={today} />
                <div className={styles.volume} >
                    <Volume trainings={lista} today={today} />
                    <Intensity trainings={lista} daFase={daFase} fase={faseEscolhida} today={today} />
                </div>
                <div className={styles.times} >
                    <Times/>
                </div>
            </div>
        </div>
    )
}
