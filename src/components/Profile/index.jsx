import styles from './profile.module.css'
import { useAuth } from '../../hooks/useAuth'

export const Profile = () => {

    // Nome e email de quem está logado (vêm do backend)
    const { user } = useAuth()

    return (
        <div className={styles.profile}>
            <img src="../../src/assets/logoBranco.png" />
            <div className={styles.description}>
                <p  className={styles.name}>{user?.name}</p>
                <p  className={styles.email}>{user?.email}</p>
                <p className={styles.treinos}>Treinos realizados: 43 treinos - (Você está em uma sequência de 36 treinos sem falhar!)</p>
                <p className={styles.competitionDate}>Proxima Competição: 29/11/2025 - (Faltam x dias para a sua competição.)</p>
            </div>
        </div>
    )
}
