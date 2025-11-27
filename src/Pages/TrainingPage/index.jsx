import { Aside } from "../../components/Aside"
import { CardsTraining } from "../../components/CardsTraining"
import { Times } from "../../components/Dashboard/Times"
import { Intensity } from "../../components/Intensity"
import { Periodization } from "../../components/Periodization"
import { Volume } from "../../components/Volume"

import styles from './trainingpage.module.css'


export const TrainingPage = () => {

    return (
        <div className={styles.container}>
            <Aside/>
            <div className={styles.periodization} >
                <Periodization/>
                <CardsTraining/>
                <div className={styles.volume} >
                    <Volume/>
                    <Intensity/>
                </div>
                <div className={styles.times} >
                    <Times/>
                </div>
            </div>
        </div>
    )
}

