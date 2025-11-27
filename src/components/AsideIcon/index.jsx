import styles from './asideicon.module.css'

export const AsideIcon = ({ children, icon }) => {

    return (
        <div className={styles.container}>
            <div>{icon}</div>
            {children}
        </div>
    )
}