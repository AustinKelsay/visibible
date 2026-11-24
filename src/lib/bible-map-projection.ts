/**
 * The map's one projection, shared by the outline build script and the map view: an equirectangular projection
 * stretched for the Holy Land's latitude, in hundredths of a degree, with north up (SVG y grows downward).
 */
export const MAP_X_SCALE = Math.cos((33 * Math.PI) / 180);

/** The part of the world the map outline covers: Spain to Persia, Ethiopia to the Black Sea. */
export const MAP_BOUNDS = { west: -12, south: 3, east: 65, north: 50 } as const;

/** A longitude and latitude in map units: x east, y south. */
export function project(lon: number, lat: number): [number, number] {
  return [lon * MAP_X_SCALE * 100, -lat * 100];
}
