import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Abre (ou cria) o banco SQLite e garante que as tabelas existam.
export function openDatabase(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      created_at    TEXT    NOT NULL
    );

    -- Guardamos só o hash do token da sessão: se o banco vazar,
    -- ninguém consegue usar esses valores para entrar na conta.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- Links de "esqueci a senha". Também guardamos só o hash do token.
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);

    -- Testes de tempo que o atleta faz (ex.: 400 m em 5'32"45).
    -- O tempo fica em centésimos de segundo, como número inteiro, para não
    -- ter erro de arredondamento.
    CREATE TABLE IF NOT EXISTS tests (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      distance         INTEGER NOT NULL,
      time_hundredths  INTEGER NOT NULL,
      date             TEXT    NOT NULL,
      created_at       TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tests_user ON tests(user_id, distance, date);

    -- Treinos do atleta, com as quatro partes do treino.
    -- completed_at vazio (NULL) = treino agendado, ainda não realizado.
    CREATE TABLE IF NOT EXISTS trainings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date         TEXT    NOT NULL,
      title        TEXT    NOT NULL DEFAULT '',
      warm_up      TEXT    NOT NULL DEFAULT '',
      speed        TEXT    NOT NULL DEFAULT '',
      main_series  TEXT    NOT NULL DEFAULT '',
      release      TEXT    NOT NULL DEFAULT '',
      notes        TEXT    NOT NULL DEFAULT '',
      created_at   TEXT    NOT NULL,
      completed_at TEXT,
      parts        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_trainings_user ON trainings(user_id, date);

    -- Anamnese do atleta: respondida uma vez e editável depois.
    -- Listas (estilos, dias, material) ficam em JSON.
    CREATE TABLE IF NOT EXISTS athlete_profiles (
      user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      swimming_since      TEXT    NOT NULL,
      recent_break        TEXT    NOT NULL,
      continuous_distance TEXT    NOT NULL,
      strokes             TEXT    NOT NULL,
      training_days       TEXT    NOT NULL,
      session_minutes     INTEGER NOT NULL,
      pool_length         INTEGER NOT NULL,
      equipment           TEXT    NOT NULL,
      injuries            TEXT    NOT NULL DEFAULT '',
      reported_400_hundredths INTEGER,
      best_stroke         TEXT,
      created_at          TEXT    NOT NULL,
      updated_at          TEXT    NOT NULL
    );

    -- Calendário de competições. Prioridade: A = prova alvo, B = importante,
    -- C = teste ou "bate-pronto".
    CREATE TABLE IF NOT EXISTS competitions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      modality   TEXT    NOT NULL,
      event      TEXT    NOT NULL DEFAULT '',
      priority   TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_competitions_user ON competitions(user_id, date);

    -- Cada vez que o atleta gera treinos, ele escolhe o objetivo e a prova alvo
    -- (ou nenhuma prova). A mais recente é a preparação atual.
    CREATE TABLE IF NOT EXISTS preparations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal           TEXT    NOT NULL,
      competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
      created_at     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_preparations_user ON preparations(user_id, id);
  `)

  // Bancos criados antes da agenda de treinos não têm a coluna completed_at.
  // Todos os treinos que existiam eram realizados, então marcamos como concluídos.
  const trainingColumns = db.prepare('PRAGMA table_info(trainings)').all().map((col) => col.name)
  if (!trainingColumns.includes('completed_at')) {
    db.exec(`
      ALTER TABLE trainings ADD COLUMN completed_at TEXT;
      UPDATE trainings SET completed_at = created_at;
    `)
  }

  // Treinos gerados guardam as partes (JSON); bancos antigos não têm a coluna
  const trainingCols = db.prepare('PRAGMA table_info(trainings)').all().map((col) => col.name)
  if (!trainingCols.includes('parts')) db.exec('ALTER TABLE trainings ADD COLUMN parts TEXT')
  // Feedback ao concluir (dificuldade 1 a 10 e o motivo) e o plano interno do treino
  // gerado (esforço esperado, fase...), que o atleta não vê
  if (!trainingCols.includes('difficulty')) db.exec('ALTER TABLE trainings ADD COLUMN difficulty INTEGER')
  if (!trainingCols.includes('difficulty_reason')) db.exec('ALTER TABLE trainings ADD COLUMN difficulty_reason TEXT')
  if (!trainingCols.includes('plan')) db.exec('ALTER TABLE trainings ADD COLUMN plan TEXT')
  // Tempo informado na anamnese também vira um registro na evolução dos tempos
  // ("anamnese"); os outros vêm do "+ Teste"
  const testColumns = db.prepare('PRAGMA table_info(tests)').all().map((col) => col.name)
  if (!testColumns.includes('origin')) db.exec('ALTER TABLE tests ADD COLUMN origin TEXT')
  // Quem já tinha informado o tempo na anamnese (antes disso existir): o tempo entra na
  // evolução, com a data da última vez que salvou a anamnese. Uma vez só.
  db.exec(`
    INSERT INTO tests (user_id, distance, time_hundredths, date, created_at, origin)
    SELECT p.user_id, 400, p.reported_400_hundredths, substr(p.updated_at, 1, 10), p.updated_at, 'anamnese'
    FROM athlete_profiles p
    WHERE p.reported_400_hundredths IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tests t WHERE t.user_id = p.user_id AND t.distance = 400)
  `)
  // Falta: o atleta disse que não fez o treino (a pergunta aparece quando ele abre o app)
  if (!trainingCols.includes('missed_at')) db.exec('ALTER TABLE trainings ADD COLUMN missed_at TEXT')
  // Nado contínuo (série de teste): 1 = nadou sem parar; 0 = precisou parar; null = não tinha
  if (!trainingCols.includes('nonstop_ok')) db.exec('ALTER TABLE trainings ADD COLUMN nonstop_ok INTEGER')

  // Pergunta "Qual é o seu melhor estilo?" chegou depois: bancos antigos não têm a coluna
  const profileColumns = db.prepare('PRAGMA table_info(athlete_profiles)').all().map((col) => col.name)
  if (!profileColumns.includes('best_stroke')) {
    db.exec('ALTER TABLE athlete_profiles ADD COLUMN best_stroke TEXT')
  }

  // Dados pessoais (Perfil): telefone e data de nascimento chegaram depois
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((col) => col.name)
  if (!userColumns.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT')
  if (!userColumns.includes('birth_date')) db.exec('ALTER TABLE users ADD COLUMN birth_date TEXT')
  // Entrar com o Google: o id da conta Google e se a pessoa já criou uma senha no app
  if (!userColumns.includes('google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT')
  // Tutorial do app: quando a pessoa viu (ou pulou); null = ainda não viu
  if (!userColumns.includes('tutorial_seen_at')) db.exec('ALTER TABLE users ADD COLUMN tutorial_seen_at TEXT')
  if (!userColumns.includes('password_set')) db.exec('ALTER TABLE users ADD COLUMN password_set INTEGER NOT NULL DEFAULT 1')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_sub) WHERE google_sub IS NOT NULL')

  // Prova com distância, estilo e meta (modelo Específico); a preparação guarda o modelo
  const competitionColumns = db.prepare('PRAGMA table_info(competitions)').all().map((col) => col.name)
  if (!competitionColumns.includes('distance')) db.exec('ALTER TABLE competitions ADD COLUMN distance INTEGER')
  if (!competitionColumns.includes('stroke')) db.exec('ALTER TABLE competitions ADD COLUMN stroke TEXT')
  if (!competitionColumns.includes('goal_hundredths')) db.exec('ALTER TABLE competitions ADD COLUMN goal_hundredths INTEGER')
  // Várias provas na mesma competição (JSON); a 1ª é a principal (fica também nas colunas acima)
  if (!competitionColumns.includes('events')) db.exec('ALTER TABLE competitions ADD COLUMN events TEXT')
  const preparationColumns = db.prepare('PRAGMA table_info(preparations)').all().map((col) => col.name)
  if (!preparationColumns.includes('model')) db.exec("ALTER TABLE preparations ADD COLUMN model TEXT NOT NULL DEFAULT 'geral'")
  // Teste de 400 m na periodização: 1 = o atleta quer, 0 = não quer, null = não perguntado (regra antiga)
  if (!preparationColumns.includes('with_test')) db.exec('ALTER TABLE preparations ADD COLUMN with_test INTEGER')

  // Mensagens para o suporte (Perfil -> Suporte -> Entre em contato)
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL,
      message    TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );
  `)

  // Faixas antigas de "quanto nada sem parar" -> nomes atuais
  // ('ate_100' era "50 a 100 m"; '100_400' virou duas faixas e fica na de 200 a 400 m)
  db.exec(`
    UPDATE athlete_profiles SET continuous_distance = '50_100' WHERE continuous_distance = 'ate_100';
    UPDATE athlete_profiles SET continuous_distance = '200_400' WHERE continuous_distance = '100_400';
  `)

  return db
}
