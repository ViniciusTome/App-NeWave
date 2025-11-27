import { Training } from '../Training'
import styles from './card.module.css'

export const Card = ({treino, data, inTrainingPage}) => {
    

    const style = (inTrainingPage) ? styles.trainingPageContainer : styles.container;
    const style2 = (inTrainingPage) ? styles.trainingPageContent : styles.content;

    return (
        <div className={style}>
            <p className={styles.header}>Treino <strong>{treino}</strong> - {data}</p>
            <div className={style2}>
                <Training/>
                {/* treino */}
                {/* Anotações e Feedback */}
            </div>
        </div>
    )
}