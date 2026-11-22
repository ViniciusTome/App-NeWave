import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import { api } from '../../services/api'
import { STROKES, labelOf } from '../../utils/athlete'
import { termsInTraining } from '../../utils/glossary'
import styles from './traininglossary.module.css'

// Botão "Glossário" do card: abre só os termos usados nesse treino.
// No ME (melhor estilo) mostra qual é o do atleta.
export const TrainingGlossary = ({ training }) => {
    const [open, setOpen] = useState(false)
    const [melhorEstilo, setMelhorEstilo] = useState(undefined) // undefined = ainda não buscou

    const termos = termsInTraining(training)
    const temME = termos.some((t) => t.sigla === 'ME')

    useEffect(() => {
        if (!open || !temME || melhorEstilo !== undefined) return
        api('/athlete-profile')
            .then(({ profile }) => setMelhorEstilo(profile?.bestStroke ?? null))
            .catch(() => setMelhorEstilo(null))
    }, [open, temME, melhorEstilo])

    if (termos.length === 0) return null

    return (
        <>
            <button type='button' className={styles.button} onClick={() => setOpen(true)}
                aria-label='Glossário deste treino'>
                Glossário
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title='O que quer dizer cada termo deste treino'>
                <dl className={styles.list}>
                    {termos.map((t) => (
                        <div key={t.sigla} className={styles.item}>
                            <dt>
                                <span className={styles.sigla}>{t.sigla}</span>
                                {t.nome && <span className={styles.nome}>{t.nome}</span>}
                            </dt>
                            <dd>
                                {t.explicacao}
                                {t.sigla === 'ME' && melhorEstilo !== undefined && (
                                    <strong className={styles.personal}>
                                        {melhorEstilo
                                            ? ` O seu melhor estilo: ${labelOf(STROKES, melhorEstilo)}.`
                                            : ' Você ainda não escolheu o seu melhor estilo: responda em "Editar respostas", no Perfil.'}
                                    </strong>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
            </Modal>
        </>
    )
}
