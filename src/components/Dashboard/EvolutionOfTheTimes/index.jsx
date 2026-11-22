import { useEffect, useState } from 'react'
import { Modal } from '../../Modal'
import { api } from '../../../services/api'
import { formatDate, formatSecondsDiff, formatSwimTime } from '../../../utils/format'
import { AddTestForm } from './AddTestForm'
import { TimesChart } from './TimesChart'
import styles from './evolutionofthetimes.module.css'

export const EvolutionOfTheTimes = () => {
    const [tests, setTests] = useState(null) // null = carregando
    const [loadError, setLoadError] = useState('')
    const [chosenDistance, setChosenDistance] = useState(null)
    const [openModal, setOpenModal] = useState(null) // 'add' | 'list' | null

    useEffect(() => {
        let cancelled = false
        api('/tests')
            .then(({ tests }) => {
                if (!cancelled) setTests(tests)
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err.message)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const allTests = tests ?? []
    const distances = [...new Set(allTests.map((t) => t.distance))].sort((a, b) => a - b)
    // Sem escolha: mostra a distância do teste mais recente
    const latest = allTests.reduce((a, b) => (b.date >= a.date ? b : a), allTests[0])
    const distance = distances.includes(chosenDistance) ? chosenDistance : latest?.distance
    const shown = allTests.filter((t) => t.distance === distance)

    const best = shown.length ? Math.min(...shown.map((t) => t.timeHundredths)) : null
    const change = shown.length > 1 ? shown.at(-1).timeHundredths - shown[0].timeHundredths : 0

    const handleSaved = (test) => {
        setTests((current) =>
            [...(current ?? []), test].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
        )
        setChosenDistance(test.distance)
        setOpenModal(null)
    }

    const handleDelete = async (test) => {
        const ok = window.confirm(
            `Apagar o teste de ${test.distance} m (${formatSwimTime(test.timeHundredths)}) de ${formatDate(test.date)}?`,
        )
        if (!ok) return
        try {
            await api(`/tests/${test.id}`, { method: 'DELETE' })
            setTests((current) => current.filter((t) => t.id !== test.id))
        } catch (err) {
            window.alert(err.message)
        }
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h4>Evolução dos Tempos</h4>
                {tests && (
                    <button type='button' className={styles.addButton} onClick={() => setOpenModal('add')}>
                        + Teste
                    </button>
                )}
            </header>

            {tests === null && !loadError && <p className={styles.message}>Carregando testes...</p>}
            {loadError && <p className={styles.message} role='alert'>{loadError}</p>}

            {tests && tests.length === 0 && (
                <div className={styles.empty}>
                    <p>Você ainda não registrou nenhum teste.</p>
                    <p className={styles.hint}>Registre os tempos dos seus testes para acompanhar a evolução aqui.</p>
                    <button type='button' className={styles.primaryButton} onClick={() => setOpenModal('add')}>
                        Registrar primeiro teste
                    </button>
                </div>
            )}

            {shown.length > 0 && (
                <>
                    {distances.length > 1 && (
                        <div className={styles.chips} role='group' aria-label='Distância'>
                            {distances.map((d) => (
                                <button
                                    key={d}
                                    type='button'
                                    className={d === distance ? styles.chipActive : styles.chip}
                                    aria-pressed={d === distance}
                                    onClick={() => setChosenDistance(d)}
                                >
                                    {d} m
                                </button>
                            ))}
                        </div>
                    )}

                    <div className={styles.summary}>
                        <span>
                            Melhor ({distance} m): <strong>{formatSwimTime(best)}</strong>
                        </span>
                        {change !== 0 && (
                            <span className={change < 0 ? styles.better : styles.worse}>
                                {change < 0 ? '▲ ' : '▼ '}
                                {formatSecondsDiff(change)} {change < 0 ? 'mais rápido' : 'mais lento'} que o 1º teste
                            </span>
                        )}
                    </div>

                    <div className={styles.chartArea}>
                        <TimesChart tests={shown} />
                    </div>

                    <p className={styles.caption}>
                        {shown.length === 1
                            ? 'Registre mais testes para ver a evolução.'
                            : 'Quanto mais alto o ponto, mais rápido.'}
                    </p>

                    <button type='button' className={styles.linkButton} onClick={() => setOpenModal('list')}>
                        Ver todos os testes
                    </button>
                </>
            )}

            <Modal open={openModal === 'add'} onClose={() => setOpenModal(null)} title='Registrar teste'>
                <AddTestForm defaultDistance={distance} onSaved={handleSaved} />
            </Modal>

            <Modal open={openModal === 'list'} onClose={() => setOpenModal(null)} title='Seus testes'>
                {allTests.length === 0 ? (
                    <p>Nenhum teste registrado.</p>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope='col'>Data</th>
                                <th scope='col'>Distância</th>
                                <th scope='col'>Tempo</th>
                                <th scope='col'><span className={styles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...allTests].reverse().map((t) => (
                                <tr key={t.id}>
                                    <td>{formatDate(t.date)}</td>
                                    <td>{t.distance} m</td>
                                    <td>{formatSwimTime(t.timeHundredths)}</td>
                                    <td>
                                        <button type='button' className={styles.deleteButton} onClick={() => handleDelete(t)}>
                                            Apagar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Modal>
        </div>
    )
}
