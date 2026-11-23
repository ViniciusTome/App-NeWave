import { useCallback, useEffect, useState } from 'react'
import styles from './profile.module.css'
import { useAuth } from '../../hooks/useAuth'
import { useAccount } from '../../hooks/useAccount'
import { api, ATHLETE_CHANGED } from '../../services/api'
import { daysUntil, daysUntilText, competitionLabel } from '../../utils/athlete'
import { todayIso } from '../../utils/format'
import logo from '../../assets/logoBranco.svg'

export const Profile = () => {

    // Nome e email de quem está logado (vêm do backend)
    const { user } = useAuth()
    // Treinos realizados e a sequência sem falhar (calculados pelos treinos de verdade)
    const { data } = useAccount()
    const stats = data?.stats

    // Próxima competição do calendário (undefined = carregando)
    const [nextCompetition, setNextCompetition] = useState(undefined)

    const load = useCallback(() => {
        api(`/competitions?today=${todayIso()}`)
            .then(({ competitions }) => setNextCompetition(competitions[0] ?? null))
            .catch(() => setNextCompetition(null))
    }, [])

    useEffect(() => {
        load()
        window.addEventListener(ATHLETE_CHANGED, load)
        return () => window.removeEventListener(ATHLETE_CHANGED, load)
    }, [load])

    return (
        <div className={styles.profile}>
            <img src={logo} alt='' />
            <div className={styles.description}>
                <p  className={styles.name}>{user?.name}</p>
                <p  className={styles.email}>{user?.email}</p>
                {stats && (
                    <p className={styles.treinos}>
                        Treinos realizados: {stats.realizados} {stats.realizados === 1 ? 'treino' : 'treinos'}
                        {stats.sequencia > 1 && ` (você está numa sequência de ${stats.sequencia} treinos sem falhar!)`}
                        {stats.sequencia === 1 && ' (sequência começando: 1 treino sem falhar)'}
                    </p>
                )}
                {nextCompetition !== undefined && (
                    <p className={styles.competitionDate}>
                        Próxima competição: {nextCompetition
                            ? `${competitionLabel(nextCompetition)} (${daysUntilText(daysUntil(nextCompetition.date, todayIso()))})`
                            : 'nenhuma marcada'}
                    </p>
                )}
            </div>
        </div>
    )
}
