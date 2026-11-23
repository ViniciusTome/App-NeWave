import { useState } from 'react'
import { Input } from '../Input'
import styles from './passwordinput.module.css'

// Campo de senha com o botão de olho: mostra ou esconde o que foi digitado
export const PasswordInput = (props) => {
    const [visivel, setVisivel] = useState(false)

    return (
        <div className={styles.wrapper}>
            <Input {...props} type={visivel ? 'text' : 'password'} />
            <button
                type='button'
                className={styles.toggle}
                onClick={() => setVisivel((v) => !v)}
                aria-label={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
                aria-pressed={visivel}
                aria-controls={props.id}
            >
                {visivel ? (
                    // Olho riscado: esconder
                    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                        <path d='M3 3l18 18' />
                        <path d='M10.6 10.6a2 2 0 0 0 2.8 2.8' />
                        <path d='M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3' />
                    </svg>
                ) : (
                    // Olho aberto: mostrar
                    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                        <path d='M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z' />
                        <circle cx='12' cy='12' r='3' />
                    </svg>
                )}
            </button>
        </div>
    )
}
