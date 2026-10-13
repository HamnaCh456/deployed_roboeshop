/**
 * The featured build.
 *
 * Half photograph, half bill of materials. A course site can show you the
 * lesson and a parts shop can show you the price; the point of this product is
 * that one page does both, so the hero is the tutorial *with its receipt*.
 */

import React from 'react';
import { Tutorial } from '../../types';
import Price from './Price';
import { kitTotal, pricedPartCount } from './format';

interface FeaturedTutorialProps {
  tutorial: Tutorial;
}

const FeaturedTutorial: React.FC<FeaturedTutorialProps> = ({ tutorial }) => (
  <article className="tut-featured">
    <div className="tut-featured__media">
      {tutorial.image ? <img src={tutorial.image} alt="" /> : null}
    </div>

    <div className="tut-featured__body">
      <p className="tut-eyebrow">Featured build</p>

      <h2 className="tut-featured__title">
        <a href={tutorial.sourceUrl} target="_blank" rel="noreferrer noopener">
          {tutorial.title}
        </a>
      </h2>

      {/* The lesson is theirs; the prices below are ours. Saying so up front is
          the honest version of a hero, and it is also the product's argument:
          nobody else joins these two things. */}
      <p className="tut-featured__byline">
        {tutorial.author ? `${tutorial.author}, ` : ''}
        {tutorial.sourceName}
        {tutorial.publishedAt ? ` · ${tutorial.publishedAt}` : ''}
      </p>

      <p className="tut-featured__summary">{tutorial.summary}</p>

      <section className="tut-bom">
        {/* The currency is named once at the head of the column. Repeating
            "Rs" down six rows adds no information and costs the figures their
            alignment. */}
        {/* "What you need" is a claim we cannot support. These are the parts
            the tutorial *names*, found by matching its text against the
            catalogue — and a lesson that compares three boards names all three
            without needing any two of them. Saying "mentions" costs nothing
            and is true of every tutorial here; saying "need" is false for
            some, in a way a reader could only discover after buying. */}
        <div className="tut-bom__head">
          <h3 className="tut-bom__legend">Parts this tutorial mentions</h3>
          <span className="tut-bom__unit">PKR</span>
        </div>

        <table className="tut-bom__table">
          <tbody>
            {tutorial.parts.map((part) => (
              <tr key={part.name}>
                <td className="tut-bom__name">
                  {/* Each line is a real listing on a real site, so it links
                      there. This is the whole point of matching the parts. */}
                  {part.productUrl ? (
                    <a
                      href={part.productUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {part.name}
                    </a>
                  ) : (
                    part.name
                  )}
                  {part.sourceSite ? (
                    <span className="tut-bom__seller">{part.sourceSite}</span>
                  ) : null}
                </td>
                {/* A quantity of one is the default, so it goes unsaid. */}
                <td className="tut-bom__qty">
                  {part.qty > 1 ? '×' + part.qty : ''}
                </td>
                <td className="tut-bom__cost">
                  {part.price === null ? (
                    /* The seller publishes no price. A dash, never a zero. */
                    <span className="tut-bom__poa">—</span>
                  ) : (
                    <Price amount={part.qty * part.price} showUnit={false} />
                  )}
                </td>
              </tr>
            ))}
            <tr className="tut-bom__total">
              <td className="tut-bom__name">
                All of them, cheapest here
                {/* Says so when the total does not cover every line, instead
                    of quietly under-reporting it. */}
                {pricedPartCount(tutorial) < tutorial.parts.length ? (
                  <span className="tut-bom__seller">
                    {pricedPartCount(tutorial)} of {tutorial.parts.length} priced
                  </span>
                ) : null}
              </td>
              <td className="tut-bom__qty" />
              <td className="tut-bom__cost">
                <Price amount={kitTotal(tutorial)} />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="tut-featured__actions">
        {/* An anchor, not a button: the tutorial is on RobotShop's site and
            this is the click that takes you there. */}
        <a
          className="tut-button"
          href={tutorial.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Read on {tutorial.sourceName}
        </a>
        <button type="button" className="tut-button tut-button--quiet">
          Add the kit to cart
        </button>
      </div>
    </div>
  </article>
);

export default FeaturedTutorial;
