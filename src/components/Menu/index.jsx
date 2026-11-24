import styles from './menu.module.css'
import { IconAccount } from '../icons/IconAccount'
import { IconFeed } from '../icons/IconFeed'
import { IconInfo } from '../icons/IconInfo'
import { IconBook } from '../icons/IconBook'
import { IconLogin } from '../icons/IconLogin'
import { IconHome } from '../icons/IconHome'
import { AsideIcon } from '../AsideIcon'
import { NavLink } from 'react-router-dom'

// No computador: menu na lateral. No celular: barra fixa embaixo da tela, com os
// nomes curtos e o "Início" (no computador o início é a logo).
const ITENS = [
    { to: '/page/home', icon: <IconHome />, nome: 'Início', short: 'Início', soCelular: true, tour: 'menu-inicio' },
    { to: '/page/profile', icon: <IconAccount />, nome: 'Perfil', short: 'Perfil', tour: 'menu-perfil' },
    { to: '/page/training', icon: <IconFeed />, nome: 'Treinos/Periodização', short: 'Treinos', tour: 'menu-treinos' },
    { to: '/page/performance', icon: <IconInfo />, nome: 'Desempenho/Feedback', short: 'Desempenho', tour: 'menu-desempenho' },
    { to: '/page/glossario', icon: <IconBook />, nome: 'Glossário', short: 'Glossário', tour: 'menu-glossario' },
    { to: '/auth/logout', icon: <IconLogin />, nome: 'Sair', short: 'Sair', tour: 'menu-sair' },
]

export const Menu = () => {

    return (
        <nav className={styles.container} aria-label='Menu principal'>
            {ITENS.map((item) => (
                <div key={item.to} className={`${styles.icon} ${item.soCelular ? styles.soCelular : ''}`} data-tour={item.tour}>
                    <NavLink
                        to={item.to}
                        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
                    >
                        <AsideIcon icon={item.icon} short={item.short}>
                            {item.nome}
                        </AsideIcon>
                    </NavLink>
                </div>
            ))}
        </nav>
    )
}
