import { FASES } from '../../utils/periodization'
import styles from './periodization.module.css'

// Bloco da periodização: quantos treinos tem cada fase. Clicar numa fase mostra os
// treinos dela no carrossel logo abaixo.
export const Periodization = ({ trainings, loadError, selected, current, onSelect }) => {
    const lista = trainings ?? []
    const contar = (id) => lista.filter((t) => t.periodizacao?.fase === id)
    // A recuperação só aparece quando existe no plano
    const fases = FASES.filter((f) => f.id !== 'recuperacao' || contar(f.id).length > 0)
    const escolhida = FASES.find((f) => f.id === selected)

    return (
        <div className={styles.periodization}>
            <h2>Periodização</h2>
            {trainings === null && !loadError && <p className={styles.message}>Carregando...</p>}
            {loadError && <p className={styles.message} role='alert'>{loadError}</p>}
            {trainings && lista.every((t) => !t.periodizacao) && (
                <p className={styles.message}>
                    Gere seus treinos no Perfil para ver a periodização (Acumulação, Transição e Realização).
                </p>
            )}
            {lista.some((t) => t.periodizacao) && (
                <>
                    <div className={styles.atr} role='tablist' aria-label='Fases da periodização'>
                        {fases.map((f) => {
                            const daFase = contar(f.id)
                            const feitos = daFase.filter((t) => t.completed).length
                            return (
                                <button
                                    type='button'
                                    role='tab'
                                    key={f.id}
                                    aria-selected={selected === f.id}
                                    className={`${styles.choice} ${selected === f.id ? styles.selected : ''}`}
                                    onClick={() => onSelect(f.id)}
                                >
                                    <span className={styles.phaseName}>{f.nome} ({f.sigla})</span>
                                    <span className={styles.count}>
                                        {daFase.length} {daFase.length === 1 ? 'treino' : 'treinos'}
                                    </span>
                                    <span className={styles.done}>{feitos} feitos</span>
                                    {current === f.id && <span className={styles.now}>Você está aqui</span>}
                                </button>
                            )
                        })}
                    </div>
                    <p className={styles.about}>Sobre</p>
                    <p className={styles.description}>
                        {escolhida ? `${escolhida.nome}: ${escolhida.sobre}` : 'Periodização ATR: Acumulação, Transição e Realização.'}
                    </p>
                </>
            )}
        </div>
    )
}
