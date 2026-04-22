function decodePolyline(encoded, precision = 5) {
  if (typeof encoded !== 'string' || !encoded) return null;

  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates.length >= 2 ? coordinates : null;
}

function normalizeRouteGeometry(geometry) {
  if (typeof geometry === 'string') {
    return decodePolyline(geometry);
  }

  const coords = geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    return null;
  }

  const normalized = coords
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lon, lat]) => [Number(lat), Number(lon)])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

  return normalized.length >= 2 ? normalized : null;
}

module.exports = { normalizeRouteGeometry, decodePolyline };
