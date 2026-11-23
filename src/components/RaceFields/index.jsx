import { ChoiceGroup } from '../ChoiceGroup'
import { MODALITY, POOL_MODALITIES, RACE_STROKES, distanceText, raceDistances } from '../../utils/athlete'
import { EMPTY_EVENT, MAX_EVENTS } from '../../utils/race'
import styles from './racefields.module.css'

// Campos da prova: a modalidade e as provas que vai nadar nessa competição (estilo na
// piscina, distância e o tempo que quer fazer, a meta). A 1ª é a principal: é para ela
// que os treinos são montados. Usado no "Gerar treinos" e no "+ Adicionar prova" do Perfil.
export const RaceFields = ({ value, onChange }) => {
    const piscina = POOL_MODALITIES.includes(value.modality)

    // A distância precisa existir para a modalidade e o estilo
    const conferir = (modality, e) => (raceDistances(modality, POOL_MODALITIES.includes(modality) ? e.stroke : 'crawl').includes(e.distance)
        ? e : { ...e, distance: null })
    const setModality = (modality) => onChange({ ...value, modality, events: value.events.map((e) => conferir(modality, e)) })
    const setEvent = (i, changes) => onChange({
        ...value, events: value.events.map((e, k) => (k === i ? conferir(value.modality, { ...e, ...changes }) : e)),
    })
    const add = () => onChange({ ...value, events: [...value.events, EMPTY_EVENT] })
    const remove = (i) => onChange({ ...value, events: value.events.filter((_, k) => k !== i) })
    const makeMain = (i) => onChange({ ...value, events: [value.events[i], ...value.events.filter((_, k) => k !== i)] })

    return (
        <div className={styles.fields}>
            <ChoiceGroup label='Modalidade' options={MODALITY} value={value.modality} onChange={setModality} />
            {value.modality && value.events.map((e, i) => {
                const distancias = raceDistances(value.modality, piscina ? e.stroke : 'crawl')
                const longa = (e.distance ?? 0) >= 1500
                const varias = value.events.length > 1
                return (
                    <fieldset key={i} className={styles.event}>
                        {varias && (
                            <legend className={styles.eventTitle}>
                                {i === 0 ? 'Prova principal' : `${i + 1}ª prova`}
                            </legend>
                        )}
                        {piscina && (
                            <ChoiceGroup label='Estilo da prova' options={RACE_STROKES} value={e.stroke} onChange={(stroke) => setEvent(i, { stroke })} />
                        )}
                        {(!piscina || e.stroke) && (
                            <ChoiceGroup label='Distância' options={distancias.map((d) => ({ value: d, label: distanceText(d) }))}
                                value={e.distance} onChange={(distance) => setEvent(i, { distance })} />
                        )}
                        {e.distance && (
                            <div className={styles.goal}>
                                <p className={styles.label}>Tempo que quer fazer (meta)</p>
                                <p className={styles.hint}>Opcional. Com a meta, o modelo Específico calcula o seu ritmo de prova.</p>
                                <div className={styles.timeRow}>
                                    {longa && (
                                        <label className={styles.timeField}>
                                            <input inputMode='numeric' value={e.goalH} aria-label='Horas' placeholder='0'
                                                onChange={(ev) => setEvent(i, { goalH: ev.target.value })} />
                                            <span>h</span>
                                        </label>
                                    )}
                                    <label className={styles.timeField}>
                                        <input inputMode='numeric' value={e.goalMin} aria-label='Minutos' placeholder='2'
                                            onChange={(ev) => setEvent(i, { goalMin: ev.target.value })} />
                                        <span>min</span>
                                    </label>
                                    <label className={styles.timeField}>
                                        <input inputMode='decimal' value={e.goalSec} aria-label='Segundos' placeholder='30,00'
                                            onChange={(ev) => setEvent(i, { goalSec: ev.target.value })} />
                                        <span>s</span>
                                    </label>
                                </div>
                            </div>
                        )}
                        {varias && (
                            <div className={styles.eventActions}>
                                {i > 0 && <button type='button' className={styles.link} onClick={() => makeMain(i)}>Tornar a principal</button>}
                                <button type='button' className={styles.link} onClick={() => remove(i)}>Remover esta prova</button>
                            </div>
                        )}
                    </fieldset>
                )
            })}
            {value.modality && value.events.length < MAX_EVENTS && (
                <>
                    <button type='button' className={styles.add} onClick={add}>+ Outra prova nesta competição</button>
                    {value.events.length > 1 && (
                        <p className={styles.hint}>Os treinos são montados para a prova principal, nos estilos de todas as provas.</p>
                    )}
                </>
            )}
        </div>
    )
}
