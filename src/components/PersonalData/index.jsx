import styles from './personaldata.module.css'

export const PersonalData = () => {

    return (
        <div className={styles.profile}>

            <div className={styles.description}>
                <div className={styles.name}>
                    <label>Nome</label>
                    <p style={{ color: 'white' }} className={styles.name}>Vinicius Tomé Damasio</p>
                </div>
                <div className={styles.email}>
                    <label>Email</label>
                    <p style={{ color: 'white' }} className={styles.email}>viniciustomee98@gmail.com</p>
                </div>
                <div className={styles.phone}>
                    <label>Telefone</label>
                    <p className={styles.treinos}>(44) 99114-3522</p>
                </div>
                <div className={styles.password}>
                    <label>Senha</label>
                    <p className={styles.competitionDate}>*************</p>
                </div>
                <div className={styles.birth}>
                    <label>Data de Nascimento</label>
                    <p className={styles.competitionDate}>08/04/1998</p>
                </div>
            </div>
        </div>
    )
}