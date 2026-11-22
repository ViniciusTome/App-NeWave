// Envio de email. Um "mailer" é qualquer objeto com `async send({ to, subject, text })`.
//
// Por enquanto só existe o mailer de console, que NÃO envia nada: no modo de
// desenvolvimento ele imprime o email no terminal do servidor (é de lá que você
// copia o link de "esqueci a senha"). Para enviar de verdade, crie outro mailer
// com o mesmo formato (SMTP, Resend, SendGrid...) e passe em createApp({ mailer }).
export function createConsoleMailer({ showContent = false } = {}) {
  return {
    async send({ to, subject, text }) {
      if (!showContent) {
        // Em produção não imprimimos o conteúdo: o link seria uma senha nos logs.
        console.warn('Nenhum provedor de email configurado: um email NÃO foi enviado.')
        return
      }
      console.log(
        [
          '',
          '=== EMAIL (modo desenvolvimento: nada foi enviado de verdade) ===',
          `Para: ${to}`,
          `Assunto: ${subject}`,
          '',
          text,
          '================================================================',
          '',
        ].join('\n'),
      )
    },
  }
}

export function passwordResetMessage({ name, link }) {
  const firstName = String(name).trim().split(/\s+/)[0]
  return {
    subject: 'Redefinição de senha do NeWave',
    text: [
      `Olá, ${firstName}!`,
      '',
      'Recebemos um pedido para redefinir a senha da sua conta no NeWave.',
      'Para escolher uma nova senha, abra o link abaixo (ele vale por 1 hora e só funciona uma vez):',
      '',
      link,
      '',
      'Se você não fez esse pedido, pode ignorar este email: sua senha continua a mesma.',
    ].join('\n'),
  }
}
