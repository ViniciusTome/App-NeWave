import styles from './login.module.css'
import { IconArrowFoward } from '../../components/icons/IconArrowFoward'
import { IconAssignement } from '../../components/icons/IconAssignement'
import { Form } from '../../components/Form'
import { Fieldset } from '../../components/Fieldset'
import { Label } from '../../components/Label'
import { PasswordInput } from '../../components/PasswordInput'
import { Input } from '../../components/Input'
import { TextDivider } from '../../components/TextDivider'
import { Button } from '../../components/Button'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'


export const Login = () => {

    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        setError('');
        setIsSubmitting(true);

        const response = await login(
            formData.get('email'),
            formData.get('password'),
            formData.get('remember') === 'on'
        );

        setIsSubmitting(false);

        if (response.success) {
            navigate('/page/home')
        } else {
            setError(response.error)
        }
    }

    return (
        <div className={styles.background}>
            <div className={styles.boxLogin}>
                <div className={styles.container}>
                    <h4 className={styles.title}>Login</h4>
                    <p className={styles.description}>Boas-vindas! Faça seu login.</p>
                    {location.state?.message && (
                        <p className={styles.success} role='status'>{location.state.message}</p>
                    )}
                    <Form onSubmit={onSubmit}>
                        <Fieldset>
                            <Label>Email</Label>
                            <Input type='email' name='email' id='email' placeholder='usuario@gmail.com' required />
                        </Fieldset>
                        <Fieldset>
                            <Label>Senha</Label>
                            <PasswordInput name='password' id='password' placeholder='Senha' required autoComplete='current-password' />
                        </Fieldset>
                        <div className={styles.remember}>
                            <div className={styles.checkbox}>
                                <input type='checkbox' name='remember' id='remember'></input>
                                <label htmlFor='remember'> Lembrar-me</label>
                            </div>
                            <Link to='/auth/forgot-password'>Esqueci a senha</Link>
                        </div>
                        {error && <p className={styles.error} role='alert'>{error}</p>}
                        <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting ? 'Entrando...' : <>Login <IconArrowFoward /></>}
                        </Button>
                    </Form>
                    <TextDivider text='ou entre com outras contas' />
                    <footer className={styles.cadaster}>
                        <p>Ainda não tem conta?</p>
                        <Link to='/auth/register'>Crie seu cadastro! <IconAssignement /></Link>
                    </footer>
                </div>
            </div>
        </div>
    )
}