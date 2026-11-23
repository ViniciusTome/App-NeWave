import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../services/api'
import styles from './googlebutton.module.css'

const SCRIPT = 'https://accounts.google.com/gsi/client'
let carregando = null // o script do Google, carregado uma vez só

function carregarScript() {
    carregando ??= new Promise((resolve, reject) => {
        const tag = document.createElement('script')
        tag.src = SCRIPT
        tag.async = true
        tag.onload = resolve
        tag.onerror = () => {
            carregando = null
            reject(new Error('Não foi possível carregar o login do Google.'))
        }
        document.head.appendChild(tag)
    })
    return carregando
}

// "Entrar com o Google" (botão oficial do Google). Só aparece quando o servidor tem o
// client ID configurado (GOOGLE_CLIENT_ID).
export const GoogleButton = ({ texto = 'continue_with' }) => {
    const { loginGoogle } = useAuth()
    const navigate = useNavigate()
    const lugar = useRef(null)
    const [clientId, setClientId] = useState(null)
    const [erro, setErro] = useState('')

    useEffect(() => {
        let cancelado = false
        api('/auth/config').then(({ googleClientId }) => !cancelado && setClientId(googleClientId)).catch(() => {})
        return () => { cancelado = true }
    }, [])

    useEffect(() => {
        if (!clientId) return
        let cancelado = false
        carregarScript()
            .then(() => {
                if (cancelado || !lugar.current) return
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: async ({ credential }) => {
                        setErro('')
                        const resposta = await loginGoogle(credential)
                        if (resposta.success) navigate('/page/home')
                        else setErro(resposta.error)
                    },
                })
                window.google.accounts.id.renderButton(lugar.current, {
                    theme: 'outline', size: 'large', shape: 'pill', text: texto, locale: 'pt-BR',
                    width: Math.min(lugar.current.offsetWidth || 320, 400),
                })
            })
            .catch((err) => !cancelado && setErro(err.message))
        return () => { cancelado = true }
    }, [clientId, loginGoogle, navigate, texto])

    if (!clientId) return null
    return (
        <div className={styles.wrapper}>
            <div ref={lugar} className={styles.botao} />
            {erro && <p className={styles.erro} role='alert'>{erro}</p>}
        </div>
    )
}
