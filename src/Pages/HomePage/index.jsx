import styles from './homepage.module.css'
import { Main } from '../../components/Main'
import { Carousel } from '../../components/Carousel'
import { Dashboard } from '../../components/Dashboard'
import { Aside } from '../../components/Aside'

export const HomePage = () => {
    return (
        <div className={styles.scrollArea}>
                <Aside/>
            <Main>
                <Carousel />
                <Dashboard />
            </Main>
        </div>
    )
}