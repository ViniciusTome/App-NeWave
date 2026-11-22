import { Training } from '../Training'
import { formatDate } from '../../utils/format'
import styles from './card.module.css'

// Cartão de treino.
// - Com `training` (vindo do banco): mostra o título, a data e as partes desse treino.
// - Sem `training`: mostra o treino de exemplo com o número e a data recebidos.
// - `className` permite que quem usa o cartão acrescente estilos (ex.: destaque no carrossel).
export const Card = ({ treino, data, inTrainingPage, training, className = '' }) => {

    const style = (inTrainingPage) ? styles.trainingPageContainer : styles.container;
    const style2 = (inTrainingPage) ? styles.trainingPageContent : styles.content;

    return (
        <div className={`${style} ${className}`}>
            {training ? (
                <p className={`${styles.header} ${styles.realHeader}`}>
                    <strong>{training.title || 'Treino'}</strong> - {formatDate(training.date)}
                </p>
            ) : (
                <p className={styles.header}>Treino <strong>{treino}</strong> - {data}</p>
            )}
            <div className={`${style2} ${training ? styles.real : ''}`}>
                <Training training={training}/>
            </div>
        </div>
    )
}
