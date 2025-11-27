import { Card } from "../Card"
import styles from './cardstraining.module.css'



export const CardsTraining = () => {

    return (
        <div className={styles.container}>
            <a href="#" className={styles.cardTraining}><Card treino='1' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='2' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='3' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='4' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='5' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='6' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='7' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='8' data='25/10/2025' inTrainingPage='true' /></a>
            <a href="#" className={styles.cardTraining}><Card treino='9' data='25/10/2025' inTrainingPage='true' /></a>
        </div>
    )
}