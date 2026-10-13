/**
 * BomCard — renders a BomResult as a styled parts-table inside the chat panel.
 *
 * Styled in its own sheet, bomCard.css, in the DESIGN.md palette: white
 * surface, hairline borders, mono type for prices and stamps. chatbox.css
 * stays untouched upstream styling, so these rules do not live there.
 */

import React from "react";
import type { BomResult, BomLine } from "../../agent/tools/generateBom";
import "../../bomCard.css";

export interface BomCardProps {
  bom: BomResult;
}

/** Convert a project key like "line-following robot" to "Line-Following Robot". */
function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

const BomCard: React.FC<BomCardProps> = ({ bom }) => {
  return (
    <div className="bom-card">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bom-card__header">
        <span className="bom-card__title">
          📋 {toTitleCase(bom.projectName)} — Parts List
        </span>
        {bom.skill && (
          <span className="bom-card__meta">Skill: {bom.skill}</span>
        )}
        {bom.platform && (
          <span className="bom-card__meta">Platform: {bom.platform}</span>
        )}
      </div>

      {/* ── Parts table ────────────────────────────────────────────── */}
      {bom.lines.length > 0 ? (
        <table className="bom-card__table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Qty</th>
              <th>Part</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {bom.lines.map((line: BomLine, i: number) => (
              <tr
                key={i}
                className={line.notFound ? "bom-card__row--missing" : ""}
              >
                {/* Role */}
                <td>{line.role}</td>

                {/* Qty */}
                <td style={{ textAlign: "center" }}>{line.qty}</td>

                {/* Part name */}
                <td>
                  {line.notFound ? (
                    <span className="bom-card__name" style={{ fontStyle: "italic" }}>
                      — not found
                    </span>
                  ) : (
                    <>
                      <span className="bom-card__name">{line.name}</span>
                      {!line.inStock && (
                        <span className="bom-card__out-of-stock"> (out of stock)</span>
                      )}
                    </>
                  )}
                </td>

                {/* Price + buy link */}
                <td>
                  {line.notFound ? (
                    <span style={{ opacity: 0.4 }}>—</span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>
                        {line.qty > 1 && line.priceLabel
                          ? `${line.priceLabel} each`
                          : (line.priceLabel ?? "—")}
                      </span>
                      {line.sourceUrl && (
                        <a
                          className="bom-card__buy-link"
                          href={line.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Buy →
                        </a>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#8f8f8f", fontSize: 13, margin: "8px 0 0" }}>
          No parts matched in the catalogue for this project type.
        </p>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="bom-card__footer">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="bom-card__total">Total: {bom.totalLabel}</span>
          {bom.withinBudget === true && (
            <span className="bom-card__budget-ok">✓ Within budget</span>
          )}
          {bom.withinBudget === false && (
            <span className="bom-card__budget-over">⚠ Over budget</span>
          )}
        </div>

        {bom.missingParts.length > 0 && (
          <p className="bom-card__missing-note">
            Not found in catalogue:{" "}
            {bom.missingParts.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
};

export default BomCard;
