import { TrainingButton } from "../TrainingButton"
import { Logo } from "../Logo"
import styles from './aside.module.css'
import { Menu } from "../Menu"
import { Link } from "react-router-dom"


export const Aside = () => {

    return (
        <div className={styles.container}>
            <Link to='/page/home' className={styles.link}><Logo/></Link> 
            <TrainingButton/>
            <Menu/>
        </div>
    )
}