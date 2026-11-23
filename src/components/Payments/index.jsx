import styles from './payments.module.css'

// Pagamentos: ainda não há planos pagos (o app está gratuito). Quando houver, a
// escolha e o pagamento do plano entram aqui.
export const Payments = () => {

    return (
        <div className={styles.plan}>
            <p className={styles.name}>
                <strong>Plano atual: gratuito.</strong> Por enquanto o NeWave não cobra nada. Quando os planos chegarem,
                você escolhe o seu e paga por aqui.
            </p>
        </div>
    )
}
