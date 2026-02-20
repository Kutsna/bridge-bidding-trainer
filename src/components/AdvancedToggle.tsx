import React from "react";

interface Props {
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
}

export default function AdvancedToggle({ advanced, setAdvanced }: Props) {
  return (
    <button
      onClick={() => setAdvanced(!advanced)}
      style={{
        padding: "8px 14px",
        background: advanced ? "#003366" : "#dddddd",
        color: advanced ? "white" : "black",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        marginBottom: "10px"
      }}
    >
      {advanced ? "Advanced Mode ON" : "Advanced Mode OFF"}
    </button>
  );
}