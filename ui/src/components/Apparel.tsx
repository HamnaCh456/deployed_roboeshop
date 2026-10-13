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

"use client";

/**
 * Apparel/Product display component
 */

import React from "react";
import { getDefaultImage } from "../config/config";
import { useRenderImage } from "../context/RenderImageContext";

const Apparel: React.FC = () => {
  const { newRenderImage } = useRenderImage();
  const displayImage = newRenderImage || getDefaultImage();

  return (
    // Matches the vertical band of the fixed chat panel (top 64px, bottom 0)
    // so the two halves line up instead of leaving a gap under the image.
    <div className="product-pane">
      <img
        src={displayImage}
        alt="Product display"
        className="product-image"
      />
    </div>
  );
};

export default Apparel;
