import * as XLSX from "xlsx";

/**
 * 通用 JSON 数据导出为 Excel 文件
 * @param {Array} data 数据集，例如 [{ id: 1, name: '张三' }]
 * @param {Object} headersMap 字段对照映射表，形如 { name: '姓名', email: '邮箱' }
 * @param {string} fileName 导出文件名
 * @param {string} sheetName 表单名
 */
export function exportToExcel(data, headersMap, fileName, sheetName = "数据备份") {
  // 1. 将数据字段翻译为中文表头
  const mappedData = data.map((item) => {
    const row = {};
    Object.keys(headersMap).forEach((key) => {
      row[headersMap[key]] = item[key] !== null && item[key] !== undefined ? item[key] : "";
    });
    return row;
  });

  // 2. 生成 Worksheet 和 Workbook
  const worksheet = XLSX.utils.json_to_sheet(mappedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // 3. 下载 Excel
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

/**
 * 导出收益分配计算报表，保留页面上的分区结构：基本信息、直接层级预览、最终分配表与说明。
 */
export function exportDistributionReport({
  targetName,
  targetType,
  distributionDate,
  totalAmount,
  isPenetrate,
  directItems = [],
  lpItems = [],
  fileName = "收益分配计算表"
}) {
  const formatMoney = (value) => Number(value || 0);
  const formatPct = (value) => `${Number(value || 0).toFixed(2)}%`;
  const showDirectPreview = isPenetrate && directItems.some(item => item.entity_type === "pool");
  const finalShareTotal = lpItems.reduce((sum, item) => sum + Number(item.effective_share || 0), 0);
  const finalAmountTotal = lpItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const rows = [
    ["收益分配计算表"],
    [],
    ["目标分配实体", targetName || "-", "实体类型", targetType === "pool" ? "资金池" : "项目"],
    ["分配日期", distributionDate || "-", "拟分配总金额", formatMoney(totalAmount)],
    ["分配模式", isPenetrate ? "穿透分配" : "不穿透分配", "生成时间", new Date().toLocaleString("zh-CN")],
    []
  ];

  if (showDirectPreview) {
    const directShareTotal = directItems.reduce((sum, item) => sum + Number(item.effective_share || 0), 0);
    const directAmountTotal = directItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    rows.push(
      ["直接层级分配预览（含资金池/基金）"],
      ["直接收款主体", "主体类型", "直接份额", "直接层级金额"],
      ...directItems.map(item => [
        item.investor_name,
        item.entity_type === "pool" ? "资金池/基金" : "投资人",
        formatPct(item.effective_share),
        formatMoney(item.amount)
      ]),
      ["直接层级合计", "", formatPct(directShareTotal), formatMoney(directAmountTotal)],
      []
    );
  }

  rows.push(
    ["最终分配比例及应分金额计算表"],
    ["LP 姓名/实体名称", "直接份额", "间接份额（大池穿透）", "最终有效份额", "预计实分金额"],
    ...lpItems.map(item => [
      `${item.investor_name}${item.entity_type === "pool" ? "（资金池）" : ""}`,
      formatPct(item.direct_share),
      formatPct(item.indirect_share),
      formatPct(item.effective_share),
      formatMoney(item.amount)
    ]),
    ["有效持股总计", "", "", formatPct(finalShareTotal), formatMoney(finalAmountTotal)],
    [],
    ["说明", isPenetrate
      ? "已开启穿透模式：收益将沿着持股层级逐级拆解，直接汇入底层自然人/机构投资人账户。"
      : "当前为不穿透模式：若该实体中包含母池等上级实体组织，收益将截留在母池，不会自动下发。"
    ]
  );

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 22 },
    { wch: 24 },
    { wch: 20 },
    { wch: 20 }
  ];
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }
  ];

  Object.keys(worksheet).forEach((cellRef) => {
    if (cellRef.startsWith("!")) return;
    const cell = worksheet[cellRef];
    if (typeof cell.v === "number") {
      cell.z = "¥#,##0.00";
    }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "分配计算表");
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

/**
 * 从上传的 Excel 文件读取并转换为标准的字段 JSON 数据
 * @param {File} file 文件对象
 * @param {Object} headersMap 字段映射，例如 { '姓名': 'name', '邮箱': 'email' }，与导出的映射刚好相反
 * @returns {Promise<Array>}
 */
export function importFromExcel(file, headersMap) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 读取为包含表头的原始数据
        const rawJson = XLSX.utils.sheet_to_json(worksheet);

        // 将中文表头翻译回英文数据库字段
        const mappedList = rawJson.map((row) => {
          const item = {};
          Object.keys(row).forEach((chineseHeader) => {
            const englishKey = headersMap[chineseHeader.trim()];
            if (englishKey) {
              item[englishKey] = row[chineseHeader];
            }
          });
          return item;
        });

        resolve(mappedList);
      } catch (err) {
        reject(new Error("解析 Excel 文件失败，请确认文件格式是否正确"));
      }
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 前端直接构建下载示范模板
 * @param {Array} headers 中文表头数组，例如 ['出资方名称', '投资者性质', '对账邮箱']
 * @param {string} fileName 下载模板名称
 */
export function downloadTemplate(headers, fileName) {
  const row = {};
  headers.forEach((h) => {
    row[h] = ""; // 空数据占位
  });
  
  const worksheet = XLSX.utils.json_to_sheet([row]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "导入模板");
  XLSX.writeFile(workbook, `${fileName}_导入模板.xlsx`);
}
