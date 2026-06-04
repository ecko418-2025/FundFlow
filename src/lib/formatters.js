/**
 * 格式化金额为千分位人民币字符串
 * @param {number} amount 金额
 * @param {boolean} showUnit 是否显示元/万元单位
 * @param {boolean} useWanIfLarge 是否在大数值时使用万元单位
 * @returns {string}
 */
export function formatCNY(amount, showUnit = true, useWanIfLarge = true) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "¥0.00";
  }

  // 如果金额很大，提供“万元”转换逻辑
  if (Math.abs(amount) >= 10000 && !showUnit && useWanIfLarge) {
    const wan = amount / 10000;
    return `¥${wan.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万`;
  }

  const formatted = amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return `¥${formatted}${showUnit ? " 元" : ""}`;
}

/**
 * 格式化金额为“万元”单位用于图表或摘要
 * @param {number} amount 
 * @returns {string}
 */
export function formatWan(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "0.00 万元";
  }
  const wan = amount / 10000;
  return `${wan.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 万元`;
}

/**
 * 格式化百分比
 * @param {number} pct 百分比数值 (如 35.5000 表示 35.5%)
 * @param {number} decimals 小数位数
 * @returns {string}
 */
export function formatPercent(pct, decimals = 2) {
  if (pct === undefined || pct === null || isNaN(pct)) {
    return "0.00%";
  }
  return `${Number(pct).toFixed(decimals)}%`;
}

/**
 * 格式化日期字符串
 * @param {string|Date} date 
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
}
