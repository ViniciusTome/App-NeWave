import { useState } from 'react'
import { GenerateTrainings } from '../GenerateTrainings'
import { Modal } from '../Modal'
import { api } from '../../services/api'
import { todayIso } from '../../utils/format'
import styles from './trainingbutton.module.css'

// "Não avisar novamente" (aviso de que os treinos agendados serão trocados): guardado neste aparelho
const SKIP_WARNING = 'newave:nao-avisar-gerar'
const skipWarning = () => {
    try {
        return localStorage.getItem(SKIP_WARNING) === '1'
    } catch {
        return false
    }
}
const rememberSkipWarning = () => {
    try {
        localStorage.setItem(SKIP_WARNING, '1')
    } catch {
        // sem armazenamento: avisa de novo da próxima vez
    }
}

// Botão "Gerar treinos". Se o atleta ainda tem treinos agendados para fazer, avisa antes
// que eles serão trocados por novos (a não ser que ele tenha marcado "Não avisar novamente").
export const TrainingButton = () => {
    const [open, setOpen] = useState(false)
    const [pending, setPending] = useState(null) // treinos por fazer (abre o aviso)
    const [dontWarn, setDontWarn] = useState(false)
    const [checking, setChecking] = useState(false)

    const start = async () => {
        if (skipWarning()) return setOpen(true)
        setChecking(true)
        try {
            const { trainings } = await api(`/trainings/upcoming?today=${todayIso()}`)
            if (trainings.length > 0) {
                setDontWarn(false)
                setPending(trainings.length)
            } else setOpen(true)
        } catch {
            setOpen(true) // sem conseguir conferir: segue (o resumo também avisa)
        } finally {
            setChecking(false)
        }
    }

    const keepGoing = () => {
        if (dontWarn) rememberSkipWarning()
        setPending(null)
        setOpen(true)
    }

    return(
        <div className={styles.container}>
            <button type='button' className={styles.button} onClick={start} disabled={checking} data-tour='gerar'>
                Gerar treinos
            </button>
            <Modal open={pending !== null} onClose={() => setPending(null)} title='Gerar novos treinos?'>
                <div className={styles.warning}>
                    <p>
                        Você ainda tem {pending === 1 ? '1 treino' : `${pending >= 50 ? 'mais de 50' : pending} treinos`} para fazer.
                        Se gerar novos treinos, <strong>vai perder {pending === 1 ? 'esse treino' : 'esses treinos'}</strong> e
                        serão gerados novos no lugar. Os treinos que você já concluiu continuam salvos.
                    </p>
                    <p>Tem certeza que deseja fazer isso?</p>
                    <label className={styles.checkbox}>
                        <input type='checkbox' checked={dontWarn} onChange={(e) => setDontWarn(e.target.checked)} />
                        Não avisar novamente
                    </label>
                    <div className={styles.actions}>
                        <button type='button' className={styles.secondary} onClick={() => setPending(null)}>Cancelar</button>
                        <button type='button' className={styles.primary} onClick={keepGoing}>Sim, gerar novos</button>
                    </div>
                </div>
            </Modal>
            <Modal open={open} onClose={() => setOpen(false)} title='Gerar treinos'>
                {/* A janela recomeça do início toda vez que abre */}
                <GenerateTrainings onClose={() => setOpen(false)} />
            </Modal>
        </div>
    )
}
