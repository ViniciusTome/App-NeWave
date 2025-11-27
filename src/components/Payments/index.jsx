import styles from './payments.module.css'

export const Payments = () => {
    const getAPlan = true;

    const getPayment = () => {
        if (getAPlan) {
            return (
                <div className={styles.description}>
                    <div className={styles.description}>
                        <div className={styles.plan}>
                            <p style={{ color: 'white' }} className={styles.name}> Plano Trimestal (set/25 a nov/25) -  </p>
                            <a href='#'>Renovar</a>
                            <p className={styles.name}> - </p>
                            <a href='#'>Cancelar</a>
                        </div>
                    </div>
                </div>
            )
        } else {
            return (
                <div className={styles.description}>
                    <div className={styles.description}>
                        <div className={styles.plan}>
                            <a style={{ cursor: 'pointer' }}> ADIQUIRA UM PLANO </a>
                        </div>
                    </div>
                </div>

            )
        }
    }


    return (
        <div className={styles.profile}>
            {getPayment()}
        </div>
    )
}