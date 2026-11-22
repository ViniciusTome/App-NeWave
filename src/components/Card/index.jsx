import { Training } from '../Training'
import { TrainingGlossary } from '../TrainingGlossary'
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
                <div className={!inTrainingPage && training.partes ? styles.headerRow : undefined}>
                    <p className={`${styles.header} ${styles.realHeader}`}>
                        <strong>{training.title || 'Treino'}</strong> - {formatDate(training.date)}
                    </p>
                    {/* Glossário só dos termos deste treino (nos cards grandes) */}
                    {!inTrainingPage && training.partes && <TrainingGlossary training={training} />}
                </div>
            ) : (
                <p className={styles.header}>Treino <strong>{treino}</strong> - {data}</p>
            )}
            <div className={`${style2} ${training ? styles.real : ''}`}>
                <Training training={training}/>
            </div>
        </div>
    )
}
