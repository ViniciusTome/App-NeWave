import { useState } from 'react'
import { ContactSupport, DeleteAccount } from '../AccountForms'
import { version } from '../../../package.json'
import { Modal } from '../Modal'
import { OPEN_TUTORIAL } from '../Tutorial'
import styles from './support.module.css'

// Suporte: mensagem para a equipe e excluir a conta
export const Support = () => {
    const [aberto, setAberto] = useState(null) // 'contato' | 'excluir'

    return (
        <div className={styles.contact}>
            <button type='button' className={styles.link} onClick={() => window.dispatchEvent(new Event(OPEN_TUTORIAL))}>Ver o tutorial</button>
            <button type='button' className={styles.link} onClick={() => setAberto('contato')}>Entre em contato</button>
            <button type='button' className={`${styles.link} ${styles.danger}`} onClick={() => setAberto('excluir')}>Excluir conta</button>
            <p className={styles.versao}>NeWave versão {version}</p>
            <Modal open={aberto === 'contato'} onClose={() => setAberto(null)} title='Fale com a gente'>
                {aberto === 'contato' && <ContactSupport onDone={() => setAberto(null)} />}
            </Modal>
            <Modal open={aberto === 'excluir'} onClose={() => setAberto(null)} title='Excluir conta'>
                {aberto === 'excluir' && <DeleteAccount onDone={() => setAberto(null)} />}
            </Modal>
        </div>
    )
}
