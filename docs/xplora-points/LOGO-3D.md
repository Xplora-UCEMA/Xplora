# Xplora — logo original en 3D

- El frente usa el archivo original `src/public/images/logo sin fondo.webp`, sin redibujarlo, agregar rayas ni aplicar filtros a su cara.
- Dieciocho copias cacheadas de esa imagen forman el canto, con sombreado estático y un borde más claro. Profundidad de 28px en el logo grande y proporcional en las otras variantes.
- Es el ícono compartido de las monedas Xplora Points: saldo, recompensas y acceso usan `PointMark`.
- Perspectiva de 560px y movimiento continuo aleatorio: cada tramo dura entre 3,2 y 5,2 segundos, alternando el giro horizontal entre 18° y 38° por lado, con inclinación vertical de ±20°, giro de ±12° y elevación entre 1% y 8%.
- Cada tramo parte exactamente del final anterior, sin saltos ni una secuencia fija repetida. Los íconos se mueven independientemente.
- Sólo se anima `transform` con Web Animations API; el siguiente tramo se elige al completar el anterior. Sin nuevas dependencias, temporizadores ni bucles por fotograma. Las animaciones completadas se cancelan para no acumular efectos.
- Pausa fuera de pantalla y con la pestaña oculta; `prefers-reduced-motion` conserva una pose 3D estática.
- Prueba de navegador: arte original, profundidad, perspectiva, cuatro tramos nuevos con tiempos variables, continuidad exacta, pausa/reanudación y ausencia de desbordes en móvil.

Se descartó la variante 2D con marcas cardinales. Los cambios permanecen locales; no se publicó ni se modificó producción.
