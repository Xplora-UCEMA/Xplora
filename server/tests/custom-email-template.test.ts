import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCustomEmailVariables,
  findUnsupportedCustomEmailVariables,
  renderCustomEmailHtml,
} from '../src/domain/custom-email-template.js';

test('renderiza las variables permitidas y escapa sus valores', () => {
  const html = renderCustomEmailHtml(
    '<h1>Hola {{Nombre}}</h1><a href="{{Link}}">{{Titulo}}</a><img src="{{Imagen}}" alt="{{Asunto}}"><p>{{Email}} · {{Carrera}}</p>',
    {
      Nombre: 'Ana <script>',
      Email: 'ana@example.com',
      Carrera: 'Marketing & Ventas',
      Imagen: 'https://example.com/flyer.png?size=large&fit=cover',
      Link: 'https://example.com/evento?a=1&b=2',
      Titulo: 'Encuentro "Xplora"',
      Asunto: 'Te esperamos <3',
    },
  );

  assert.equal(
    html,
    '<h1>Hola Ana &lt;script&gt;</h1><a href="https://example.com/evento?a=1&amp;b=2">Encuentro &quot;Xplora&quot;</a><img src="https://example.com/flyer.png?size=large&amp;fit=cover" alt="Te esperamos &lt;3"><p>ana@example.com · Marketing &amp; Ventas</p>',
  );
});

test('acepta variables sin distinguir mayúsculas y detecta placeholders desconocidos', () => {
  const variables = {
    Nombre: 'Ana',
    Email: 'ana@example.com',
    Carrera: 'Marketing',
    Imagen: 'https://example.com/flyer.png',
    Link: 'https://example.com/evento',
    Titulo: 'Encuentro Xplora',
    Asunto: 'Te esperamos',
  } as const;
  const template = '<p>{{ nombre }} <img src="{{imagen}}"> {{Descuento}} {{descuento}}</p>';

  assert.equal(
    renderCustomEmailHtml(template, variables),
    '<p>Ana <img src="https://example.com/flyer.png"> {{Descuento}} {{descuento}}</p>',
  );
  assert.deepEqual(findUnsupportedCustomEmailVariables(template), ['Descuento']);
});

test('combina variables del contacto y de la campaña para cada envío', () => {
  assert.deepEqual(
    buildCustomEmailVariables(
      { nombre: 'Ana Torres', email: 'ana@example.com', carrera: 'Marketing' },
      {
        imagen: 'https://example.com/flyer.png',
        link: 'https://example.com/evento',
        titulo: 'After office Xplora',
        asunto: 'Tu invitación',
      },
    ),
    {
      Nombre: 'Ana Torres',
      Email: 'ana@example.com',
      Carrera: 'Marketing',
      Imagen: 'https://example.com/flyer.png',
      Link: 'https://example.com/evento',
      Titulo: 'After office Xplora',
      Asunto: 'Tu invitación',
    },
  );
});
