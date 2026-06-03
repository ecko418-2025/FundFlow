import React from "react";

export function Badge({ text, status }) {
  let badgeStyle = styles.default;
  const lowerStatus = String(status).toLowerCase();

  if (lowerStatus === "active" || lowerStatus === "in" || lowerStatus === "confirmed") {
    badgeStyle = styles.success;
  } else if (lowerStatus === "pre" || lowerStatus === "draft" || lowerStatus === "pending") {
    badgeStyle = styles.warning;
  } else if (lowerStatus === "exited" || lowerStatus === "out" || lowerStatus === "closed") {
    badgeStyle = styles.danger;
  }

  return (
    <span style={{ ...styles.badge, ...badgeStyle }}>
      {text}
    </span>
  );
}

const styles = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "0.75rem",
    fontWeight: "600",
    letterSpacing: "0.02em"
  },
  success: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    color: "#10B981",
    border: "1px solid rgba(16, 185, 129, 0.2)"
  },
  warning: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    color: "#F59E0B",
    border: "1px solid rgba(245, 158, 11, 0.2)"
  },
  danger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    color: "#EF4444",
    border: "1px solid rgba(239, 68, 68, 0.2)"
  },
  default: {
    backgroundColor: "rgba(107, 114, 128, 0.1)",
    color: "#9CA3AF",
    border: "1px solid rgba(107, 114, 128, 0.2)"
  }
};
export default Badge;
