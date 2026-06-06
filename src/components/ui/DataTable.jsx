import React from "react";

export function DataTable({ headers = [], data = [], emptyMessage = "暂无相关数据", onRowClick = null, summaryData = null }) {
  return (
    <div style={styles.container} className="table-container">
      <table className="data-table" style={styles.table}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th 
                key={i} 
                style={{ 
                  ...styles.th, 
                  textAlign: h.align || "left",
                  width: h.width || "auto"
                }}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={styles.emptyCell}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr 
                key={rowIndex} 
                onClick={() => onRowClick && onRowClick(row)}
                style={{ 
                  ...styles.tr,
                  cursor: onRowClick ? "pointer" : "default"
                }}
              >
                {headers.map((h, colIndex) => {
                  const val = row[h.key];
                  return (
                    <td 
                      key={colIndex} 
                      style={{ 
                        ...styles.td, 
                        textAlign: h.align || "left" 
                      }}
                    >
                      {h.render ? h.render(val, row) : (val === null || val === undefined ? "-" : val)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
        {summaryData && data.length > 0 && (
          <tfoot>
            <tr style={styles.summaryTr}>
              {headers.map((h, colIndex) => {
                const val = summaryData[h.key];
                return (
                  <td 
                    key={colIndex} 
                    style={{ 
                      ...styles.summaryTd, 
                      textAlign: h.align || "left" 
                    }}
                  >
                    {val !== undefined 
                      ? (h.summaryRender ? h.summaryRender(val, summaryData) : (h.render ? h.render(val, summaryData) : val)) 
                      : ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    overflowX: "auto",
    background: "rgba(17, 24, 39, 0.4)",
    borderRadius: "8px",
    border: "1px solid var(--border)"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem"
  },
  th: {
    padding: "14px 16px",
    color: "var(--text-secondary)",
    fontSize: "0.8rem",
    fontWeight: "600",
    borderBottom: "1px solid var(--border)",
    backgroundColor: "rgba(9, 13, 26, 0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.05em"
  },
  tr: {
    borderBottom: "1px solid var(--border)",
    transition: "background-color 0.15s ease"
  },
  td: {
    padding: "16px",
    color: "var(--text-primary)",
    verticalAlign: "middle"
  },
  emptyCell: {
    padding: "40px",
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: "0.85rem"
  },
  summaryTr: {
    backgroundColor: "rgba(9, 13, 26, 0.7)",
    borderTop: "2px solid var(--border)",
  },
  summaryTd: {
    padding: "16px",
    color: "var(--text-primary)",
    fontWeight: "700",
    verticalAlign: "middle",
  }
};
export default DataTable;
