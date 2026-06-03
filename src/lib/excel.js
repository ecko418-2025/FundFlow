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
