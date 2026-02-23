import React from "react";
import { COMPANIES } from "./companies";

const companyNames = Object.keys(COMPANIES).sort((a, b) => b.length - a.length);
const pattern = new RegExp(`(${companyNames.map(escapeRegex).join("|")})`, "g");

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function linkifyCompanies(text: string): (string | React.ReactElement)[] {
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const href = COMPANIES[part];
    if (href) {
      return (
        <a key={i} href={href} className="company-link">
          {part}
        </a>
      );
    }
    return part;
  });
}
