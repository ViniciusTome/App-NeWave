import styles from './clock.module.css'

// Os números do relógio, o maior que couber: pela largura da tela (conforme a quantidade
// de caracteres: "1:54" fica maior que "5:12") e pela altura (deitado, o limite é a altura).
// `menor`: uma parte em letra menor ao lado (os centésimos do cronômetro: "5:12" + ".91").
// Fonte monoespaçada: cada caractere tem uns 0,6 da altura de largura.
const PROPORCAO_DO_MENOR = 0.28
export const Numeros = ({ children, menor = '' }) => {
    const caracteres = Math.max(String(children).length + String(menor).length * PROPORCAO_DO_MENOR, 3)
    const pelaLargura = (94 / (caracteres * 0.6)).toFixed(1)
    return (
        <div className={styles.numeros} style={{ fontSize: `min(${pelaLargura}vw, var(--altura-dos-numeros))` }} aria-live='off'>
            {children}
            {menor && <span className={styles.numerosMenores} style={{ fontSize: `${PROPORCAO_DO_MENOR}em` }}>{menor}</span>}
        </div>
    )
}
