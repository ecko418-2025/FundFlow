export function createDistributionStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const entropy = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DIST${year}${month}${day}${entropy}`;
}

export function getDistributionStamp(row = {}) {
  return row.stamp_no || row.stampNo || row.distribution_stamp || row.distribution_id || row.id || "-";
}
