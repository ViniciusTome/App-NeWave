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

  // Pergunta "Qual é o seu melhor estilo?" chegou depois: bancos antigos não têm a coluna
  const profileColumns = db.prepare('PRAGMA table_info(athlete_profiles)').all().map((col) => col.name)
  if (!profileColumns.includes('best_stroke')) {
    db.exec('ALTER TABLE athlete_profiles ADD COLUMN best_stroke TEXT')
  }

  // Faixas antigas de "quanto nada sem parar" -> nomes atuais
  // ('ate_100' era "50 a 100 m"; '100_400' virou duas faixas e fica na de 200 a 400 m)
  db.exec(`
    UPDATE athlete_profiles SET continuous_distance = '50_100' WHERE continuous_distance = 'ate_100';
    UPDATE athlete_profiles SET continuous_distance = '200_400' WHERE continuous_distance = '100_400';
  `)

  return db
}
