import { useCallback, useEffect, useState } from 'react'
import { ChoiceGroup } from '../ChoiceGroup'
import { Modal } from '../Modal'
import { api, ATHLETE_CHANGED, notifyAthleteChanged, notifyTrainingsChanged } from '../../services/api'
import {
    IMPORTANCE_NOTICE, IMPORTANCE_OPTIONS, MODALITY, PRIORITY, competitionLabel, daysUntil, daysUntilText,
} from '../../utils/athlete'
import { todayIso } from '../../utils/format'
import styles from './competitioncalendar.module.css'

const EMPTY = { name: '', date: '', modality: null, event: '', priority: 'C' }

// Calendário de provas do Perfil: as próximas provas, a importância de cada uma
// (a prova alvo é escolhida em "Gerar treinos") e "+ Adicionar prova".
export const CompetitionCalendar = () => {
    const [competitions, setCompetitions] = useState(null) // null = carregando
    const [error, setError] = useState('')
    const [adding, setAdding] = useState(false)
    const [form, setForm] = useState(EMPTY)
    const [formError, setFormError] = useState('')
    const [saving, setSaving] = useState(false)
    const today = todayIso()

    const load = useCallback(() => {
        api(`/competitions?today=${todayIso()}`)
            .then(({ competitions }) => { setCompetitions(competitions); setError('') })
            .catch((err) => setError(err.message))
    }, [])

    useEffect(() => {
        load()
        window.addEventListener(ATHLETE_CHANGED, load)
        return () => window.removeEventListener(ATHLETE_CHANGED, load)
    }, [load])

    const changeImportance = async (competition, priority) => {
        setError('')
        try {
            await api(`/competitions/${competition.id}`, { method: 'PATCH', body: { priority } })
            notifyAthleteChanged()
        } catch (err) {
            setError(err.message)
        }
    }

    // Trocar a prova alvo: nova preparação e a periodização refeita para o tempo que falta
    const [retargeting, setRetargeting] = useState(false)
    const makeTarget = async (competition) => {
        const ok = window.confirm(
            `Tornar "${competition.name}" a sua prova alvo?\n\nA periodização e os treinos que você ainda não fez ` +
            'serão refeitos para o tempo que falta até ela. Os treinos já feitos continuam no histórico.',
        )
        if (!ok) return
        setError('')
        setRetargeting(true)
        try {
            await api(`/preparations?today=${today}`, { method: 'POST', body: { goal: 'competir', competitionId: competition.id } })
            await api(`/trainings/generate?today=${today}`, { method: 'POST' })
            notifyAthleteChanged()
            notifyTrainingsChanged()
        } catch (err) {
            setError(err.message)
        } finally {
            setRetargeting(false)
        }
    }

    const remove = async (competition) => {
        if (!window.confirm(`Tirar "${competition.name}" do calendário?`)) return
        setError('')
        try {
            await api(`/competitions/${competition.id}`, { method: 'DELETE' })
            notifyAthleteChanged()
        } catch (err) {
            setError(err.message)
        }
    }

    const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

    const save = async (event) => {
        event.preventDefault()
        if (form.name.trim().length < 2) return setFormError('Dê um nome para a prova.')
        if (!form.date) return setFormError('Informe a data da prova.')
        if (form.date < today) return setFormError('A data da prova já passou.')
        if (!form.modality) return setFormError('Escolha a modalidade da prova.')
        setFormError('')
        setSaving(true)
        try {
            await api('/competitions', { method: 'POST', body: form })
            setAdding(false)
            setForm(EMPTY)
            notifyAthleteChanged()
        } catch (err) {
            setFormError(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={styles.calendar}>
            {competitions === null && !error && <p className={styles.message}>Carregando provas...</p>}
            {competitions?.length === 0 && <p className={styles.message}>Nenhuma prova marcada.</p>}

            {competitions?.length > 0 && (
                <ul className={styles.list}>
                    {competitions.map((c) => (
                        <li key={c.id} className={styles.item}>
                            <div className={styles.info}>
                                <span className={styles.name}>{competitionLabel(c)}</span>
                                <span className={styles.when}>{daysUntilText(daysUntil(c.date, today))}</span>
                            </div>
                            {c.priority === 'A' ? (
                                <span className={styles.target}>{PRIORITY.A}</span>
                            ) : (
                                <div className={styles.actions}>
                                    <div className={styles.toggle} role='group' aria-label={`Importância de ${c.name}`}>
                                        {IMPORTANCE_OPTIONS.map((o) => (
                                            <button key={o.value} type='button' aria-pressed={c.priority === o.value}
                                                onClick={() => c.priority !== o.value && changeImportance(c, o.value)}>
                                                {o.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button type='button' className={styles.remove} onClick={() => makeTarget(c)} disabled={retargeting}>
                                        {retargeting ? 'Refazendo treinos...' : 'Tornar prova alvo'}
                                    </button>
                                    <button type='button' className={styles.remove} onClick={() => remove(c)}>Remover</button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {error && <p className={styles.error} role='alert'>{error}</p>}
            <p className={styles.notice}>
                {IMPORTANCE_NOTICE} Trocar a prova alvo refaz a periodização para o tempo que falta até a nova prova.
            </p>
            <button type='button' className={styles.add} onClick={() => setAdding(true)}>+ Adicionar prova</button>

            <Modal open={adding} onClose={() => setAdding(false)} title='Adicionar prova'>
                <form className={styles.form} onSubmit={save}>
                    <label className={styles.field}>
                        <span>Nome da competição</span>
                        <input value={form.name} maxLength={100} onChange={(e) => set('name')(e.target.value)}
                            placeholder='Ex.: Torneio Regional' />
                    </label>
                    <label className={styles.field}>
                        <span>Data</span>
                        <input type='date' min={today} value={form.date} onChange={(e) => set('date')(e.target.value)} />
                    </label>
                    <ChoiceGroup label='Modalidade' options={MODALITY} value={form.modality} onChange={set('modality')} />
                    <label className={styles.field}>
                        <span>Prova ou distância (opcional)</span>
                        <input value={form.event} maxLength={100} onChange={(e) => set('event')(e.target.value)}
                            placeholder='Ex.: 100 m livre, 1,5 km' />
                    </label>
                    <ChoiceGroup label='Importância' hint={IMPORTANCE_NOTICE} options={IMPORTANCE_OPTIONS}
                        value={form.priority} onChange={set('priority')} />
                    {formError && <p className={styles.formError} role='alert'>{formError}</p>}
                    <button type='submit' className={styles.submit} disabled={saving}>
                        {saving ? 'Salvando...' : 'Adicionar ao calendário'}
                    </button>
                </form>
            </Modal>
        </div>
    )
}
