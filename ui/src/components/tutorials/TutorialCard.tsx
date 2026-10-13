/**
 * One tutorial in the results grid.
 *
 * Shaped like a course card, per
 * docs/superpowers/specs/2026-09-19-photo-card-design.md: the thumbnail fills
 * the top edge to edge, the body below it is three lines and a footer, and
 * the card carries a real drop shadow and a hover lift. Nothing sits on the
 * photo. These thumbnails are the publishers' own cover images with a title
 * baked in, so a pill on top of one covers words.
 *
 * The body leads with whose work this is, the way a course card leads with
 * the provider — we index these tutorials and do not host them. The title is
 * an outbound link to the publisher, because a reader who clicks it expects
 * to arrive at the lesson, not at a stub of ours.
 *
 * The footer carries the format and the level as icon + word, and the kit
 * price. It used to be a row of pills; a pill per fact was the congestion.
 */

import React, { useState } from 'react';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import MemoryIcon from '@mui/icons-material/Memory';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CableIcon from '@mui/icons-material/Cable';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { Tutorial } from '../../types';
import Price from './Price';
import {
  FORMAT_LABEL,
  formatRuntime,
  kitTotal,
  partCount,
  pricedPartCount,
} from './format';

interface TutorialCardProps {
  tutorial: Tutorial;
}

/**
 * Publisher marks for the byline, keyed by `sourceName`. Their sites 403 a
 * hotlink (see the tutorial pipeline's notes), so these are the publishers'
 * own favicons, fetched once and kept in `ui/public/images/sources/`. A
 * publisher missing from this table falls back to its initial.
 */
const SOURCE_LOGO: Record<string, string> = {
  'RobotShop Community': '/images/sources/robotshop.png',
  RoboDK: '/images/sources/robodk.png',
  'The Construct': '/images/sources/theconstruct.png',
};

/** The format's icon. What kind of lesson this is, read at a glance. */
const FORMAT_ICON: Record<Tutorial['format'], React.ElementType> = {
  video: PlayCircleOutlineIcon,
  guide: MenuBookOutlinedIcon,
  wiring: CableIcon,
  course: SchoolOutlinedIcon,
};

function initialOf(tutorial: Tutorial): string {
  const name = tutorial.author || tutorial.sourceName || '?';
  return name.trim().charAt(0).toUpperCase();
}

const TutorialCard: React.FC<TutorialCardProps> = ({ tutorial }) => {
  // The Internet Archive never captured a thumbnail for a handful of these,
  // and a capture can go missing later. Same fallback as ProductCard.
  const [imageFailed, setImageFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const showImage = Boolean(tutorial.image) && !imageFailed;

  const parts = partCount(tutorial);
  const priced = pricedPartCount(tutorial);
  const FormatIcon = FORMAT_ICON[tutorial.format];
  const logo = SOURCE_LOGO[tutorial.sourceName];
  const showLogo = Boolean(logo) && !logoFailed;

  return (
    <li>
      <article className="tut-card">
        <div
          className={`tut-card__media${showImage ? '' : ' tut-card__media--empty'}`}
        >
          {showImage ? (
            <img
              src={tutorial.image}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="tut-card__nophoto">No photo</span>
          )}
          {tutorial.runtimeSec !== null && (
            <span className="tut-card__runtime">
              {formatRuntime(tutorial.runtimeSec)}
            </span>
          )}
        </div>

        <div className="tut-card__body">
          <p className="tut-card__source">
            {showLogo ? (
              <img
                className="tut-card__logo"
                src={logo}
                alt=""
                width={26}
                height={26}
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="tut-card__avatar" aria-hidden="true">
                {initialOf(tutorial)}
              </span>
            )}
            <span className="tut-card__source-name">
              {tutorial.author ? `${tutorial.author}, ` : ''}
              {tutorial.sourceName}
            </span>
          </p>

          <h3 className="tut-card__title">
            <a
              href={tutorial.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {tutorial.title}
            </a>
          </h3>

          {tutorial.summary && (
            <p className="tut-card__summary">{tutorial.summary}</p>
          )}

          <div className="tut-card__foot">
            <span className="tut-card__facts">
              <span className="tut-card__fact">
                <FormatIcon fontSize="inherit" />
                {FORMAT_LABEL[tutorial.format]}
                <span className="tut-card__sep">·</span>
                <SignalCellularAltIcon fontSize="inherit" />
                {tutorial.level}
              </span>
              {/* The kit figure is ours, so it says nothing when we matched
                  nothing rather than showing a confident Rs 0. */}
              {priced > 0 ? (
                <span className="tut-card__fact tut-card__fact--kit">
                  <MemoryIcon fontSize="inherit" />
                  <Price amount={kitTotal(tutorial)} />
                  <span className="tut-card__parts">
                    · {parts} {parts === 1 ? 'part' : 'parts'}
                  </span>
                </span>
              ) : (
                <span className="tut-card__fact tut-card__fact--muted">
                  {tutorial.category}
                </span>
              )}
            </span>
            {/* A visual target, not a second link: the stretched title link
                already covers the whole card, this included. */}
            <span className="tut-card__cta" aria-hidden="true">
              Open
            </span>
          </div>
        </div>
      </article>
    </li>
  );
};

export default TutorialCard;
