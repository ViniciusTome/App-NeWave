import styles from './homepage.module.css'
import { Main } from '../../components/Main'
import { Carousel } from '../../components/Carousel'
import { Dashboard } from '../../components/Dashboard'
import { Aside } from '../../components/Aside'
import { PendingTrainings } from '../../components/PendingTrainings'

export const HomePage = () => {
    return (
        <div className={styles.scrollArea}>
                <Aside/>
            <Main>
                <Carousel />
                <Dashboard />
            </Main>
            {/* Ao abrir o app: os treinos que passaram sem resposta (fez ou não?) */}
            <PendingTrainings />
        </div>
    )
}