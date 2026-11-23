import styles from './asideicon.module.css'

// Ícone do menu com o nome embaixo. `short`: nome curto para o menu do celular.
export const AsideIcon = ({ children, icon, short }) => {

    return (
        <div className={styles.container}>
            <div>{icon}</div>
            <span className={short ? styles.long : undefined}>{children}</span>
            {short && <span className={styles.short}>{short}</span>}
        </div>
    )
}
