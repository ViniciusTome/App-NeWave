// Funções de formatação usadas em várias telas.

// '2025-10-20' -> '20/10/2025' (sem passar por Date, para não mudar o dia por causa do fuso)
export const formatDate = (isoDate) => {
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
}

// '2025-10-20' -> '20/10'
export const formatShortDate = (isoDate) => formatDate(isoDate).slice(0, 5)

// Centésimos de segundo -> tempo no formato da natação: 33245 -> 5'32"45 e 5512 -> 55"12
export const formatSwimTime = (hundredths) => {
    const minutes = Math.floor(hundredths / 6000)
    const seconds = Math.floor((hundredths % 6000) / 100)
    const cents = hundredths % 100
    const pad = (n) => String(n).padStart(2, '0')
    return minutes > 0 ? `${minutes}'${pad(seconds)}"${pad(cents)}` : `${seconds}"${pad(cents)}`
}

// Diferença em centésimos -> texto em segundos: -320 -> '3,20 s'
export const formatSecondsDiff = (hundredths) =>
    `${(Math.abs(hundredths) / 100).toFixed(2).replace('.', ',')} s`

// Data de hoje no fuso do aparelho, no formato '2025-10-20'
export const todayIso = () => {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
