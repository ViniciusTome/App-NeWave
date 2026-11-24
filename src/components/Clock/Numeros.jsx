import styles from './clock.module.css'

// Os números do relógio, o maior que couber: pela largura da tela (conforme a quantidade
// de caracteres: "1:54" fica maior que "5:12.84") e pela altura (deitado, o limite é a altura).
// Fonte monoespaçada: cada caractere tem uns 0,6 da altura de largura.
export const Numeros = ({ children }) => {
    const caracteres = Math.max(String(children).length, 3)
    const pelaLargura = (94 / (caracteres * 0.6)).toFixed(1)
    return (
        <div className={styles.numeros} style={{ fontSize: `min(${pelaLargura}vw, var(--altura-dos-numeros))` }} aria-live='off'>
            {children}
        </div>
    )
}
