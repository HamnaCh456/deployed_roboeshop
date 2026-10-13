/**
 * A price.
 *
 * The currency is a mark on the amount, not part of it. Setting "Rs" at the
 * amount's own size and weight is what made a price read as a string of
 * characters rather than a figure, so it is its own element here and takes its
 * size from `.fig__unit` in tutorials.css.
 *
 * Renders bare content — the caller supplies the element that carries the
 * figure tier, so a price can sit in a card row or a table cell unchanged.
 */

import React from 'react';
import { groupDigits } from './format';

interface PriceProps {
  amount: number;
  /**
   * Ledger lines name the currency once in the column head rather than on
   * every row, so those pass `false`.
   */
  showUnit?: boolean;
}

const Price: React.FC<PriceProps> = ({ amount, showUnit = true }) => (
  <>
    {showUnit && <span className="fig__unit">Rs</span>}
    {groupDigits(amount)}
  </>
);

export default Price;
