import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../Modal'
import { splitTerms } from '../../utils/terms'
import styles from './termtext.module.css'

// Texto de uma parte do treino com os termos explicados: na 1ª preparação (`extenso`)
// o nome vai por extenso com a abreviação entre parênteses ("com pé de pato (c/PÉ)").
// Cada termo do glossário ganha um "?" (só na 1ª vez que aparece na parte) que abre a
// explicação dele.
export const TermText = ({ texto, extenso = false }) => {
    const [aberto, setAberto] = useState(null)
    const vistos = new Set()
    const pedacos = splitTerms(texto)

    return (
        <>
            {pedacos.map((p, i) => {
                if (typeof p === 'string') return <span key={i}>{p}</span>
                const primeira = p.termo && !vistos.has(p.termo.sigla)
                if (p.termo) vistos.add(p.termo.sigla)
                return (
                    <span key={i} className={styles.term}>
                        {extenso ? p.extenso : p.texto}
                        {primeira && (
                            <button type='button' className={styles.help} onClick={() => setAberto(p.termo)}
                                aria-label={`O que é ${p.termo.nome ?? p.termo.sigla}?`}>?</button>
                        )}
                    </span>
                )
            })}
            <Modal open={aberto !== null} onClose={() => setAberto(null)} title={aberto ? `${aberto.sigla}${aberto.nome ? ` · ${aberto.nome}` : ''}` : ''}>
                {aberto && (
                    <div className={styles.box}>
                        <p>{aberto.explicacao}</p>
                        <Link className={styles.link} to={`/page/glossario?termo=${encodeURIComponent(aberto.sigla)}`}>
                            Ver no glossário
                        </Link>
                    </div>
                )}
            </Modal>
        </>
    )
}
