import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findUnsupportedPreviewVariables,
  isValidOptionalHttpUrl,
  renderCustomEmailPreview,
} from '../src/components/admin/customEmailTemplate.js';

test('la vista previa reemplaza variables sin distinguir mayúsculas', () => {
  const template = '<h1>{{Nombre}}</h1><img src="{{imagen}}"><a href="{{ LINK }}">Abrir</a>{{Cupon}}';
  const html = renderCustomEmailPreview(template, {
    Nombre: 'María Xplora',
    Email: 'maria@example.com',
    Carrera: 'Negocios',
    Imagen: 'https://example.com/flyer.png',
    Link: 'https://example.com/evento',
    Titulo: 'Meet Xplora',
    Asunto: 'Tu invitación',
  });

  assert.equal(
    html,
    '<h1>María Xplora</h1><img src="https://example.com/flyer.png"><a href="https://example.com/evento">Abrir</a>{{Cupon}}',
  );
  assert.deepEqual(findUnsupportedPreviewVariables(template), ['Cupon']);
});

test('acepta URLs HTTP opcionales y rechaza esquemas inseguros', () => {
  assert.equal(isValidOptionalHttpUrl(''), true);
  assert.equal(isValidOptionalHttpUrl('https://xplora.example/evento'), true);
  assert.equal(isValidOptionalHttpUrl('http://localhost:5173/demo'), true);
  assert.equal(isValidOptionalHttpUrl('javascript:alert(1)'), false);
  assert.equal(isValidOptionalHttpUrl('no-es-url'), false);
});
