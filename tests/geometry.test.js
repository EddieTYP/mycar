const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRouteGeometry, decodePolyline } = require('../lib/geometry');

test('decodePolyline decodes encoded route geometry into lat/lng pairs', () => {
  const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(points, [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ]);
});

test('normalizeRouteGeometry converts encoded ORS geojson line string to lat/lng pairs', () => {
  const geometry = {
    type: 'LineString',
    coordinates: [
      [114.1582784, 22.2818286],
      [114.1904697, 22.3815527],
    ],
  };

  assert.deepEqual(normalizeRouteGeometry(geometry), [
    [22.2818286, 114.1582784],
    [22.3815527, 114.1904697],
  ]);
});

test('normalizeRouteGeometry converts GraphHopper points coordinates to lat/lng pairs', () => {
  const geometry = {
    coordinates: [
      [114.1582784, 22.2818286],
      [114.1904697, 22.3815527],
    ],
  };

  assert.deepEqual(normalizeRouteGeometry(geometry), [
    [22.2818286, 114.1582784],
    [22.3815527, 114.1904697],
  ]);
});

test('normalizeRouteGeometry returns null for unsupported geometry', () => {
  assert.equal(normalizeRouteGeometry(''), null);
  assert.equal(normalizeRouteGeometry({ coordinates: [] }), null);
});
