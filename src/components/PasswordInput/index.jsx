import { useEffect, useRef, useState } from 'react'
import { Input } from '../Input'
import styles from './passwordinput.module.css'

// Por quanto tempo o caractere digitado fica visível antes de virar bolinha
const MOSTRAR_POR_MS = 1000

// Campo de senha com o botão de olho (mostra ou esconde tudo) e, enquanto escondido,
// o último caractere digitado aparece por 1 segundo e depois vira bolinha (como no
// celular). O campo continua sendo de senha de verdade (o navegador e os gerenciadores
// de senha funcionam); só o que aparece na tela é desenhado por cima.
export const PasswordInput = ({ onChange, ...props }) => {
    const [visivel, setVisivel] = useState(false)
    const [valor, setValor] = useState('')
    const [revelado, setRevelado] = useState(-1) // posição do caractere que aparece
    const [rolagem, setRolagem] = useState(0)
    const timer = useRef(null)
    const campo = useRef(null)

    useEffect(() => () => clearTimeout(timer.current), [])

    const aoDigitar = (event) => {
        const novo = event.target.value
        clearTimeout(timer.current)
        // Digitou um caractere (não colou nem apagou): ele aparece por um tempo
        const digitou = event.nativeEvent?.inputType === 'insertText' && novo.length === valor.length + 1
        if (digitou) {
            setRevelado((event.target.selectionStart ?? novo.length) - 1)
            timer.current = setTimeout(() => setRevelado(-1), MOSTRAR_POR_MS)
        } else {
            setRevelado(-1)
        }
        setValor(novo)
        setRolagem(event.target.scrollLeft)
        onChange?.(event)
    }

    // O que aparece: bolinhas, menos o caractere recém-digitado
    const mascara = [...valor].map((c, i) => (i === revelado ? c : '•')).join('')

    return (
        <div className={`${styles.wrapper} ${visivel ? '' : styles.mascarado}`}>
            <Input
                {...props}
                ref={campo}
                type={visivel ? 'text' : 'password'}
                onChange={aoDigitar}
                onScroll={(e) => setRolagem(e.target.scrollLeft)}
                onKeyUp={(e) => setRolagem(e.target.scrollLeft)}
            />
            {!visivel && valor && (
                <span className={styles.espelho} aria-hidden='true'>
                    <span style={{ transform: `translateX(${-rolagem}px)` }}>{mascara}</span>
                </span>
            )}
            <button
                type='button'
                className={styles.toggle}
                onClick={() => {
                    setVisivel((v) => !v)
                    setRevelado(-1)
                }}
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
