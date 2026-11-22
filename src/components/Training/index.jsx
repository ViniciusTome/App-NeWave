import { MainSeries } from "./MainSeries"
import { Release } from "./Release"
import { Speed } from "./Speed"
import { WarmUp } from "./WarmUp"
import styles from './training.module.css'

// As quatro partes de um treino, na ordem em que são nadadas
const SECTIONS = [
    ['warmUp', 'Aquecimento'],
    ['speed', 'Velocidade'],
    ['mainSeries', 'Série Principal'],
    ['release', 'Soltura'],
]

// Sem `training`: mostra o treino de exemplo (usado nos cartões).
// Com `training` (vindo do banco): mostra as partes preenchidas desse treino.
export const Training = ({ training }) => {

    if (training) {
        return (
            <div>
                {SECTIONS.filter(([key]) => training[key]).map(([key, label]) => (
                    <div key={key} className={styles.section}>
                        <h3>{label}</h3>
                        <p className={styles.text}>{training[key]}</p>
                    </div>
                ))}
            </div>
        )
    }

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