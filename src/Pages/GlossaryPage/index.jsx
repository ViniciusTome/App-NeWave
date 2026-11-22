import { useState } from 'react'
import { Aside } from '../../components/Aside'
import glossario from '../../data/glossario.json'
import styles from './glossarypage.module.css'

// Tira acentos e deixa minúsculo, para a busca achar "medley" em "Medley" e "tecnica" em "Técnica"
const normaliza = (texto) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// Glossário: o que quer dizer cada abreviação e termo dos treinos.
// Os termos ficam em src/data/glossario.json (dá para editar e acrescentar).
export const GlossaryPage = () => {
    const [busca, setBusca] = useState('')
    const termo = normaliza(busca.trim())

    const categorias = glossario
        .map((categoria) => ({
            ...categoria,
            termos: categoria.termos.filter((t) =>
                !termo || normaliza(`${t.sigla} ${t.nome ?? ''} ${t.explicacao}`).includes(termo)),
        }))
        .filter((categoria) => categoria.termos.length > 0)

    return (
        <div className={styles.division}>
            <Aside/>
            <div className={styles.page}>
                <div className={styles.container}>
                    <h2>Glossário</h2>
                    <p className={styles.intro}>
                        O que quer dizer cada abreviação e termo que aparece nos seus treinos.
                    </p>
                    <input
                        className={styles.search}
                        type='search'
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder='Procure um termo (ex.: NEG, palmar, medley)'
                        aria-label='Procurar no glossário'
                    />
                </div>

                {categorias.length === 0 && (
                    <div className={styles.container}>
                        <p className={styles.intro}>Nenhum termo encontrado para "{busca.trim()}".</p>
                    </div>
                )}

                {categorias.map((categoria) => (
                    <section key={categoria.categoria} className={styles.container}>
                        <h3>{categoria.categoria}</h3>
                        <dl className={styles.list}>
                            {categoria.termos.map((t) => (
                                <div key={t.sigla} className={styles.item}>
                                    <dt>
                                        <span className={styles.sigla}>{t.sigla}</span>
                                        {t.nome && <span className={styles.nome}>{t.nome}</span>}
                                    </dt>
                                    <dd>{t.explicacao}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>
        </div>
    )
}
