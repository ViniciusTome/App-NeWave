import { formatMeters, monthOf, trainingOfTheDay, volumeBetween, weekOf } from '../../utils/periodization'
import { formatDate } from '../../utils/format'
import styles from './volume.module.css'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Volume: o treino do dia, a semana (segunda a domingo) e o mês. Em cada período,
// o que está planejado e quanto já foi feito.
export const Volume = ({ trainings, today }) => {
    const doDia = trainingOfTheDay(trainings, today)
    const semana = weekOf(today)
    const mes = monthOf(today)
    const metricas = [
        {
            nome: doDia?.date === today ? 'Treino de hoje' : 'Próximo treino',
            valor: doDia ? formatMeters(doDia.metros) : '—',
            detalhe: doDia ? (doDia.date === today ? (doDia.completed ? 'feito' : 'a fazer') : formatDate(doDia.date)) : 'sem treino agendado',
        },
        { nome: 'Semana', ...periodo(volumeBetween(trainings, semana)), extra: `${formatDate(semana.inicio).slice(0, 5)} a ${formatDate(semana.fim).slice(0, 5)}` },
        { nome: 'Mês', ...periodo(volumeBetween(trainings, mes)), extra: MESES[Number(today.slice(5, 7)) - 1] },
    ]

    return (
        <div className={styles.volume} >
            <h2>Volume</h2>
            <div className={styles.metrics}>
                {metricas.map((m) => (
                    <div key={m.nome} className={styles.metric}>
                        <span className={styles.label}>{m.nome}{m.extra && <small> · {m.extra}</small>}</span>
                        <strong className={styles.value}>{m.valor}</strong>
                        {m.progresso !== undefined && (
                            <span className={styles.bar} aria-hidden='true'>
                                <span style={{ width: `${m.progresso}%` }} />
                            </span>
                        )}
                        <span className={styles.detail}>{m.detalhe}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function periodo({ planejado, feito, treinos }) {
    if (treinos === 0) return { valor: '—', detalhe: 'sem treinos' }
    return {
        valor: formatMeters(planejado),
        progresso: planejado > 0 ? Math.round((feito / planejado) * 100) : 0,
        detalhe: `${formatMeters(feito)} feitos · ${treinos} ${treinos === 1 ? 'treino' : 'treinos'}`,
    }
}
