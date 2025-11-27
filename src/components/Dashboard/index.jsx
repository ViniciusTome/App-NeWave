import { EvolutionOfTheTimes} from './EvolutionOfTheTimes'
import { Times } from './Times'
import { TrainingHistory } from './TrainingHistory'
import styles from './dashboard.module.css'

export const Dashboard = () => {

    return (
        <div >
            <h2 style={{ color: 'white' }}>Dashboard</h2>
            <div className={styles.container} >
                <div className={styles.box}>
                    <EvolutionOfTheTimes />
                </div>
                <div className={styles.box}>
                    <TrainingHistory />
                </div>
                <div className={styles.box}>
                    <Times />
                </div>
            </div>
        </div>
    )
}