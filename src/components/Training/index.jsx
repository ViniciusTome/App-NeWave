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

    // Treino gerado: as partes na ordem, com observação e o tempo estimado
    if (training?.partes) {
        return (
            <div>
                {training.partes.map((parte, i) => (
                    <div key={i} className={styles.section}>
                        <h3>{parte.titulo}</h3>
                        <p className={styles.text}>{parte.texto}</p>
                        {parte.observacao && <p className={styles.note}>{parte.observacao}</p>}
                        {parte.metros > 0 && (
                            <p className={styles.estimate}>{parte.metros} m · ~{parte.minutos} min</p>
                        )}
                    </div>
                ))}
            </div>
        )
    }

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