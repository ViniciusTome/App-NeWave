import { useEffect, useState } from 'react'
import { api, TRAININGS_CHANGED } from '../../services/api'
import { formatDate, todayIso } from '../../utils/format'
import styles from './trainingsummary.module.css'

const metros = (m) => `${m.toLocaleString('pt-BR')} m`
const nota = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const vezes = (n) => (n === 1 ? '1 vez' : `${n} vezes`)

// Resumo de todos os treinos juntos, ao longo do tempo (na página Desempenho): a nota média
// da série principal, o que mais pesou, a metragem da semana e a frequência.
export const TrainingSummary = () => {
    const [summary, setSummary] = useState(null)
    const [erro, setErro] = useState('')

    useEffect(() => {
        const carregar = () => api(`/trainings/summary?today=${todayIso()}`)
            .then(({ summary }) => { setSummary(summary); setErro('') })
            .catch((err) => setErro(err.message))
        carregar()
        window.addEventListener(TRAININGS_CHANGED, carregar)
        return () => window.removeEventListener(TRAININGS_CHANGED, carregar)
    }, [])

    if (erro) return <div className={styles.box}><h3>Resumo dos treinos</h3><p role='alert'>{erro}</p></div>
    if (!summary) return <div className={styles.box}><h3>Resumo dos treinos</h3><p>Carregando...</p></div>

    const { notas, motivos, semana, frequencia } = summary
    // Nota maior = treino mais difícil
    let tendencia = null
    if (notas.recentes !== null && notas.anteriores !== null) {
        const diferenca = notas.recentes - notas.anteriores
        tendencia = Math.abs(diferenca) < 0.5 ? 'estáveis'
            : diferenca < 0 ? 'ficando mais fáceis para você' : 'ficando mais pesados para você'
    }
    const parteDaSemana = semana.planejado > 0 ? Math.min(100, Math.round((semana.nadado / semana.planejado) * 100)) : 0

    return (
        <div className={styles.box}>
            <h3>Resumo dos treinos</h3>

            <section className={styles.item}>
                <p className={styles.rotulo}>Nota média da série principal</p>
                {notas.recentes === null
                    ? <p>Conclua treinos dando a nota (1 a 10) para ver a média aqui.</p>
                    : (
                        <p>
                            Últimas 4 semanas: <strong className={styles.grande}>{nota(notas.recentes)}</strong>
                            {notas.anteriores !== null && <> (antes: {nota(notas.anteriores)})</>}
                            {tendencia && <><br />Os treinos estão {tendencia}.</>}
                        </p>
                    )}
            </section>

            <section className={styles.item}>
                <p className={styles.rotulo}>O que mais pesou</p>
                {motivos.treinos === 0
                    ? <p>Ainda sem treinos com nota.</p>
                    : motivos.respiracao + motivos.forca === 0
                        ? <p>Nos últimos {motivos.treinos} treinos com nota, nenhum ficou pesado pela respiração ou pela força.</p>
                        : (
                            <p>
                                Nos últimos {motivos.treinos} treinos com nota:
                                {motivos.respiracao > 0 && <> faltou ar <strong>{vezes(motivos.respiracao)}</strong></>}
                                {motivos.respiracao > 0 && motivos.forca > 0 && ' e'}
                                {motivos.forca > 0 && <> faltou força <strong>{vezes(motivos.forca)}</strong></>}.
                            </p>
                        )}
            </section>

            <section className={styles.item}>
                <p className={styles.rotulo}>Esta semana ({formatDate(semana.inicio).slice(0, 5)} a {formatDate(semana.fim).slice(0, 5)})</p>
                {semana.treinos === 0
                    ? <p>Nenhum treino nesta semana.</p>
                    : (
                        <>
                            <p>
                                Nadou <strong className={styles.grande}>{metros(semana.nadado)}</strong> de {metros(semana.planejado)} planejados
                                · {semana.feitos} de {semana.treinos} treinos
                            </p>
                            <div className={styles.barra} role='progressbar' aria-valuenow={parteDaSemana} aria-valuemin={0} aria-valuemax={100}
                                aria-label='Metragem da semana'>
                                <div className={styles.preenchido} style={{ width: `${parteDaSemana}%` }} />
                            </div>
                        </>
                    )}
            </section>

            <section className={styles.item}>
                <p className={styles.rotulo}>Frequência (últimos {frequencia.dias} dias)</p>
                {frequencia.treinos === 0
                    ? <p>Ainda sem treinos nesse período.</p>
                    : (
                        <p>
                            <strong className={styles.grande}>{frequencia.feitos} de {frequencia.treinos}</strong> treinos feitos
                            ({Math.round((frequencia.feitos / frequencia.treinos) * 100)}%)
                            {frequencia.faltas > 0 && <> · {frequencia.faltas === 1 ? '1 falta' : `${frequencia.faltas} faltas`}</>}
                        </p>
                    )}
            </section>
        </div>
    )
}
