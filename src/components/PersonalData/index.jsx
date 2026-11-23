import { useState } from 'react'
import { useAccount, formatPhone } from '../../hooks/useAccount'
import { formatDate } from '../../utils/format'
import { ChangePassword, EditPersonalData } from '../AccountForms'
import { Modal } from '../Modal'
import styles from './personaldata.module.css'

// Dados pessoais do atleta: nome, email, telefone, nascimento e senha (pode editar)
export const PersonalData = () => {
    const { data, error } = useAccount()
    const [aberto, setAberto] = useState(null) // 'dados' | 'senha'
    const conta = data?.account

    if (error) return <p className={styles.message} role='alert'>{error}</p>
    if (!conta) return <p className={styles.message}>Carregando...</p>

    const naoInformado = <span className={styles.empty}>não informado</span>
    return (
        <div className={styles.profile}>
            <div className={styles.description}>
                <div className={styles.name}>
                    <label>Nome</label>
                    <p>{conta.name}</p>
                </div>
                <div className={styles.email}>
                    <label>Email</label>
                    <p>{conta.email}</p>
                </div>
                <div className={styles.phone}>
                    <label>Telefone</label>
                    <p>{conta.phone ? formatPhone(conta.phone) : naoInformado}</p>
                </div>
                <div className={styles.password}>
                    <label>Senha</label>
                    <p>••••••••</p>
                </div>
                <div className={styles.birth}>
                    <label>Data de nascimento</label>
                    <p>{conta.birthDate ? formatDate(conta.birthDate) : naoInformado}</p>
                </div>
            </div>
            <div className={styles.buttons}>
                <button type='button' className={styles.edit} onClick={() => setAberto('dados')}>Editar dados</button>
                <button type='button' className={styles.edit} onClick={() => setAberto('senha')}>Trocar senha</button>
            </div>
            <Modal open={aberto === 'dados'} onClose={() => setAberto(null)} title='Editar dados pessoais'>
                {aberto === 'dados' && <EditPersonalData account={conta} onDone={() => setAberto(null)} />}
            </Modal>
            <Modal open={aberto === 'senha'} onClose={() => setAberto(null)} title='Trocar senha'>
                {aberto === 'senha' && <ChangePassword onDone={() => setAberto(null)} />}
            </Modal>
        </div>
    )
}
