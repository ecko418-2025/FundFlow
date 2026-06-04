import React, { useState, useEffect } from "react";

export function AmountInput({ value, onChange, placeholder = "请输入金额", disabled = false }) {
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    if (value === "" || value === null || value === undefined) {
      setDisplayValue("");
    } else {
      // 外部传入值变化时，格式化为千分位
      const num = Number(value);
      if (!isNaN(num)) {
        setDisplayValue(num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    }
  }, [value]);

  const handleFocus = () => {
    // 聚焦时，还原为纯数字字符串，方便编辑
    if (value !== "" && value !== null && value !== undefined) {
      setDisplayValue(String(value));
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    // Allow only numbers, commas, and a single decimal point
    if (/^[0-9.,]*$/.test(val)) {
      setDisplayValue(val);
    }
    // Do NOT call onChange here; defer until blur for proper formatting
  };

  const handleBlur = () => {
    // 失焦时，重新进行格式化显示
    const raw = displayValue.replace(/,/g, "");
    const num = Number(raw);
    if (!isNaN(num) && raw !== "") {
      onChange(num);
      setDisplayValue(num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else {
      setDisplayValue("");
      onChange("");
    }
  };

  return (
    <div style={styles.container}>
      <span style={styles.symbol}>¥</span>
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="form-input mono"
        style={styles.input}
      />
    </div>
  );
}

const styles = {
  container: {
    position: "relative",
    width: "100%"
  },
  symbol: {
    position: "absolute",
    left: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--accent-gold)",
    fontWeight: "700",
    fontSize: "1.1rem",
    pointerEvents: "none",
    zIndex: 2
  },
  input: {
    paddingLeft: "32px",
    textAlign: "right"
  }
};
export default AmountInput;
