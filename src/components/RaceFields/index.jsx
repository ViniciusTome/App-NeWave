import { ChoiceGroup } from '../ChoiceGroup'
import { MODALITY, POOL_MODALITIES, RACE_STROKES, distanceText, raceDistances } from '../../utils/athlete'
import styles from './racefields.module.css'

// Campos da prova: modalidade, estilo (na piscina), distância e o tempo que quer fazer (a meta).
// Usado no "Gerar treinos" (prova nova) e no "+ Adicionar prova" do Perfil.

export const RaceFields = ({ value, onChange }) => {
    const piscina = POOL_MODALITIES.includes(value.modality)
    const distancias = raceDistances(value.modality, piscina ? value.stroke : 'crawl')
    const longa = (value.distance ?? 0) >= 1500
    const set = (changes) => {
        const next = { ...value, ...changes }
        // A distância precisa existir para a modalidade e o estilo novos
        const ainda = raceDistances(next.modality, POOL_MODALITIES.includes(next.modality) ? next.stroke : 'crawl')
        if (!ainda.includes(next.distance)) next.distance = null
        onChange(next)
    }

    return (
        <div className={styles.fields}>
            <ChoiceGroup label='Modalidade' options={MODALITY} value={value.modality} onChange={(modality) => set({ modality })} />
            {piscina && (
                <ChoiceGroup label='Estilo da prova' options={RACE_STROKES} value={value.stroke} onChange={(stroke) => set({ stroke })} />
            )}
            {value.modality && (!piscina || value.stroke) && (
                <ChoiceGroup label='Distância' options={distancias.map((d) => ({ value: d, label: distanceText(d) }))}
                    value={value.distance} onChange={(distance) => set({ distance })} />
            )}
            {value.distance && (
                <div className={styles.goal}>
                    <p className={styles.label}>Tempo que quer fazer (meta)</p>
                    <p className={styles.hint}>Opcional. Com a meta, o modelo Específico calcula o seu ritmo de prova.</p>
                    <div className={styles.timeRow}>
                        {longa && (
                            <label className={styles.timeField}>
                                <input inputMode='numeric' value={value.goalH} aria-label='Horas' placeholder='0'
                                    onChange={(e) => set({ goalH: e.target.value })} />
                                <span>h</span>
                            </label>
                        )}
                        <label className={styles.timeField}>
                            <input inputMode='numeric' value={value.goalMin} aria-label='Minutos' placeholder='2'
                                onChange={(e) => set({ goalMin: e.target.value })} />
                            <span>min</span>
                        </label>
                        <label className={styles.timeField}>
                            <input inputMode='decimal' value={value.goalSec} aria-label='Segundos' placeholder='30,00'
                                onChange={(e) => set({ goalSec: e.target.value })} />
                            <span>s</span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    )
}
