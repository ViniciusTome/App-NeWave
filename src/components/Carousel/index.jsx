import { useRef } from 'react';
import { Card } from '../Card'
import styles from './carousel.module.css'

export const Carousel = () => {

    const carousel = useRef(null);

    const handleLeftClick = (e) => {
        e.preventDefault();
        carousel.current.scrollLeft -= (carousel.current.offsetWidth / 3) //telas menores é melhor usar  /2 e telas maiores /3

    };
    const handleRightClick = (e) => {
        e.preventDefault();
        carousel.current.scrollLeft += (carousel.current.offsetWidth / 3) //telas menores é melhor usar  /2 e telas maiores /3

    };


    return (
        <div>
            <div className={styles.carousel} ref={carousel}>
                <h2 style={{ color: 'white', fontSize: '25px' }}>Treinos</h2>
                <div className={styles.cards}>
                    <Card treino='1' data='12/10/2025'/>
                    <Card treino='2' data='14/10/2025'/>
                    <Card treino='3' data='16/10/2025'/>
                    <Card treino='4' data='18/10/2025'/>
                    <Card treino='5' data='20/10/2025'/>
                    <Card treino='6' data='22/10/2025'/>
                    <Card treino='7' data='24/10/2025'/>
                    <Card treino='8' data='26/10/2025'/>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={handleLeftClick}><img src='../../src/assets/chevron.svg' alt='Scroll Left'/> </button>
                <button onClick={handleRightClick}><img src='../../src/assets/chevron.svg' alt='Scroll Right'/></button>
            </div>
        </div>
    )
}