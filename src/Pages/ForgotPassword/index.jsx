import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from '../Login/login.module.css'
import { Button } from '../../components/Button'
import { Fieldset } from '../../components/Fieldset'
import { Form } from '../../components/Form'
import { IconArrowFoward } from '../../components/icons/IconArrowFoward'
import { IconLogin } from '../../components/icons/IconLogin'
import { Input } from '../../components/Input'
import { Label } from '../../components/Label'
import { useAuth } from '../../hooks/useAuth'

export const ForgotPassword = () => {

    const { forgotPassword } = useAuth();
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        setError('');
        setIsSubmitting(true);

        const response = await forgotPassword(formData.get('email'));

        setIsSubmitting(false);

        if (response.success) {
            setSent(true)
        } else {
            setError(response.error)
        }
    }

    return (
        <div className={styles.background}>
            <div className={styles.boxLogin}>
                <div className={styles.container}>
                    <h4 className={styles.title}>Esqueci a senha</h4>
                    {sent ? (
                        <p className={styles.success} role='status'>
                            Se existir uma conta com esse email, enviamos um link para criar uma nova senha.
                            Ele vale por 1 hora. Se não encontrar, olhe também a caixa de spam.
                        </p>
                    ) : (
                        <>
                            <p className={styles.description}>Informe seu email e enviaremos um link para você criar uma nova senha.</p>
                            <Form onSubmit={onSubmit}>
                                <Fieldset>
                                    <Label>Email</Label>
                                    <Input type='email' name='email' id='email' placeholder='usuario@gmail.com' required />
                                </Fieldset>
                                {error && <p className={styles.error} role='alert'>{error}</p>}
                                <Button type='submit' disabled={isSubmitting}>
                                    {isSubmitting ? 'Enviando...' : <>Enviar link <IconArrowFoward /></>}
                                </Button>
                            </Form>
                        </>
                    )}
                    <footer className={styles.cadaster}>
                        <Link to='/auth/login'>Voltar para o login <IconLogin color='#002638ff' /></Link>
                    </footer>
                </div>
            </div>
        </div>
    )
}
