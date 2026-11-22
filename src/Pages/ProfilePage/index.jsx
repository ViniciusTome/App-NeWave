import { Aside } from '../../components/Aside'
import { AthleteSummary } from '../../components/AthleteSummary'
import { CompetitionCalendar } from '../../components/CompetitionCalendar'
import { Payments } from '../../components/Payments'
import { PersonalData } from '../../components/PersonalData'
import { Profile } from '../../components/Profile'
import { Support } from '../../components/Support'
import styles from './profilepage.module.css'

export const ProfilePage = () => {

    return (
        <div className={styles.division}>
            <Aside/>
            <div className={styles.profile}>
                
                <div className={styles.container}>
                    <h2>Perfil</h2>
                    <Profile/>
                </div>
                
                <div className={styles.container}>
                    <h2>Meu treino</h2>
                    <AthleteSummary/>
                </div>

                <div className={styles.container}>
                    <h2>Minhas provas</h2>
                    <CompetitionCalendar/>
                </div>

                <div className={styles.container}>
                    <h2>Dados pessoais</h2>
                    <PersonalData/>
                </div>
                
                <div className={styles.container}>
                    <h2>Pagamentos</h2>
                    <Payments/>
                </div>
                
                <div className={styles.container}>
                    <h2>Suporte</h2>
                    <Support/>
                </div>
            </div>
        </div>
    )
}