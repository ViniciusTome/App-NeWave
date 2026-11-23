import { useCallback, useEffect, useState } from 'react'
import { ACCOUNT_CHANGED, api, TRAININGS_CHANGED } from '../services/api'
import { todayIso } from '../utils/format'

// Dados da conta para o Perfil: dados pessoais e os números de verdade (treinos
// realizados e sequência). Recarrega quando a conta ou os treinos mudam.
export function useAccount() {
    const [data, setData] = useState(null) // null = carregando
    const [error, setError] = useState('')

    const load = useCallback(() => {
        api(`/account?today=${todayIso()}`)
            .then((resposta) => {
                setData(resposta)
                setError('')
            })
            .catch((err) => setError(err.message))
    }, [])

    useEffect(() => {
        load()
        window.addEventListener(ACCOUNT_CHANGED, load)
        window.addEventListener(TRAININGS_CHANGED, load)
        return () => {
            window.removeEventListener(ACCOUNT_CHANGED, load)
            window.removeEventListener(TRAININGS_CHANGED, load)
        }
    }, [load])

    return { data, error }
}

// (11) 98765-4321 / (11) 3456-7890
export const formatPhone = (digits) => {
    if (!digits) return ''
    const ddd = digits.slice(0, 2)
    const resto = digits.slice(2)
    const corte = resto.length === 9 ? 5 : 4
    return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`
}
