import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Fieldset } from '../../components/Fieldset'
import { Form } from '../../components/Form'
import { IconArrowFoward } from '../../components/icons/IconArrowFoward'
import { IconLogin } from '../../components/icons/IconLogin'
import { Input } from '../../components/Input'
import { Label } from '../../components/Label'
import { PasswordInput } from '../../components/PasswordInput'
import { TextDivider } from '../../components/TextDivider'
import { GoogleButton } from '../../components/GoogleButton'
import styles from './register.module.css'
import { useAuth } from '../../hooks/useAuth'


export const Register = () => {

    const { register } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        setError('');
        setIsSubmitting(true);

        const response = await register(
            formData.get('name'),
            formData.get('email'),
            formData.get('password')
        );

        setIsSubmitting(false);

        if (response.success) {
            navigate('/auth/login', { state: { message: 'Conta criada! Agora é só entrar.' } })
        } else {
            setError(response.error)
        }
    }

    return (
        <div className={styles.boxCadaster}>
            <div className={styles.container}>
                <h4 className={styles.title}>Cadastro</h4>
                <p className={styles.description}>Olá! Preencha seus dados.</p>
                <Form onSubmit={onSubmit}>
                    <Fieldset>
                        <Label>Nome</Label>
                        <Input 
                            type='text' 
                            name='name' 
                            id='name' 
                            placeholder='Nome completo' 
                            required
                            minLength={2}
                            maxLength={100}
                        />
                    </Fieldset>
                    <Fieldset>
                        <Label>Email</Label>
                        <Input 
                            type='email' 
                            name='email' 
                            id='email' 
                            placeholder='Usuario@gmail.com' 
                            required
                        />
                    </Fieldset>
                    <Fieldset>
                        <Label>Senha</Label>
                        <PasswordInput
                            name='password'
                            id='password'
                            placeholder='Senha (mínimo de 8 caracteres)'
                            required
                            minLength={8}
                            maxLength={128}
                            autoComplete='new-password'
                        />
                    </Fieldset>
                    {error && <p className={styles.error} role='alert'>{error}</p>}
                    <Button type='submit' disabled={isSubmitting}>
                        {isSubmitting ? 'Cadastrando...' : <>Cadastrar <IconArrowFoward /></>}
                    </Button>
                </Form>
                
                <TextDivider text='ou entre com outras contas' />
                    <GoogleButton texto='signup_with' />
                <footer className={styles.login}>
                    <p>Já tem conta?</p>
                    <Link to='/auth/login'>Faça seu login! <IconLogin color='#002638ff' /></Link>
                </footer>

            </div>

        </div>
    )
}