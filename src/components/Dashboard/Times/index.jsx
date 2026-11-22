import { useEffect, useState } from 'react'
import { api, ATHLETE_CHANGED } from '../../../services/api'
import { formatSwimTime } from '../../../utils/format'
import styles from './times.module.css'

// Segundos -> 1'30" / 42" (arredondado ao segundo)
const tempo = (segundos) => {
    const s = Math.round(segundos)
    const min = Math.floor(s / 60)
    const resto = String(s % 60).padStart(2, '0')
    return min > 0 ? `${min}'${resto}"` : `${s}"`
}
// [de, até] -> 3'04" a 3'06" (ou um valor só, quando é igual)
const faixa = ([de, ate]) => (Math.round(de) === Math.round(ate) ? tempo(de) : `${tempo(de)} a ${tempo(ate)}`)

// Bloco "Tempos": A1, A2 e A3 de cada distância, calculados pelo teste de 400 m
// do atleta com o método do treinador (server/series/regras.json, "tabelaDeTempos").
export const Times = () => {
    const [dados, setDados] = useState(null) // null = carregando
    const [erro, setErro] = useState('')

    useEffect(() => {
        let cancelled = false
        const load = () => api('/athlete-profile')
            .then((data) => { if (!cancelled) setDados(data) })
            .catch((err) => { if (!cancelled) setErro(err.message) })
        load()
        window.addEventListener(ATHLETE_CHANGED, load)
        return () => {
            cancelled = true
            window.removeEventListener(ATHLETE_CHANGED, load)
        }
    }, [])

    const tabela = dados?.tempos

    return (
        <div className={styles.times}>
            <header>
                <h2>Tempos</h2>
                <p className={styles.descriptionTest}>
                    {dados?.time400
                        ? `Baseado no teste de 400 metros (${formatSwimTime(dados.time400.hundredths)})`
                        : 'Baseado no teste de 400 metros'}
                </p>
            </header>
            {erro && <p className={styles.message} role='alert'>{erro}</p>}
            {dados && !tabela && (
                <p className={styles.message}>
                    Registre um teste de 400 m (botão "+ Teste") para ver os seus tempos de A1, A2 e A3.
                </p>
            )}
            {tabela && (
                <div className={styles.divIntensityPercent}>
                    {['50', '100', '200'].map((d) => (
                        <div key={d} className={styles.divIntensities}>
                            <p>{d} Metros</p>
                            {['A1', 'A2', 'A3'].map((i) => (
                                <p key={i} className={styles.descriptionIntensity}>{i}: {faixa(tabela[d][i])}</p>
                            ))}
                        </div>
                    ))}
                    <div className={styles.divIntensities}>
                        <p>400 Metros</p>
                        <p className={styles.descriptionIntensity}>30 AC: {faixa(tabela['400'].AC)}</p>
                        <p className={styles.note}>30" acima do melhor, normalmente c/PÉ + PALM</p>
                    </div>
                </div>
            )}
        </div>
    )
}
