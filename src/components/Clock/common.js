// O que os dois relógios (cronômetro do teste e relógio de saída) usam juntos:
// o tema (escuro ou claro), o bipe e manter a tela acesa.
import { useCallback, useEffect, useRef, useState } from 'react'

// Tema: 'escuro' (fundo preto, números vermelhos) ou 'claro' (fundo branco, números
// pretos, para piscina aberta com sol). O app lembra a escolha neste aparelho.
const CHAVE_TEMA = 'newave:tema-do-relogio'
export function useClockTheme() {
    const [tema, setTema] = useState(() => {
        try {
            return localStorage.getItem(CHAVE_TEMA) === 'claro' ? 'claro' : 'escuro'
        } catch {
            return 'escuro'
        }
    })
    const trocar = useCallback(() => {
        setTema((atual) => {
            const novo = atual === 'escuro' ? 'claro' : 'escuro'
            try {
                localStorage.setItem(CHAVE_TEMA, novo)
            } catch {
                // sem armazenamento: só não lembra
            }
            return novo
        })
    }, [])
    return [tema, trocar]
}

// Bipe (Web Audio) e vibração. O som precisa ser liberado por um toque do atleta
// (`liberar`, no botão de começar), por causa das regras dos navegadores.
export function useBeep() {
    const contexto = useRef(null)
    const liberar = useCallback(() => {
        try {
            contexto.current ??= new (window.AudioContext || window.webkitAudioContext)()
            if (contexto.current.state === 'suspended') contexto.current.resume()
        } catch {
            // sem som: fica a vibração e a tela
        }
    }, [])
    const bipe = useCallback((longo = false) => {
        try {
            const ctx = contexto.current
            if (ctx) {
                const osc = ctx.createOscillator()
                const vol = ctx.createGain()
                osc.type = 'square'
                osc.frequency.value = longo ? 1320 : 880
                vol.gain.value = 0.35
                osc.connect(vol)
                vol.connect(ctx.destination)
                const fim = ctx.currentTime + (longo ? 0.7 : 0.18)
                vol.gain.setValueAtTime(0.35, fim - 0.05)
                vol.gain.linearRampToValueAtTime(0, fim)
                osc.start()
                osc.stop(fim)
            }
        } catch {
            // sem som
        }
        try {
            navigator.vibrate?.(longo ? 600 : 150)
        } catch {
            // sem vibração
        }
    }, [])
    return { liberar, bipe }
}

// Mantém a tela acesa enquanto o relógio está aberto (quando o aparelho deixa)
export function useWakeLock(ativo) {
    useEffect(() => {
        if (!ativo || !navigator.wakeLock) return undefined
        let trava = null
        let cancelado = false
        const pedir = () => navigator.wakeLock.request('screen').then((t) => {
            if (cancelado) t.release()
            else trava = t
        }).catch(() => {})
        pedir()
        // Ao voltar para o app, pede de novo (o navegador solta a trava quando sai)
        const voltar = () => document.visibilityState === 'visible' && pedir()
        document.addEventListener('visibilitychange', voltar)
        return () => {
            cancelado = true
            document.removeEventListener('visibilitychange', voltar)
            trava?.release().catch(() => {})
        }
    }, [ativo])
}

// Um "tique" a cada 100 ms enquanto `ativo` (o relógio redesenha pelo horário real)
export function useTick(ativo) {
    const [agora, setAgora] = useState(() => Date.now())
    useEffect(() => {
        if (!ativo) return undefined
        const id = setInterval(() => setAgora(Date.now()), 100)
        return () => clearInterval(id)
    }, [ativo])
    return agora
}
