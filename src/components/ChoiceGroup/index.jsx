import { useId } from 'react'
import styles from './choicegroup.module.css'

// Grupo de opções em "pílulas" clicáveis.
// - Uma resposta: <ChoiceGroup label='...' options={...} value={x} onChange={setX} />
// - Várias respostas: acrescente `multiple` e use um array em `value`.
export const ChoiceGroup = ({ label, hint, options, value, onChange, multiple = false }) => {
    const labelId = useId()

    const isSelected = (option) => (multiple ? value.includes(option) : value === option)

    const toggle = (option) => {
        if (!multiple) return onChange(option)
        onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])
    }

    return (
        <div className={styles.field}>
            <p id={labelId} className={styles.label}>{label}</p>
            {hint && <p className={styles.hint}>{hint}</p>}
            <div className={styles.options} role='group' aria-labelledby={labelId}>
                {options.map((option) => (
                    <button
                        key={option.value}
                        type='button'
                        className={styles.option}
                        aria-pressed={isSelected(option.value)}
                        onClick={() => toggle(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
