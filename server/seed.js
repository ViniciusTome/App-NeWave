// Coloca dados de exemplo (testes e treinos) na conta de um usuário,
// para ver o Dashboard preenchido durante o desenvolvimento.
//
// Uso:  npm run seed -- seu@email.com
import { fileURLToPath } from 'node:url'
import { openDatabase } from './db.js'

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Informe o email da conta. Exemplo: npm run seed -- seu@email.com')
  process.exit(1)
}

const dbPath =
  process.env.DATABASE_PATH ?? fileURLToPath(new URL('./data/newave.db', import.meta.url))
const db = openDatabase(dbPath)

const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email)
if (!user) {
  console.error(`Nenhuma conta com o email ${email}. Crie a conta no app primeiro.`)
  db.close()
  process.exit(1)
}

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
const daysAhead = (days) => daysAgo(-days)
const now = new Date().toISOString()

// Tempos em centésimos de segundo, melhorando aos poucos (com uma piora no meio)
const tests = [
  [400, [33910, 33580, 33620, 33120, 32890, 32640], [84, 70, 56, 42, 28, 7]],
  [100, [7690, 7610, 7540, 7555, 7420], [80, 60, 45, 30, 10]],
  [50, [3420, 3380, 3310], [75, 40, 12]],
]

const trainings = [
  [3, 'Treino de resistência', '400 crawl', '(2x) 4 x 25 crawl forte', '5 x 400 crawl A2 com pp + palmar', '200 costas', 'Mantive o ritmo nas 5 séries.'],
  [5, 'Treino de velocidade', '300 crawl + 100 pernada', '8 x 25 crawl máximo, saída do bloco', '10 x 50 crawl A3', '200 livre leve', 'Saídas melhores que na semana passada.'],
  [8, 'Treino técnico', '200 crawl + 200 medley', '(2x) 4 x 25 educativo de braçada', '4 x 200 crawl A1 focando na respiração bilateral', '200 costas', ''],
  [10, 'Treino de limiar', '400 livre', '6 x 25 crawl forte', '3 x 600 crawl A2', '200 peito', 'Cansaço na última série.'],
  [12, 'Treino misto', '300 crawl', '4 x 50 borboleta + crawl', '8 x 100 medley A2', '200 costas', ''],
  [15, 'Treino de resistência', '400 crawl', '(2x) 4 x 25\n1ª série com pp\n2ª série nadando', '5 x 400 crawl A3 com pp + palmar', '200 crawl', ''],
  [17, 'Treino regenerativo', '200 crawl', '', '1.500 crawl contínuo leve', '200 costas', 'Recuperação depois da competição.'],
  [19, 'Treino de velocidade', '300 crawl', '12 x 25 crawl máximo', '6 x 100 crawl A3', '200 livre', ''],
]

// Treinos agendados (ainda não feitos), para o carrossel da Home.
// [dias a partir de hoje, título, aquecimento, velocidade, série principal, soltura]
// O de -1 dia passou da data sem ser feito: vai para o histórico como "não realizado".
const planned = [
  [-1, 'Treino aeróbico', '400 crawl', '', '6 x 300 crawl A1', '200 costas'],
  [0, 'Treino de resistência', '200 crawl', '(2x) 4 x 25\n1ª série com pp\n2ª série nadando', '5 x 400 crawl A3 com pp + palmar', '200 br crawl'],
  [2, 'Treino de velocidade', '300 crawl + 100 pernada', '8 x 25 crawl máximo', '10 x 50 crawl A3', '200 livre leve'],
  [4, 'Treino técnico', '200 crawl + 200 medley', '(2x) 4 x 25 educativo', '4 x 200 crawl A1 respiração bilateral', '200 costas'],
  [6, 'Treino de limiar', '400 livre', '6 x 25 crawl forte', '3 x 600 crawl A2', '200 peito'],
  [9, 'Treino misto', '300 crawl', '4 x 50 borboleta + crawl', '8 x 100 medley A2', '200 costas'],
]

const insertTest = db.prepare(
  'INSERT INTO tests (user_id, distance, time_hundredths, date, created_at) VALUES (?, ?, ?, ?, ?)',
)
const insertTraining = db.prepare(`
  INSERT INTO trainings
    (user_id, date, title, warm_up, speed, main_series, release, notes, created_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

db.exec('BEGIN')
try {
  for (const [distance, times, days] of tests) {
    times.forEach((time, i) => insertTest.run(user.id, distance, time, daysAgo(days[i]), now))
  }
  for (const [days, title, warmUp, speed, mainSeries, release, notes] of trainings) {
    insertTraining.run(user.id, daysAgo(days), title, warmUp, speed, mainSeries, release, notes, now, now)
  }
  for (const [days, title, warmUp, speed, mainSeries, release] of planned) {
    insertTraining.run(user.id, daysAhead(days), title, warmUp, speed, mainSeries, release, '', now, null)
  }
  db.exec('COMMIT')
} catch (err) {
  db.exec('ROLLBACK')
  throw err
} finally {
  db.close()
}

const testCount = tests.reduce((sum, [, times]) => sum + times.length, 0)
console.log(
  `Pronto! ${testCount} testes, ${trainings.length} treinos realizados e ${planned.length} agendados adicionados para ${user.name}.`,
)
