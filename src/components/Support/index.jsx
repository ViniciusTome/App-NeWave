import { useState } from 'react'
import { ContactSupport, DeleteAccount } from '../AccountForms'
import { Modal } from '../Modal'
import styles from './support.module.css'

// Suporte: mensagem para a equipe e excluir a conta
export const Support = () => {
    const [aberto, setAberto] = useState(null) // 'contato' | 'excluir'

    return (
        <div className={styles.contact}>
            <button type='button' className={styles.link} onClick={() => setAberto('contato')}>Entre em contato</button>
            <button type='button' className={`${styles.link} ${styles.danger}`} onClick={() => setAberto('excluir')}>Excluir conta</button>
            <Modal open={aberto === 'contato'} onClose={() => setAberto(null)} title='Fale com a gente'>
                {aberto === 'contato' && <ContactSupport onDone={() => setAberto(null)} />}
            </Modal>
            <Modal open={aberto === 'excluir'} onClose={() => setAberto(null)} title='Excluir conta'>
                {aberto === 'excluir' && <DeleteAccount onDone={() => setAberto(null)} />}
            </Modal>
        </div>
    )
}
