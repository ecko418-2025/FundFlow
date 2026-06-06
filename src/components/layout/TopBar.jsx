import React from "react";

export function TopBar() {
  return (
    <header style={styles.topbar}>
      <div>
        <h1 style={styles.title}>贷管家 资金管理台</h1>
      </div>
    </header>
  );
}

const styles = {
  topbar: {
    height: "70px",
    backgroundColor: "rgba(9, 13, 26, 0.8)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    position: "fixed",
    left: "260px",
    right: 0,
    top: 0,
    zIndex: 99
  },
  title: {
    fontSize: "1.15rem",
    fontWeight: "700",
    color: "var(--text-primary)"
  }
};
export default TopBar;
