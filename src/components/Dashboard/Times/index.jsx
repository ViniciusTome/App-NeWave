import styles from './times.module.css'

export const Times = () => {

    return (
        <div className={styles.times}>
            <header>
                <h2>Tempos</h2>
                <p className={styles.descriptionTest}>Baseado no texte de 400 metros</p>
            </header>
            <div className={styles.divIntensityPercent}>
                <div className={styles.divIntensities}>
                    <p>50 Metros</p>
                    <p className={styles.descriptionIntensity}>A1: 55"</p>
                    <p className={styles.descriptionIntensity}>A2: 53"</p>
                    <p className={styles.descriptionIntensity}>A3: 51"</p>
                </div>
                <div className={styles.divIntensities}>
                    <p>100 Metros</p>
                    <p className={styles.descriptionIntensity}>A1: 1'40"</p>
                    <p className={styles.descriptionIntensity}>A2: 1'38"</p>
                    <p className={styles.descriptionIntensity}>A3: 1'36"</p>
                </div>
                <div className={styles.divIntensities}>
                    <p>200 Metros</p>
                    <p className={styles.descriptionIntensity}>A1: 2'40"</p>
                    <p className={styles.descriptionIntensity}>A2: 2'36"</p>
                    <p className={styles.descriptionIntensity}>A3: 2'32"</p>
                </div>
                <div className={styles.divIntensities}>
                    <p>400 Metros</p>
                    <p className={styles.descriptionIntensity}>A1: 2'40"</p>
                    <p className={styles.descriptionIntensity}>A2: 2'36"</p>
                    <p className={styles.descriptionIntensity}>A3: 2'32"</p>
                </div>

            </div>
        </div>
    )
}