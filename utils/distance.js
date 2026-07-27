// utils/distance.js
export function haversineDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 == null || lon1 == null ||
    lat2 == null || lon2 == null ||
    Number.isNaN(lat1) || Number.isNaN(lon1) ||
    Number.isNaN(lat2) || Number.isNaN(lon2)
  ) return 0;

  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
