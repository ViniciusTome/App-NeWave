import { useEffect, useState } from 'react'
import { ChoiceGroup } from '../ChoiceGroup'
import { api } from '../../services/api'
import styles from './completetraining.module.css'

// A partir disso o app pergunta o motivo (o mesmo de server/swimming.js, FEEDBACK)
const PERGUNTAR_MOTIVO_A_PARTIR_DE = 8

const NOTAS = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
const MOTIVOS = [
    { value: 'respiracao', label: 'A respiração (faltou ar)' },
    { value: 'forca', label: 'A força (os braços ficaram pesados)' },
]

const SIM_NAO = [{ value: true, label: 'Sim, sem parar' }, { value: false, label: 'Não, precisei parar' }]
// Nado em partes (iniciante no treino de saúde): conseguiu nadar todas as repetições?
const SIM_NAO_PARTES = [{ value: true, label: 'Sim, todas' }, { value: false, label: 'Não, parei antes' }]

// Explicação da nota: aberta sozinha na 1ª vez (o aparelho lembra); depois, pelo link
// "Como funciona a nota?"
const CHAVE_EXPLICACAO = 'newave:explicacao-da-nota'
const jaViu = () => {
    try {
        return localStorage.getItem(CHAVE_EXPLICACAO) === '1'
    } catch {
        return false
    }
}
const marcarVisto = () => {
    try {
        localStorage.setItem(CHAVE_EXPLICACAO, '1')
    } catch {
        // sem armazenamento: mostra de novo da próxima vez
    }
}

// Como a nota muda os próximos treinos, com os números do nível do atleta (do servidor)
const Explicacao = ({ regras, onClose }) => {
    const n = regras?.treinosEmSequencia ?? 3
    const pesado = regras?.pesadoAPartirDe ?? 8
    const facil = regras?.facilAteNota ?? 3
    return (
        <div className={styles.explicacao} role='note' aria-labelledby='explicacao-titulo'>
            <p id='explicacao-titulo' className={styles.explicacaoTitulo}>Como funciona a nota</p>
            <p>
                Toque num número de <strong>1 a 10</strong> para dizer como foi a <strong>série principal</strong>:
                1 = muito fácil, 10 = muito difícil. A partir de {regras?.perguntarMotivoAPartirDe ?? 8}, o app pergunta o que
                deixou mais difícil (a respiração ou a força).
            </p>
            <div className={styles.regra}>
                <span className={styles.regraNumero}>{n} treinos seguidos</span>
                <span>com nota <strong>{pesado} ou mais</strong> → os próximos treinos ficam <strong>mais leves</strong>.</span>
            </div>
            <div className={styles.regra}>
                <span className={styles.regraNumero}>{n} treinos seguidos</span>
                <span>com nota <strong>{facil} ou menos</strong> (ou bem abaixo do que o treino pedia) → os próximos ficam <strong>mais puxados</strong>.</span>
            </div>
            {regras?.nivel === 'avancado' && (
                <p className={styles.dica}>No avançado, que já está acostumado com treino forte, o pesado começa no 9.</p>
            )}
            <p className={styles.dica}>
                1 ou 2 treinos fora do normal não mudam nada: pode ser só um dia ruim (dormiu mal, comeu pouco...).
                Seja sincero: a nota serve para o treino se ajustar a você.
            </p>
            <button type='button' className={styles.entendi} onClick={onClose}>Entendi</button>
        </div>
    )
}

// Perguntas ao concluir o treino, mostradas na janela flutuante.
// `onSubmit({ difficulty, reason, nonstop })` conclui o treino com as respostas.
// Treino com nado contínuo: pergunta também se conseguiu nadar sem parar.
export const CompleteTraining = ({ training = null, onSubmit, submitting, error }) => {
    const [difficulty, setDifficulty] = useState(null)
    const [reason, setReason] = useState(null)
    const [nonstop, setNonstop] = useState(null)
    // Explicação da nota: aberta na 1ª vez; as regras (números do nível) vêm do servidor
    const [explicando, setExplicando] = useState(() => !jaViu())
    const [regras, setRegras] = useState(null)
    useEffect(() => {
        let cancelado = false
        api('/feedback/rules').then((r) => { if (!cancelado) setRegras(r) }).catch(() => {})
        return () => { cancelado = true }
    }, [])
    const fecharExplicacao = () => {
        marcarVisto()
        setExplicando(false)
    }
    const continuo = training?.partes?.find((p) => p.parte === 'continuo') ?? null
    const precisaMotivo = difficulty !== null && difficulty >= PERGUNTAR_MOTIVO_A_PARTIR_DE
    const pronto = difficulty !== null && (!precisaMotivo || reason !== null) && (!continuo || nonstop !== null)

    const handleSubmit = (event) => {
        event.preventDefault()
        if (!pronto) return
        onSubmit({ difficulty, ...(precisaMotivo && { reason }), ...(continuo && { nonstop }) })
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            {explicando
                ? <Explicacao regras={regras} onClose={fecharExplicacao} />
                : <button type='button' className={styles.comoFunciona} onClick={() => setExplicando(true)}>Como funciona a nota?</button>}
            <ChoiceGroup
                label='Como foi a série principal?'
                hint='1 = muito fácil · 10 = muito difícil'
                options={NOTAS}
                value={difficulty}
                onChange={(nota) => {
                    setDifficulty(nota)
                    if (nota < PERGUNTAR_MOTIVO_A_PARTIR_DE) setReason(null)
                }}
            />
            {precisaMotivo && (
                <ChoiceGroup
                    label='O que deixou mais difícil?'
                    options={MOTIVOS}
                    value={reason}
                    onChange={setReason}
                />
            )}
            {continuo && (
                <ChoiceGroup
                    label={continuo.fracionado
                        ? `Você nadou todas as repetições do nado em partes (${continuo.texto.split(' · ')[0]})?`
                        : `Você nadou os ${continuo.metros} m do nado contínuo sem parar?`}
                    hint='Precisar parar não tem problema: os próximos treinos se ajustam a você.'
                    options={continuo.fracionado ? SIM_NAO_PARTES : SIM_NAO}
                    value={nonstop}
                    onChange={setNonstop}
                />
            )}
            {error && <p className={styles.error} role='alert'>{error}</p>}
            <button type='submit' className={styles.submit} disabled={!pronto || submitting}>
                {submitting ? 'Concluindo...' : 'Concluir treino'}
            </button>
        </form>
    )
}
