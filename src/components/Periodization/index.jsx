import styles from './periodization.module.css'


export const Periodization = () => {

    return (
        <div className={styles.periodization}>
            <h2 >Periodização</h2>
            <div className={styles.atr}>
                <div className={styles.choice} >
                    <p>Acumulação (A)</p>
                    <p>20 treinos</p>
                </div>
                <div className={styles.choice}>
                    <p>Transição (T)</p>
                    <p>20 treinos</p>
                </div>
                <div className={styles.choice}>
                    <p>Realização (R)</p>
                    <p>4 treinos</p>
                </div>
            </div>
            <p className={styles.about}>Sobre</p>
            <p className={styles.description}>Periodização ATR </p>
        </div>
    )
}