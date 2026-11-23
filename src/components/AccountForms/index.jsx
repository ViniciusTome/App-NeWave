import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { formatPhone } from '../../hooks/useAccount'
import { api, notifyAccountChanged } from '../../services/api'
import { todayIso } from '../../utils/format'
import styles from './accountforms.module.css'

// Formulários do Perfil (abrem dentro de uma janela): editar os dados, trocar a
// senha, falar com o suporte e excluir a conta.

const useEnvio = () => {
    const [enviando, setEnviando] = useState(false)
    const [erro, setErro] = useState('')
    const enviar = async (fazer) => {
        setEnviando(true)
        setErro('')
        try {
            return await fazer()
        } catch (err) {
            setErro(err.message)
            return null
        } finally {
            setEnviando(false)
        }
    }
    return { enviando, erro, enviar }
}

const Acoes = ({ onCancel, enviando, texto, perigo = false }) => (
    <div className={styles.actions}>
        <button type='button' className={styles.secondary} onClick={onCancel}>Cancelar</button>
        <button type='submit' className={perigo ? styles.danger : styles.primary} disabled={enviando}>
            {enviando ? 'Enviando...' : texto}
        </button>
    </div>
)

export const EditPersonalData = ({ account, onDone }) => {
    const { updateUser } = useAuth()
    const [name, setName] = useState(account.name)
    const [phone, setPhone] = useState(formatPhone(account.phone))
    const [birthDate, setBirthDate] = useState(account.birthDate ?? '')
    const { enviando, erro, enviar } = useEnvio()

    const salvar = async (e) => {
        e.preventDefault()
        const resposta = await enviar(() => api(`/account?today=${todayIso()}`, {
            method: 'PATCH', body: { name, phone, birthDate },
        }))
        if (!resposta) return
        updateUser({ name: resposta.account.name })
        notifyAccountChanged()
        onDone()
    }

    return (
        <form className={styles.form} onSubmit={salvar}>
            <label className={styles.field}>
                <span>Nome</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} autoComplete='name' />
            </label>
            <label className={styles.field}>
                <span>Telefone (com DDD)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode='tel' placeholder='(11) 98765-4321' autoComplete='tel' />
            </label>
            <label className={styles.field}>
                <span>Data de nascimento</span>
                <input type='date' value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={todayIso()} autoComplete='bday' />
            </label>
            <p className={styles.hint}>O email é o do seu login e não muda por aqui.</p>
            {erro && <p className={styles.error} role='alert'>{erro}</p>}
            <Acoes onCancel={onDone} enviando={enviando} texto='Salvar' />
        </form>
    )
}

export const ChangePassword = ({ onDone }) => {
    const [atual, setAtual] = useState('')
    const [nova, setNova] = useState('')
    const [confirma, setConfirma] = useState('')
    const [ok, setOk] = useState('')
    const { enviando, erro, enviar } = useEnvio()

    const salvar = async (e) => {
        e.preventDefault()
        if (nova !== confirma) {
            await enviar(async () => { throw new Error('A confirmação não é igual à nova senha.') })
            return
        }
        const resposta = await enviar(() => api('/account/password', {
            method: 'POST', body: { currentPassword: atual, newPassword: nova },
        }))
        if (resposta) setOk(resposta.message)
    }

    if (ok) {
        return (
            <div className={styles.form}>
                <p className={styles.success} role='status'>{ok}</p>
                <div className={styles.actions}>
                    <button type='button' className={styles.primary} onClick={onDone}>Fechar</button>
                </div>
            </div>
        )
    }
    return (
        <form className={styles.form} onSubmit={salvar}>
            <label className={styles.field}>
                <span>Senha atual</span>
                <input type='password' value={atual} onChange={(e) => setAtual(e.target.value)} required autoComplete='current-password' />
            </label>
            <label className={styles.field}>
                <span>Nova senha (8 caracteres ou mais)</span>
                <input type='password' value={nova} onChange={(e) => setNova(e.target.value)} required minLength={8} maxLength={128} autoComplete='new-password' />
            </label>
            <label className={styles.field}>
                <span>Repita a nova senha</span>
                <input type='password' value={confirma} onChange={(e) => setConfirma(e.target.value)} required autoComplete='new-password' />
            </label>
            {erro && <p className={styles.error} role='alert'>{erro}</p>}
            <Acoes onCancel={onDone} enviando={enviando} texto='Trocar senha' />
        </form>
    )
}

export const ContactSupport = ({ onDone }) => {
    const [mensagem, setMensagem] = useState('')
    const [ok, setOk] = useState('')
    const { enviando, erro, enviar } = useEnvio()

    const salvar = async (e) => {
        e.preventDefault()
        const resposta = await enviar(() => api('/support', { method: 'POST', body: { message: mensagem } }))
        if (resposta) setOk(resposta.message)
    }

    if (ok) {
        return (
            <div className={styles.form}>
                <p className={styles.success} role='status'>{ok}</p>
                <div className={styles.actions}>
                    <button type='button' className={styles.primary} onClick={onDone}>Fechar</button>
                </div>
            </div>
        )
    }
    return (
        <form className={styles.form} onSubmit={salvar}>
            <label className={styles.field}>
                <span>Como podemos ajudar?</span>
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={6} required minLength={5} maxLength={2000}
                    placeholder='Conte o que aconteceu ou o que você precisa.' />
            </label>
            <p className={styles.hint}>A resposta chega no email da sua conta.</p>
            {erro && <p className={styles.error} role='alert'>{erro}</p>}
            <Acoes onCancel={onDone} enviando={enviando} texto='Enviar' />
        </form>
    )
}

export const DeleteAccount = ({ onDone }) => {
    const { updateUser } = useAuth()
    const navigate = useNavigate()
    const [senha, setSenha] = useState('')
    const [entendi, setEntendi] = useState(false)
    const { enviando, erro, enviar } = useEnvio()

    const excluir = async (e) => {
        e.preventDefault()
        const feito = await enviar(async () => {
            await api('/account', { method: 'DELETE', body: { password: senha } })
            return true
        })
        if (!feito) return
        updateUser(null)
        navigate('/auth/login', { replace: true })
    }

    return (
        <form className={styles.form} onSubmit={excluir}>
            <p className={styles.warning}>
                Isso apaga a sua conta e tudo o que está nela: treinos, testes, tempos, provas e respostas. Não dá para desfazer.
            </p>
            <label className={styles.check}>
                <input type='checkbox' checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
                <span>Entendi que a exclusão é definitiva.</span>
            </label>
            <label className={styles.field}>
                <span>Digite a sua senha para confirmar</span>
                <input type='password' value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete='current-password' />
            </label>
            {erro && <p className={styles.error} role='alert'>{erro}</p>}
            <div className={styles.actions}>
                <button type='button' className={styles.secondary} onClick={onDone}>Cancelar</button>
                <button type='submit' className={styles.danger} disabled={enviando || !entendi}>
                    {enviando ? 'Excluindo...' : 'Excluir minha conta'}
                </button>
            </div>
        </form>
    )
}
