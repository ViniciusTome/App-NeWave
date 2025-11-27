import { useEffect, useState } from 'react'
import styles from './profile.module.css'

export const Profile = () => {

    return (
        <div className={styles.profile}>
            <img src="../../src/assets/logoBranco.png" />
            <div className={styles.description}>
                <p  className={styles.name}>Vinicius Tomé Damasio</p>
                <p  className={styles.email}>viniciustomee98@gmail.com</p>
                <p className={styles.treinos}>Treinos realizados: 43 treinos - (Você está em uma sequência de 36 treinos sem falhar!)</p>
                <p className={styles.competitionDate}>Proxima Competição: 29/11/2025 - (Faltam x dias para a sua competição.)</p>
            </div>
        </div>
    )
}