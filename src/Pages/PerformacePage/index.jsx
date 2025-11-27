import { Aside } from '../../components/Aside';
import { Card } from '../../components/Card'
import { EvolutionOfTheTimes } from '../../components/Dashboard/EvolutionOfTheTimes';
import { Input } from '../../components/Input'
import { TestAndTimes } from '../../components/TestAndTimes';
import styles from './performancepage.module.css'


export const PerformancePage = () => {

    const lista = [];
    const tamanhoDaLista = 50;
    for (let i = 0; i < tamanhoDaLista; i++) {
        lista.push(i);
    }

    const popup = (index) => {
        console.log(`Treino ${index}`)

    }

    return (
        <div className={styles.container}>
            <Aside/>
            <div>
                <div className={styles.feedback}>
                    <h2>FeedBack</h2>
                    <Input className={styles.input} placeholder='Procure o treino...'/>
                    <div className={styles.boxCards}>
                        {lista.map((item, index) => (
                            <div key={index + 1} className={styles.boxCardComplete} onClick={() => popup(index + 1)}>
                                <div key={index + 1} className={styles.boxCard}>
                                    <a href='#'><Card treino={index +1} inTrainingPage='true' /></a>
                                </div>
                                <div className={styles.boxFeedback}>
                                    <ul>
                                        <li><strong>Dificuldade:</strong> fácil</li>
                                        <li><strong>Realizou todos?</strong> Quase todos</li>
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <h2 className={styles.SectionName}>Desempenho</h2>
                <div className={styles.TestAndTimes}>
                    <TestAndTimes/>
                </div>
                <div className={styles.EvolutionTimes}>
                    <EvolutionOfTheTimes/>
                </div>
            </div>
            
        </div>
    )
}
                    