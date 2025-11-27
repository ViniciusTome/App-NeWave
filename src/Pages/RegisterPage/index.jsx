import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Fieldset } from '../../components/Fieldset'
import { Form } from '../../components/Form'
import { IconArrowFoward } from '../../components/icons/IconArrowFoward'
import { IconLogin } from '../../components/icons/IconLogin'
import { Input } from '../../components/Input'
import { Label } from '../../components/Label'
import { TextDivider } from '../../components/TextDivider'
import styles from './register.module.css'
import { useAuth } from '../../hooks/useAuth'


export const Register = () => {

    const { register } = useAuth();
    const navigate = useNavigate();

    const onSubmit = (formData) => {
        const name = formData.get('name');
        const email = formData.get('email');
        const password = formData.get('password');

        const response = register(name, email, password);

        if (response.success) {
            navigate('/auth/login')
        } else {
            console.error(response.error)
        }

    }

    return (
        <div className={styles.boxCadaster}>
            <div className={styles.container}>
                <h4 className={styles.title}>Cadastro</h4>
                <p className={styles.description}>Olá! Preencha seus dados.</p>
                <Form action={onSubmit}>
                    <Fieldset>
                        <Label>Nome</Label>
                        <Input 
                            type='text' 
                            name='name' 
                            id='name' 
                            placeholder='Nome completo' 
                        />
                    </Fieldset>
                    <Fieldset>
                        <Label>Email</Label>
                        <Input 
                            type='email' 
                            name='email' 
                            id='email' 
                            placeholder='Usuario@gmail.com' 
                        />
                    </Fieldset>
                    <Fieldset>
                        <Label>Senha</Label>
                        <Input 
                            type='password' 
                            name='password' 
                            id='password' 
                            placeholder='Senha' 
                        />
                    </Fieldset>
                    <div className={styles.remember}>
                        <div className={styles.checkbox}>
                            <input type='checkbox'></input>
                            <label> Lembrar-me</label>
                        </div>
                    </div>
                    <Button type='submit'>Cadastrar <IconArrowFoward /></Button>
                </Form>
                
                <TextDivider text='ou entre com outras contas' />
                <footer className={styles.login}>
                    <p>Já tem conta?</p>
                    <Link to='/auth/login'>Faça seu login! <IconLogin color='#002638ff' /></Link>
                </footer>

            </div>

        </div>
    )
}