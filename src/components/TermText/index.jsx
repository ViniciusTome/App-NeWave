import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../Modal'
import { splitTerms } from '../../utils/terms'
import styles from './termtext.module.css'

// Texto de uma parte do treino com os termos explicados: na 1ª preparação (`extenso`)
// o nome vai por extenso com a abreviação entre parênteses ("com pé de pato (c/PÉ)").
// A abreviação é clicável (azul, sublinhado pontilhado) e abre a explicação do glossário.
export const TermText = ({ texto, extenso = false }) => {
    const [aberto, setAberto] = useState(null)
    const pedacos = splitTerms(texto)

    const clicavel = (rotulo, termo, chave) => (termo
        ? <button key={chave} type='button' className={styles.abbr} onClick={() => setAberto(termo)}
            title={`O que é ${termo.nome ?? termo.sigla}?`}>{rotulo}</button>
        : <span key={chave}>{rotulo}</span>)

    return (
        <>
            {pedacos.map((p, i) => {
                if (typeof p === 'string') return <span key={i}>{p}</span>
                if (!extenso) return clicavel(p.texto, p.termo, i)
                // "com pé de pato (c/PÉ)" ou "saída a cada (a/c) 1'50"": o nome normal e a
                // abreviação clicável (onde ela estiver)
                const m = /^(.*?)\s*\(([^()]*)\)(.*)$/.exec(p.extenso)
                if (!m) return clicavel(p.extenso, p.termo, i)
                return <span key={i}>{m[1]} <span className={styles.junto}>({clicavel(m[2], p.termo, 'a')}){m[3]}</span></span>
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
