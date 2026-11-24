import { useState } from 'react'
import { api, notifyAthleteChanged, notifyTrainingsChanged } from '../../services/api'
import { cronometro } from '../../utils/seriesClock'
import { todayIso } from '../../utils/format'
import { useClockTheme, useTick, useWakeLock } from './common'
import { Numeros } from './Numeros'
import { createPortal } from 'react-dom'
import styles from './clock.module.css'

const DISTANCIAS = [50, 100, 200, 400, 800, 1500]

// Cronômetro do teste, em tela cheia: Iniciar/Parar, Parcial, Zerar e "Salvar como teste"
// (registra o tempo direto no app, como o "+ Teste"). `onSaved(test, testePlanejado)`.
export const Stopwatch = ({ onClose, onSaved, distanciaInicial = 400 }) => {
    const [tema, trocarTema] = useClockTheme()
    const [inicio, setInicio] = useState(null) // horário em que (re)começou
    const [acumulado, setAcumulado] = useState(0) // ms antes da última pausa
    const [parciais, setParciais] = useState([])
    const [distancia, setDistancia] = useState(distanciaInicial)
    const [salvando, setSalvando] = useState(false)
    const [mensagem, setMensagem] = useState('')
    const rodando = inicio !== null
    const agora = useTick(rodando)
    useWakeLock(true)

    const decorrido = acumulado + (rodando ? agora - inicio : 0)
    const centesimos = Math.floor(decorrido / 10)

    const iniciarParar = () => {
        setMensagem('')
        if (rodando) {
            setAcumulado((a) => a + Date.now() - inicio)
            setInicio(null)
        } else {
            setInicio(Date.now())
        }
    }
    const parcial = () => setParciais((p) => [...p, centesimos])
    const zerar = () => {
        setInicio(null)
        setAcumulado(0)
        setParciais([])
        setMensagem('')
    }

    const salvar = async () => {
        setSalvando(true)
        setMensagem('')
        try {
            const { test, testePlanejado } = await api('/tests', {
                method: 'POST', body: { distance: distancia, timeHundredths: centesimos, date: todayIso() },
            })
            notifyAthleteChanged()
            notifyTrainingsChanged()
            onSaved?.(test, testePlanejado)
            setMensagem(`Teste de ${distancia} m salvo: ${cronometro(centesimos)}.`)
        } catch (err) {
            setMensagem(err.message)
        } finally {
            setSalvando(false)
        }
    }

    // Direto no <body>: por cima da página inteira (o card do treino tem efeito de zoom)
    return createPortal(
        <div className={`${styles.tela} ${styles[tema]}`} role='dialog' aria-modal='true' aria-label='Cronômetro'>
            <div className={styles.topo}>
                <button type='button' className={styles.botaoPequeno} onClick={trocarTema}>
                    {tema === 'escuro' ? 'Tela clara' : 'Tela escura'}
                </button>
                <span className={styles.nome}>Cronômetro</span>
                <button type='button' className={styles.botaoPequeno} onClick={onClose}>Fechar</button>
            </div>

            <Numeros>{cronometro(centesimos)}</Numeros>

            {parciais.length > 0 && (
                <ol className={styles.parciais}>
                    {parciais.map((p, i) => (
                        <li key={i}>
                            <span>Parcial {i + 1}</span>
                            <span>{cronometro(p)}</span>
                            <span className={styles.volta}>+{cronometro(p - (parciais[i - 1] ?? 0))}</span>
                        </li>
                    ))}
                </ol>
            )}

            <div className={styles.controles}>
                <button type='button' className={styles.botaoGrande} onClick={iniciarParar}>
                    {rodando ? 'Parar' : decorrido > 0 ? 'Continuar' : 'Iniciar'}
                </button>
                <button type='button' className={styles.botaoGrande} onClick={rodando ? parcial : zerar} disabled={!rodando && decorrido === 0}>
                    {rodando ? 'Parcial' : 'Zerar'}
                </button>
            </div>

            {!rodando && decorrido > 0 && (
                <div className={styles.salvar}>
                    <label>
                        Distância do teste{' '}
                        <select value={distancia} onChange={(e) => setDistancia(Number(e.target.value))}>
                            {DISTANCIAS.map((d) => <option key={d} value={d}>{d} m</option>)}
                        </select>
                    </label>
                    <button type='button' className={styles.botaoSalvar} onClick={salvar} disabled={salvando}>
                        {salvando ? 'Salvando...' : 'Salvar como teste'}
                    </button>
                </div>
            )}
            {mensagem && <p className={styles.mensagem} role='status'>{mensagem}</p>}
        </div>,
        document.body,

    )
}
