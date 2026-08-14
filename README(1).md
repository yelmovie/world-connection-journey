# 세계를 잇는 여행

**World Connection Journey**

A tablet-friendly multicultural learning adventure where students explore world regions through evidence, dialogue, rhythm, route planning, negotiation, and perspective-taking.

> Project status: MVP planning and implementation.

## Overview

**세계를 잇는 여행** is an interactive educational game for upper-elementary and middle-school learners. It is designed to move beyond country-name quizzes, flag memorization, and repetitive card matching.

Students learn by interacting with maps, arranging evidence, drawing routes, rebuilding rhythm patterns, solving planning constraints, comparing consequences, and revising their first decisions. The central learning loop is:

```text
Observe → Find Evidence → Form a Hypothesis → Ask → Listen → Revise
```

The experience is designed for landscape tablets and desktop web browsers, with touch, mouse, and keyboard support.

## Learning Goals

Students are encouraged to:

- distinguish continents, countries, regions, languages, religions, and individual identities;
- separate observable facts from interpretations and unsupported assumptions;
- compare multiple perspectives before making a decision;
- ask respectful questions when information is incomplete;
- listen, summarize, and revise an initial judgment;
- recognize cultural diversity within every continent;
- value evidence, empathy, and reflection over speed.

## Curriculum Alignment

This project is primarily aligned with the 2022 Revised Korean National Curriculum for upper-elementary social studies. The following standards are directly connected to the map exploration, regional inquiry, and sustainability missions.

| 교과 | 성취기준 | 연계 이유 |
|---|---|---|
| 사회 | **[6사09-01]** 세계를 표현하는 다양한 공간 자료의 특징을 이해하고, 지구본과 세계지도에서 위치를 표현하는 방법을 익힌다. | 세계지도 탐색, 국가 위치 찾기 |
| 사회 | **[6사09-02]** 세계 주요 대륙과 대양을 파악하고, 우리나라 및 세계 여러 국가의 위치와 영토의 특징을 이해한다. | 대륙별 여행 경로와 국가 탐색 |
| 사회 | **[6사10-01]** 세계의 여러 지역의 지형 경관을 살펴보고, 이를 통해 다양한 삶의 모습을 이해한다. | 지역 환경과 생활문화 연결 |
| 사회 | **[6사10-02]** 세계의 다양한 기후를 알아보고 기후 환경과 인간 생활 간의 관계를 탐구한다. | 기후·의식주·생활방식 탐구 |
| 사회 | **[6사12-02]** 지구촌을 위협하는 다양한 문제들을 파악하고, 지속 가능한 미래를 위한 해결 방안을 탐색한다. | 환경·공동체 시뮬레이션 |

The alignment describes the intended learning design. Actual achievement of each standard should be confirmed through the implemented missions, learner evidence, and assessment criteria.

## Core Experience

The game contains ten connected pages and five continent missions.

| Page | Screen | Main Interaction |
|---:|---|---|
| 1 | Title | Start a new journey or continue saved progress |
| 2 | World Route Map | Select continent portals and preview travel routes |
| 3 | Travel Passport | Create a privacy-conscious profile and stamp the passport |
| 4 | Asia: Reading a Day | Build timelines, classify evidence, and create respectful questions |
| 5 | Europe: Traces and Today | Connect map nodes and simulate multi-objective travel routes |
| 6 | Africa: A Dialogue of Sound | Rebuild rhythm patterns and create a call-and-response sequence |
| 7 | The Americas: A Shared Day | Arrange schedule blocks and resolve needs, time, and budget constraints |
| 8 | Oceania: Islands and Ocean | Investigate map hotspots and run a three-turn impact simulation |
| 9 | Dialogue Across Differences | Connect clues, navigate dialogue branches, and use an empathy compass |
| 10 | World Connection Completion | Assemble the puzzle globe, reflect, and preview a printable certificate |

## Why This Is a Digital Game

The project uses tablet interaction where it adds real learning value:

- draggable timelines with snap and recovery feedback;
- route drawing and graph-based path comparison;
- an eight-step rhythm sequencer with visual beat support;
- grid-based planning with collision and constraint checks;
- deterministic short-term and long-term consequence simulations;
- branching conversations that respond to the learner's choices;
- checkpoint saving and targeted retries instead of restarting an entire mission.

Cards may present evidence or viewpoints, but they are not the repeated core mechanic. Each mission uses a different interaction model.

## Assessment Model

The shared assessment model prioritizes reasoning and revision.

| Dimension | Weight |
|---|---:|
| Evidence use | 30 |
| Perspective-taking | 25 |
| Respectful communication | 25 |
| Strategy revision | 15 |
| Speed bonus | Up to 5 |

Multiple valid strategies and partial credit are supported. Incorrect attempts should lead to an explanation, a new clue, or a focused retry rather than a simple failure screen.

## Technical Approach

The target architecture separates gameplay, interface, content, and persistence.

- **Phaser 3**: drag interactions, snapping, route drawing, rhythm sequencing, puzzles, and simulations
- **DOM/CSS/SVG**: Korean text, buttons, dialogue, forms, cards, settings, accessibility, and certificates
- **EventBus**: communication between Phaser scenes and the DOM interface
- **Versioned JSON**: missions, checkpoints, scoring rules, source metadata, and asset references
- **Local persistence**: profile, mission checkpoints, stamps, settings, and completion state
- **Optional Three.js**: used only when a real 3D asset or meaningful spatial interaction is available

The MVP should remain fully playable as a 2D or 2.5D experience when GLB assets are unavailable.

