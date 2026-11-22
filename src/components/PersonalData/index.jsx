import styles from './personaldata.module.css'
import { useAuth } from '../../hooks/useAuth'

export const PersonalData = () => {

    // Nome e email de quem está logado (vêm do backend)
    const { user } = useAuth()

    return (
        <div className={styles.profile}>

            <div className={styles.description}>
                <div className={styles.name}>
                    <label>Nome</label>
                    <p style={{ color: 'white' }} className={styles.name}>{user?.name}</p>
                </div>
                <div className={styles.email}>
                    <label>Email</label>
                    <p style={{ color: 'white' }} className={styles.email}>{user?.email}</p>
                </div>
                <div className={styles.phone}>
                    <label>Telefone</label>
                    <p className={styles.treinos}>(99) 99999-9999</p>
                </div>
                <div className={styles.password}>
                    <label>Senha</label>
                    <p className={styles.competitionDate}>*************</p>
                </div>
                <div className={styles.birth}>
                    <label>Data de Nascimento</label>
                    <p className={styles.competitionDate}>01/01/1900</p>
                </div>
            </div>
        </div>
    )
}
