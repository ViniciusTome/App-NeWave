import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import styles from '../Login/login.module.css'
import { Button } from '../../components/Button'
import { Fieldset } from '../../components/Fieldset'
import { Form } from '../../components/Form'
import { IconArrowFoward } from '../../components/icons/IconArrowFoward'
import { IconLogin } from '../../components/icons/IconLogin'
import { Input } from '../../components/Input'
import { Label } from '../../components/Label'
import { useAuth } from '../../hooks/useAuth'

export const ResetPassword = () => {

    const { resetPassword } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [error, setError] = useState('');
    const [linkFailed, setLinkFailed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const password = formData.get('password');

        if (password !== formData.get('confirmPassword')) {
            setError('As senhas não são iguais.')
            return
        }

        setError('');
        setIsSubmitting(true);

        const response = await resetPassword(token, password);

        setIsSubmitting(false);

        if (response.success) {
            navigate('/auth/login', { state: { message: 'Senha alterada! Entre com a nova senha.' } })
        } else {
            setError(response.error)
            // Link inválido/expirado não adianta tentar de novo: precisa pedir outro.
            // (Senha fraca é outro erro e dá para corrigir na mesma tela.)
            setLinkFailed(response.code === 'invalid_reset_link')
        }
    }

    const invalidLink = !token || linkFailed

    return (
        <div className={styles.background}>
            <div className={styles.boxLogin}>
                <div className={styles.container}>
                    <h4 className={styles.title}>Nova senha</h4>
                    {invalidLink ? (
                        <>
                            <p className={styles.error} role='alert'>
                                {error || 'Este link é inválido ou expirou. Peça um novo.'}
                            </p>
                            <footer className={styles.cadaster}>
                                <Link to='/auth/forgot-password'>Pedir um novo link <IconArrowFoward /></Link>
                            </footer>
                        </>
                    ) : (
                        <>
                            <p className={styles.description}>Escolha uma nova senha para a sua conta.</p>
                            <Form onSubmit={onSubmit}>
                                <Fieldset>
                                    <Label>Nova senha</Label>
                                    <Input
                                        type='password'
                                        name='password'
                                        id='password'
                                        placeholder='Mínimo de 8 caracteres'
                                        required
                                        minLength={8}
                                        maxLength={128}
                                    />
                                </Fieldset>
                                <Fieldset>
                                    <Label>Confirme a nova senha</Label>
                                    <Input
                                        type='password'
                                        name='confirmPassword'
                                        id='confirmPassword'
                                        placeholder='Repita a senha'
                                        required
                                        minLength={8}
                                        maxLength={128}
                                    />
                                </Fieldset>
                                {error && <p className={styles.error} role='alert'>{error}</p>}
                                <Button type='submit' disabled={isSubmitting}>
                                    {isSubmitting ? 'Salvando...' : <>Salvar nova senha <IconArrowFoward /></>}
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