## Runtime Responsibilities

```text
Game Shell
├── Phaser Layer        Gameplay and animated interactions
├── DOM UI Layer        Text, controls, dialogue, settings, accessibility
├── Asset Manager       Semantic IDs, lazy loading, fallbacks, cleanup
├── Audio Manager       User-gesture unlock, crossfade, mute, fallback
├── Save Repository     Validation, migration, recovery, checkpoints
├── Mission Engine      Shared mission lifecycle and progression
└── Content Repository  Versioned learning content and source metadata
```

Existing project structures should be preserved when they already provide these responsibilities. The codebase should not be rewritten only to match the diagram.

## Save and Recovery

The preferred save key is:

```text
world_connection_journey.save.v1
```

The save system should provide:

- schema validation and safe defaults;
- backup of corrupted save data before recovery;
- explicit version-to-version migration functions;
- stable IDs instead of array indexes;
- autosave at profile confirmation and mission checkpoints;
- idempotent reward claims;
- safe continuation after refresh, navigation, or interrupted loading.

## Asset Rules

- One generated image must represent one independent asset.
- Do not create collages, contact sheets, or combined asset images.
- Use transparent PNG for isolated characters and icons.
- Keep Korean interface text in HTML/CSS/SVG rather than raster images.
- Use a semantic asset manifest instead of repeating file paths in scene code.
- Preserve original PNG files; create separate optimized WebP files when needed.
- Lazy-load assets by page and release page-specific resources on scene shutdown.
- Treat Meshy reference PNGs as 2D references or fallbacks, not as GLB files.

## Audio Direction

The soundtrack includes one main theme and five stage themes. All themes should share a short four-note **world connection** motif so the project feels musically consistent.

The Oceania stage should use a clear exploration pulse rather than a separate cinematic ending style. The recommended direction is approximately 102 BPM with warm piano, soft marimba or wooden mallets, light acoustic guitar, gentle percussion, rounded bass, airy pads, and subtle wave-like rhythmic texture.

Audio playback must begin only after the first user gesture. Each track should have a browser-compatible fallback format, and every sound-based activity must also provide visual cues.

## Cultural Content Principles

- Do not describe a country or continent as culturally uniform.
- Do not treat nationality as a reliable answer to a greeting-style question.
- Do not identify a culture only through traditional clothing, food, or landmarks.
- Do not connect appearance, language, or clothing with ability or personality.
- Present greetings and daily-life examples as possible examples shaped by region, family, relationship, situation, and personal preference.
- Separate cultural difference from violations of human rights.
- Store source, review date, reviewer, license, and stereotype-risk notes with factual content whenever possible.
- Mark unsupported content as requiring review instead of inventing a source.

## Accessibility

The project targets touch, mouse, and keyboard input.

- Minimum touch target: 44 × 44 CSS pixels
- Recommended major map target: at least 56 CSS pixels
- No hover-only interactions
- Keyboard alternatives for drag-and-drop tasks
- Visible focus indicators
- Text and icon support in addition to color states
- Reduced-motion support
- Visual rhythm and waveform alternatives for audio activities
- Core progress available at 200% browser zoom

## Performance Targets

These are conservative design targets, not guarantees for every device.

- 30 FPS target on lower-end school tablets
- 45–60 FPS target on typical devices
- Initial required download target: 5–8 MB
- Default render pixel ratio: 1.0–1.25, maximum 1.5
- General textures: 512 or 1024 pixels
- Post-processing disabled by default
- Stage-specific lazy loading
- Cleanup of listeners, timers, textures, and audio on scene shutdown
- No continuously running hidden Phaser or Three.js renderer

## Getting Started

Verify the actual scripts in `package.json` before publishing this section. For a standard npm and Vite setup, the expected workflow is:

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
npm run preview
```

Run the quality checks that are available in the repository:

```bash
npm run typecheck
npm run lint
npm run test
```

Do not add missing scripts to the README unless they also exist and run successfully in `package.json`.

## Quality Checklist

Before a release, verify:

- all ten routes load without uncaught errors;
- the complete journey can be played from the title screen to completion;
- each continent uses a distinct core interaction;
- refresh and resume restore the latest checkpoint;
- corrupted and legacy save data do not crash the application;
- direct access to the completion page cannot bypass progression;
- rapid repeated taps do not duplicate scenes, modals, rewards, or audio;
- audio-free fallback play remains possible;
- the layout remains usable at 1920×1080, 1366×768, and 1024×576;
- scene shutdown removes listeners, timers, page-specific textures, and audio;
- production build, lint, type checking, tests, and route smoke tests are recorded.

## Deployment

The project is intended for static web deployment, including GitHub and Vercel workflows. Route rewrites or an equivalent SPA fallback must be configured so direct navigation and refresh work on every page.

Deployment settings must match the repository's actual router and build output. Do not switch routing strategies without checking existing production URLs and saved routes.

## Maintenance

The project is structured for a twelve-month maintenance cycle through:

- locked and reproducible dependencies;
- explicit save migrations;
- versioned learning content;
- semantic asset references;
- deterministic scoring and simulation functions;
- route, save, and reward regression tests;
- quarterly browser, asset, audio, and link checks;
- an annual cultural-content and source review.

This structure reduces failure risk and recovery time, but it does not guarantee that no browser, device, hosting, or dependency issue will occur.

## Repository Metadata

**Recommended repository name**

```text
world-connection-journey
```

**Recommended GitHub description**

```text
A tablet-friendly multicultural learning adventure where students explore world regions through evidence, dialogue, rhythm, route planning, and perspective-taking.
```
