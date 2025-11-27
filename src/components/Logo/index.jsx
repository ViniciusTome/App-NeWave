import styles from './logo.module.css'
import logo from '../../assets/logoColorida.png'

export const Logo = () => {

    return (
        <div className={styles.container}>
                <img src={logo} alt='logo newave' className={styles.img} />
                <h2 className={styles.name}>NEWAVE</h2>
        </div>
    )
}