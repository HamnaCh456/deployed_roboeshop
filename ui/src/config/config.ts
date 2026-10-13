// SPDX-FileCopyrightText: Copyright (c) 2025 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Configuration file for the Shopping Assistant UI
 */

export interface AppConfig {
  api: {
    baseUrl: string;
    port: number;
    endpoints: {
      query: string;
      stream: string;
      health: string;
    };
  };
  ui: {
    /** Wordmark in the navbar. Change it here and nowhere else. */
    brand: string;
    /** Name of the assistant panel. */
    assistantName: string;
    defaultImages: {
      fashion: string;
    };
    /** Navbar taxonomy. Mirrors the scraper's categories in enrich.py. */
    categories: string[];
    /** Which category renders as the current one. */
    activeCategory: string;
    /**
     * The stores the crawl covers, as the landing page names them. The
     * scraper's config.yaml is the authority; this list is what the copy
     * says, so keep the two in step when a site is added.
     */
    stores: string[];
  };
  features: {
    guardrails: {
      enabled: boolean;
      defaultState: boolean;
    };
    imageUpload: {
      enabled: boolean;
      maxSize: number; // in MB
      allowedTypes: string[];
    };
  };
}

// Get configuration based on environment
const getConfig = (): AppConfig => {
  // Default to nginx proxy routing, but allow local development to target the
  // mock server directly. NEXT_PUBLIC_ is what lets Next inline it into the
  // browser bundle; set it in ui/.env (see .env.example).
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

  return {
    api: {
      baseUrl: baseUrl,
      port: 80,
      endpoints: {
        query: '/query',
        stream: '/query/stream',
        health: '/health',
      },
    },
    ui: {
      brand: "Servo",
      assistantName: "Robot Advisor",
      defaultImages: {
        // A real catalogue photo stands in for the blueprint's clothing splash.
        // Chosen because it carries no supplier watermark, unlike many of the
        // scraped images.
        fashion: "/images/DIY_Electronic_Starter_Kit_for_UNO_R3_Arduino_Circuit_Board_Electronic.jpg",
      },
      // Taken from the categories the scraper actually assigns, ordered by how
      // many products fall into each.
      categories: [
        "SENSORS",
        "CONTROLLERS",
        "MOTORS & ACTUATORS",
        "DISPLAY & AUDIO",
        "POWER",
        "ROBOT KITS",
      ],
      activeCategory: "SENSORS",
      stores: ["robo.pk", "robostan.pk", "instock.pk", "Unitree", "Nexa Robots"],
    },
    features: {
      guardrails: {
        enabled: true,
        defaultState: true,
      },
      imageUpload: {
        enabled: true,
        maxSize: 10, // 10MB
        allowedTypes: ['image/jpeg', 'image/png'],
      },
    },
  };
};

export const config = getConfig();

// Helper functions
export const getApiUrl = (endpoint: keyof AppConfig['api']['endpoints']): string => {
  return `${config.api.baseUrl}${config.api.endpoints[endpoint]}`;
};

export const isFashionMode = (): boolean => {
  return true; // Always return true - always fashion mode
};

export const getDefaultImage = (): string => {
  return config.ui.defaultImages.fashion; // Always use fashion image
};
