export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code // nome fixo do erro, quando o servidor envia (ex.: invalid_reset_link)
  }
}

// Chama a API do backend (as rotas começam com /api e o Vite repassa para o servidor).
export async function api(path, { method = 'GET', body } = {}) {
  let response

  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Tente novamente.', 0)
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      data?.error ?? 'Algo deu errado. Tente novamente.',
      response.status,
      data?.code,
    )
  }

  return data
}

// Evento disparado na janela quando um treino muda (ex.: foi concluído),
// para as telas que mostram treinos (carrossel, histórico) recarregarem.
export const TRAININGS_CHANGED = 'newave:trainings-changed'
export const notifyTrainingsChanged = () => window.dispatchEvent(new Event(TRAININGS_CHANGED))

// Disparado quando a anamnese ou a preparação mudam, para o Perfil recarregar.
export const ATHLETE_CHANGED = 'newave:athlete-changed'
export const notifyAthleteChanged = () => window.dispatchEvent(new Event(ATHLETE_CHANGED))

// Disparado quando os dados da conta mudam (Perfil: dados pessoais), para recarregar.
export const ACCOUNT_CHANGED = 'newave:account-changed'
export const notifyAccountChanged = () => window.dispatchEvent(new Event(ACCOUNT_CHANGED))
