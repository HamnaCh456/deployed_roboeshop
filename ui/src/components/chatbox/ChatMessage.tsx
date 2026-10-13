/*
 * SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Chat message component for displaying different types of messages
 */

import React from "react";
import Showdown from "showdown";
import SafeHTML from "./SafeHTML";
import Loader from "./Loader";
import BomCard from "./BomCard";
import { ChatMessageProps, MessageRole, ImageContent, ImageRowContent, RobotRowContent, RobotCard } from "../../types";
import type { BomResult } from "../../agent/tools/generateBom";
import { isFashionMode } from "../../config/config";
// Served from public/ so it needs no import typing. Drawn in ink on the
// inverted surface — the same black the user's bubble uses.
const advisorAvatar = "/advisor.svg";

const ChatMessage = React.forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ role, content, productName }, ref) => {
    
    // CSS class mapping for markdown elements
    const classMap: Record<string, string> = {
      h1: `messages__item--${role}--h1`,
      h2: `messages__item--${role}--h2`,
      ul: `messages__item--${role}--ul`,
      li: `messages__item--${role}--li`,
      ol: `messages__item--${role}--ol`,
      p: `messages__item--${role}--p`,
    };

    // Create Showdown converter with custom extensions
    const bindings = Object.keys(classMap).map((key) => ({
      type: "output" as const,
      regex: new RegExp(`<${key}(.*)>`, "g"),
      replace: `<${key} class="${classMap[key]}" $1>`,
    }));

    const converter = new Showdown.Converter({
      extensions: [...bindings],
      simpleLineBreaks: true,  // This will convert single line breaks to <br>
    });

    // Don't render system messages
    if (role === "system") {
      return null;
    }

    // User message
    if (role === "user") {
      return (
        <div className={`messages__item messages__item--${role}`} ref={ref}>
          <SafeHTML html={content as string} />
        </div>
      );
    }

    // Assistant message
    if (role === "assistant") {
      if (content === "loader") {
        return (
          <div ref={ref} style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
            <img src={advisorAvatar} alt="Assistant" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
            <div className={`messages__item messages__item--${role}`}>
              <Loader />
            </div>
          </div>
        );
      }

      // Preprocess to convert list markers at the beginning of lines
      const preprocessedContent = (content as string)
        .replace(/^\* /gm, '• ')           // Convert * to bullet
        .replace(/^- /gm, '• ')             // Convert - to bullet
        .replace(/^\d+\. /gm, (match) => { // Keep numbered lists as-is
          return match;
        });
      
      // Then use the Markdown converter to handle all formatting including bold
      const processedContent = converter.makeHtml(preprocessedContent);

      return (
        <div ref={ref} style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
          <img src={advisorAvatar} alt="Assistant" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
          <div className={`messages__item messages__item--${role}`}>
            <SafeHTML html={processedContent} />
          </div>
        </div>
      );
    }

    // Image message (single product)
    if (role === "image") {
      const [imagePath, url, productName, productRating] = (content as string).split("|");
      
      if (imagePath && url && productName && productRating) {
        return (
          <div className={`messages__item messages__item--${role}`} ref={ref}>
            <img className="messages__item--image-img" src={imagePath} alt={productName} />
            <div className="messages__item--image-box">
              <div className="messages__item--image-stars">
                {productName}
              </div>
            </div>
          </div>
        );
      }
    }

    // Robot result cards. Each card carries the decision-relevant fields from
    // the proposal: verified seller, age and skill fit, programming support,
    // OS compatibility, local price with seller count, and tutorial coverage.
    if (role === "product_row") {
      const robots = content as RobotRowContent;

      return (
        <div className="robot-row" ref={ref}>
          {robots.map((robot: RobotCard) => {
            // ROS is listed as a platform too, so dedupe before capping —
            // otherwise a ROS 2 robot shows the chip twice. Three chips keeps
            // the strip readable; the rest belong on the full spec sheet.
            const chips = Array.from(
              new Set([...robot.platforms, ...(robot.ros ? [robot.ros] : [])])
            ).slice(0, 3);

            return (
              <article className="robot-card" key={robot.id}>
                <div className="robot-card__media">
                  <img src={robot.image} alt={robot.name} loading="lazy" />
                  {robot.verified && (
                    <span className="robot-card__verified">✓ Verified</span>
                  )}
                </div>

                <div className="robot-card__body">
                  <h4 className="robot-card__name" title={robot.name}>
                    {robot.name}
                  </h4>

                  <p className="robot-card__meta">
                    {robot.category}
                    {robot.ageMin !== undefined && ` · Ages ${robot.ageMin}+`}
                  </p>

                  <ul className="robot-card__chips">
                    {chips.map((chip) => (
                      <li key={chip} className="robot-card__chip">
                        {chip}
                      </li>
                    ))}
                    <li className="robot-card__chip robot-card__chip--skill">
                      {robot.skill}
                    </li>
                  </ul>

                  <div className="robot-card__price">
                    <span className="robot-card__amount">{robot.priceLabel}</span>
                    <span className="robot-card__offers">
                      {robot.offerCount} seller{robot.offerCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  {robot.tutorials > 0 && (
                    <p className="robot-card__tutorials">
                      ▶ {robot.tutorials} tutorials
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      );
    }

    // BOM result card — parts table produced by generate_bom tool
    if (role === "bom_row") {
      const bom = content as unknown as BomResult;
      return (
        <div ref={ref} style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, marginTop: 10, width: "100%" }}>
          <img src={advisorAvatar} alt="Assistant" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          <BomCard bom={bom} />
        </div>
      );
    }

    // Image row message (multiple products)
    if (role === "image_row") {
      const images = content as ImageRowContent;
      
      return (
        <div style={{ 
          width: "100%", 
          height: "auto", 
          display: "inline-flex", 
          flexFlow: "row wrap" 
        }}>
          {images.map((image: ImageContent, index: number) => (
            <div key={index} className={`messages__item messages__item--image`} ref={ref}>
              <img 
                className="messages__item--image-img-rowitem" 
                src={image.productUrl} 
                alt={image.productName}
              />
              <div className="messages__item--image-box">
                <div 
                  className="messages__item--image-stars" 
                  style={{
                    maxWidth: isFashionMode() ? "200px" : "none"
                  }}
                >
                  {image.productName}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // User uploaded image
    if (role === "user_image" && content) {
      return (
        <div className={`messages__item messages__item--${role}`} ref={ref}>
          <img 
            className="messages__item--image-img" 
            src={content as string} 
            alt="User upload"
            style={{ borderRadius: "20px" }} 
          />
        </div>
      );
    }

    return null;
  }
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
