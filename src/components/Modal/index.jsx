import { useEffect, useId, useRef } from 'react'
import styles from './modal.module.css'

// Janela flutuante reutilizável.
// Uso: <Modal open={aberto} onClose={() => setAberto(false)} title='Título'>conteúdo</Modal>
// Fecha com o botão X, com a tecla Esc ou clicando fora da janela.
export const Modal = ({ open, onClose, title, children }) => {
    const dialogRef = useRef(null)
    const titleId = useId()

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        if (open && !dialog.open) dialog.showModal()
        if (!open && dialog.open) dialog.close()
    }, [open])

    // Clique no fundo escuro (fora do painel) fecha a janela
    const handleClick = (event) => {
        if (event.target === event.currentTarget) onClose()
    }

    return (
        <dialog
            ref={dialogRef}
            className={styles.dialog}
            aria-labelledby={titleId}
            onClose={onClose}
            onClick={handleClick}
        >
            <div className={styles.panel}>
                <header className={styles.header}>
                    <h2 id={titleId} className={styles.title}>{title}</h2>
                    <button type='button' className={styles.close} onClick={onClose} aria-label='Fechar'>
                        <svg viewBox='0 0 24 24' width='20' height='20' aria-hidden='true'>
                            <path d='M6 6l12 12M18 6L6 18' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' />
                        </svg>
                    </button>
                </header>
                <div className={styles.body}>
                    {open && children}
                </div>
            </div>
        </dialog>
    )
}
