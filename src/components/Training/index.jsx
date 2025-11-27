import { MainSeries } from "./MainSeries"
import { Release } from "./Release"
import { Speed } from "./Speed"
import { WarmUp } from "./WarmUp"
import styles from './training.module.css'

export const Training = () => {

    return (
        <div className={styles.gap}>
            <div className={styles.gap}>
                <WarmUp/>       {/* aquecimento */}
            </div>
            <div className={styles.gap}>
                <Speed/>        {/* velocidade */}
            </div>
            <div className={styles.gap}>
                <MainSeries/>   {/* serie principal */} 
            </div>
            <div className={styles.gap}>
                <Release/>      {/* soltura */}
            </div>
        </div>
    )
}