import { FASES, INTENSIDADES, trainingOfTheDay } from '../../utils/periodization'
import styles from './intensity.module.css'

// Intensidade: a do treino do dia (com o tempo estimado do treino) e quantos
// treinos da fase escolhida têm a série principal em A1, A2 e A3.
export const Intensity = ({ trainings, daFase, fase, today }) => {
    const doDia = trainingOfTheDay(trainings, today)
    const intensidadeDoDia = INTENSIDADES.find((i) => i.id === doDia?.periodizacao?.intensidade)
    const comIntensidade = daFase.filter((t) => t.periodizacao?.intensidade)
    const nomeDaFase = FASES.find((f) => f.id === fase)?.nome

    return (
        <div className={styles.intensity}>
            <h2>Intensidade Treinos</h2>
            <div className={styles.today}>
                <span className={styles.label}>{doDia?.date === today ? 'Treino de hoje' : 'Próximo treino'}</span>
                <strong>{intensidadeDoDia?.nome ?? '—'}</strong>
                {doDia?.minutos > 0 && <span className={styles.time}>~{doDia.minutos} min de treino</span>}
            </div>
            {comIntensidade.length > 0 && (
                <>
                    <p className={styles.label}>Série principal na {nomeDaFase}</p>
                    <ul className={styles.bars}>
                        {INTENSIDADES.map((i) => {
                            const n = comIntensidade.filter((t) => t.periodizacao.intensidade === i.id).length
                            const pct = Math.round((n / comIntensidade.length) * 100)
                            return (
                                <li key={i.id}>
                                    <span className={styles.name}>{i.nome}</span>
                                    <span className={styles.track} aria-hidden='true'>
                                        <span className={styles[i.id]} style={{ width: `${pct}%` }} />
                                    </span>
                                    <span className={styles.n}>{n} ({pct}%)</span>
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
        </div>
    )
}
