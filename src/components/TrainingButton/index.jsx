import styles from './trainingbutton.module.css'

export const TrainingButton = () => {

    return(
        <div className={styles.container}>
            <a href='#' className={styles.button}>
                Gerar treinos
            </a>
            
        </div>
    )
}