import { Aside } from '../../components/Aside'
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
                    <h2 style={{color: 'black', margin: '10px'}}>Perfil</h2>
                    <Profile/>
                </div>
                
                <div className={styles.container}>
                    <h2 style={{color: 'black', margin: '10px'}}>Dados pessoais</h2>
                    <PersonalData/>
                </div>
                
                <div className={styles.container}>
                    <h2 style={{color: 'black', margin: '10px'}}>Pagamentos</h2>
                    <Payments/>
                </div>
                
                <div className={styles.container}>
                    <h2 style={{color: 'black', margin: '10px'}}>Suporte</h2>
                    <Support/>
                </div>
            </div>
        </div>
    )
}