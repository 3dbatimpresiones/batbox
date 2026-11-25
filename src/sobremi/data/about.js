// =====================================================================
// SOBRE MÍ — textos de la sección (tomados de 3dbat.com.ar/sobre-mi).
// Fotos en src/assets/: Vite les pone un nombre nuevo cada vez que cambian,
// así nadie ve una foto vieja guardada en el navegador.
// =====================================================================
import portrait from '../assets/sobre-mi-retrato.webp';

export const ABOUT = {
  title: 'Impresión 3D desde la',
  titleAccent: 'experiencia real.',
  name: 'Facundo Colace',
  // Se muestra como: "Soy <name>, <lead>"
  lead: 'creador de 3DBAT IMPRESIONES y de la comunidad Makers 3DBAT: un espacio argentino donde la impresión 3D y la cultura maker se unen para compartir experiencias y proyectos reales.',
  paragraphs: [
    'Llevo años trabajando con impresión 3D, probando materiales, configuraciones y máquinas en situaciones reales. Todo lo que comparto nace de la práctica diaria: del error, del ajuste fino y de la mejora constante.',
  ],
  timeline: [
    {
      icon: 'printer', when: '2022 – presente', title: '3DBAT IMPRESIONES',
      text: 'Proyectos decorativos y funcionales, optimizando procesos y buscando siempre soluciones reales aplicadas al día a día.',
    },
    {
      icon: 'users', when: '2023 – presente', title: 'Comunidad MAKERS 3DBAT',
      text: 'Una comunidad donde el conocimiento se comparte, se aprende en conjunto y se crece como maker.',
    },
    {
      icon: 'box', when: 'Hoy', title: 'BATBOX y Makers Club',
      text: 'Herramientas, tutoriales y la WikiBAT en un solo lugar, para que cada maker tenga todo a mano.',
    },
  ],
  values: [
    {
      icon: 'sparkles', title: 'Impresiones únicas',
      text: 'Cada pieza es el resultado de pruebas, ajustes y pasión: el espíritu maker que impulsa a 3DBAT.',
    },
    {
      icon: 'messageCircle', title: 'Comunidad viva',
      text: 'Un espacio donde compartimos aprendizajes, consejos y proyectos para crecer juntos.',
    },
    {
      icon: 'lightbulb', title: 'Ideas que cobran vida',
      text: 'Impresiones que cuentan historias y aprendizajes de todos los días.',
    },
  ],
  portrait,
  portraitAlt: 'Facundo Colace, creador de 3DBAT IMPRESIONES',
  workshop: null, // foto nueva del taller pendiente (va en src/assets/ e importada como el retrato)
  workshopAlt: 'El taller de 3DBAT: impresoras 3D sobre un banco de madera, con carretes de filamento y una estantería con insumos',
  workshopCaption: 'El taller, donde se prueba todo lo que después compartimos.',
};
