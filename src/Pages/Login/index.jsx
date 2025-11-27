import styles from './login.module.css'
import { IconArrowFoward } from '../../components/icons/IconArrowFoward'
import { IconAssignement } from '../../components/icons/IconAssignement'
import { Form } from '../../components/Form'
import { Fieldset } from '../../components/Fieldset'
import { Label } from '../../components/Label'
import { Input } from '../../components/Input'
import { TextDivider } from '../../components/TextDivider'
import { Button } from '../../components/Button'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'


export const Login = () => {

    const { login } = useAuth();
    const navigate = useNavigate();

    const onSubmit = (formData) => {

        const email = formData.get('email');
        const password = formData.get('password');

        const response = login(email, password);

        if (response.success) {
            navigate('/page/home')
        } else {
            console.error(response.error)
        }

    }

    return (
        <div className={styles.background}>
            <div className={styles.boxLogin}>
                <div className={styles.container}>
                    <h4 className={styles.title}>Login</h4>
                    <p className={styles.description}>Boas-vindas! Faça seu login.</p>
                    <Form action={onSubmit}>
                        <Fieldset>
                            <Label>Email ou usuário</Label>
                            <Input type='text' name='email' id='email' placeholder='Usuario123' />
                        </Fieldset>
                        <Fieldset>
                            <Label>Senha</Label>
                            <Input type='password' name='password' id='password' placeholder='Senha' />
                        </Fieldset>
                        <div className={styles.remember}>
                            <div className={styles.checkbox}>
                                <input type='checkbox'></input>
                                <label> Lembrar-me</label>
                            </div>
                            <a href='#'>Esqueci a senha</a>
                        </div>
                        <Button type='submit'>Login <IconArrowFoward /></Button>
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