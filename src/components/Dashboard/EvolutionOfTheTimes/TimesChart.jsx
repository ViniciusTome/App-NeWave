import { useEffect, useId, useRef, useState } from 'react'
import { formatDate, formatShortDate, formatSwimTime } from '../../../utils/format'
import styles from './evolutionofthetimes.module.css'

const PAD = { top: 12, right: 12, bottom: 22, left: 50 }

// Mede o tamanho do elemento e atualiza quando ele muda (ex.: janela redimensionada)
const useElementSize = () => {
    const ref = useRef(null)
    const [size, setSize] = useState({ width: 0, height: 0 })

    useEffect(() => {
        const element = ref.current
        if (!element) return
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            setSize({ width: Math.floor(width), height: Math.floor(height) })
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    return [ref, size]
}

// Gráfico de linha dos tempos de uma distância. Ocupa todo o espaço do elemento pai.
// O eixo vertical é invertido: quanto mais alto o ponto, mais rápido o tempo.
export const TimesChart = ({ tests }) => {
    const [wrapperRef, { width, height }] = useElementSize()

    return (
        <div ref={wrapperRef} className={styles.chartWrapper}>
            {width > 0 && height > 0 && <ChartSvg tests={tests} width={width} height={height} />}
        </div>
    )
}

const ChartSvg = ({ tests, width: WIDTH, height: HEIGHT }) => {
    // useId pode ter caracteres que não funcionam dentro de url(#...)
    const gradientId = `tempos-${useId().replace(/[^\w-]/g, '')}`

    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom

    const days = tests.map((t) => Date.parse(`${t.date}T00:00:00Z`))
    const firstDay = Math.min(...days)
    const lastDay = Math.max(...days)
    const x = (day) =>
        lastDay === firstDay
            ? PAD.left + innerW / 2
            : PAD.left + ((day - firstDay) / (lastDay - firstDay)) * innerW

    const times = tests.map((t) => t.timeHundredths)
    const fastest = Math.min(...times)
    const slowest = Math.max(...times)
    const margin = Math.max((slowest - fastest) * 0.12, 50) // folga para os pontos não colarem na borda
    const top = fastest - margin
    const bottom = slowest + margin
    const y = (time) => PAD.top + ((time - top) / (bottom - top)) * innerH

    const points = tests.map((t, i) => ({ ...t, cx: x(days[i]), cy: y(t.timeHundredths) }))
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')
    const baseline = PAD.top + innerH
    const area = points.length > 1
        ? `${line} L${points.at(-1).cx.toFixed(1)},${baseline} L${points[0].cx.toFixed(1)},${baseline} Z`
        : ''

    const ticks = fastest === slowest ? [fastest] : [fastest, Math.round((fastest + slowest) / 2), slowest]
    const bestId = tests.find((t) => t.timeHundredths === fastest).id

    const summary = `Evolução de ${tests.length} testes: de ${formatSwimTime(times[0])} em ${formatDate(tests[0].date)} ` +
        `para ${formatSwimTime(times.at(-1))} em ${formatDate(tests.at(-1).date)}. Melhor tempo: ${formatSwimTime(fastest)}.`

    return (
        <svg
            className={styles.chart}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role='img'
            aria-label={summary}
            width={WIDTH}
            height={HEIGHT}
        >
            <defs>
                <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='#7fe3ff' stopOpacity='0.35' />
                    <stop offset='100%' stopColor='#7fe3ff' stopOpacity='0' />
                </linearGradient>
            </defs>

            {/* Linhas de referência, como as raias da piscina */}
            {ticks.map((tick) => (
                <g key={tick}>
                    <line
                        x1={PAD.left}
                        x2={WIDTH - PAD.right}
                        y1={y(tick)}
                        y2={y(tick)}
                        className={styles.gridLine}
                    />
                    <text x={PAD.left - 6} y={y(tick)} className={styles.axisLabel} textAnchor='end' dominantBaseline='middle'>
                        {formatSwimTime(tick)}
                    </text>
                </g>
            ))}

            {area && <path d={area} fill={`url(#${gradientId})`} />}
            {points.length > 1 && <path d={line} className={styles.line} />}

            {points.map((p) => (
                <circle
                    key={p.id}
                    cx={p.cx}
                    cy={p.cy}
                    r={p.id === bestId ? 5 : 3.5}
                    className={p.id === bestId ? styles.bestPoint : styles.point}
                >
                    <title>{`${formatDate(p.date)}: ${formatSwimTime(p.timeHundredths)}`}</title>
                </circle>
            ))}

            <text x={PAD.left} y={HEIGHT - 4} className={styles.axisLabel} textAnchor={points.length > 1 ? 'start' : 'middle'} dx={points.length > 1 ? 0 : innerW / 2}>
                {formatShortDate(tests[0].date)}
            </text>
            {lastDay !== firstDay && (
                <text x={WIDTH - PAD.right} y={HEIGHT - 4} className={styles.axisLabel} textAnchor='end'>
                    {formatShortDate(tests.at(-1).date)}
                </text>
            )}
        </svg>
    )
}
