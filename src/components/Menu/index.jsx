import styles from './menu.module.css'
import { IconAccount } from '../icons/IconAccount'
import { IconFeed } from '../icons/IconFeed'
import { IconInfo } from '../icons/IconInfo'
import { IconLogin } from '../icons/IconLogin'
import { AsideIcon } from '../AsideIcon'
import { Link } from 'react-router-dom'

export const Menu = () => {

    return (
        <div className={styles.container}>
            <div className={styles.icon}>
                <Link to='/page/profile' className={styles.link}>
                    <AsideIcon icon={<IconAccount/>} className={styles.asideicon}>
                        Perfil
                    </AsideIcon>
                </Link>
            </div>
            <div className={styles.icon}>
                <Link to='/page/training' className={styles.link}>
                    <AsideIcon icon={<IconFeed/>} className={styles.asideicon}>
                        Treinos/Periodização
                    </AsideIcon>
                </Link>
            </div>
            <div className={styles.icon}>
                <Link to='/page/performance' className={styles.link}>
                    <AsideIcon icon={<IconInfo/>} className={styles.asideicon}>
                        Desempenho/Feedback
                    </AsideIcon>
                </Link>
            </div>
            <div className={styles.icon}>
                <Link to='/auth/logout' className={styles.link}>
                    <AsideIcon icon={<IconLogin/>} className={styles.asideicon}>
                        Sair
                    </AsideIcon>
                </Link>
            </div>
        </div>
    )
}