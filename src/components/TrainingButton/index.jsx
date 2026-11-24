import { useState } from 'react'
import { GenerateTrainings } from '../GenerateTrainings'
import { Modal } from '../Modal'
import styles from './trainingbutton.module.css'

export const TrainingButton = () => {
    const [open, setOpen] = useState(false)

    return(
        <div className={styles.container}>
            <button type='button' className={styles.button} onClick={() => setOpen(true)} data-tour='gerar'>
                Gerar treinos
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title='Gerar treinos'>
                {/* A janela recomeça do início toda vez que abre */}
                <GenerateTrainings onClose={() => setOpen(false)} />
            </Modal>
        </div>
    )
}
