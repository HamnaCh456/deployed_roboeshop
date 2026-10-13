# RobotEshop — turning the NVIDIA shell into a robotics platform

Design notes for group BSEF23-02, derived from the FYDP proposal
(*RobotEshop — A Unified Web Aggregation Platform for Educational and Industrial Robots*).

## The core mismatch

The NVIDIA blueprint is built for **fashion**: one big lifestyle photo, a chat, and
product cards that show a picture and a name. That works because buying a skirt is
visual and impulsive — the photo *is* the information.

Buying a robot is the opposite. Your proposal is explicit about it: specifications,
platform compatibility, programming tools, price comparison across vendors, verified
sellers, age and skill fit, tutorials. That is a **high-consideration, spec-driven**
purchase.

So a card showing only a photo and a name throws away every differentiator in the
proposal. Renaming "Avanzare" to "RobotEshop" changes nothing. **The customisation
that matters is what the interface shows, not what it is called.**

---

## 1. The product card — highest-impact single change

Right now: photo + name. Proposed:

```
┌────────────────────────────────┐
│  [robot photo]      ✓ VERIFIED │   verified seller badge (objective 4)
├────────────────────────────────┤
│  LEGO MINDSTORMS EV3           │   name
│  Education kit · Ages 10–16    │   category · age fit (objective 5)
│  ▓ Beginner                    │   skill level (objective 5)
│                                │
│  ARDUINO   PYTHON   SCRATCH    │   programming support (objective 2)
│  WIN  LINUX                    │   OS compatibility (objective 7)
│                                │
│  Rs 89,999        ▾ 3 sellers  │   local price + comparison (objective 6)
│  ▶ 12 tutorials                │   the competitor gap you identified
└────────────────────────────────┘
```

One card now carries **six of your objectives**. This is the moment a visitor sees
the page and knows it is for robots, not for clothes.

---

## 2. Fields to introduce

What the scraper should collect and the card/detail view should show.

### Identity
name · brand / manufacturer · model number · category · subcategory · images · summary

### Commerce and availability *(objectives 4, 6)*
price · currency (PKR) · seller name · seller URL · **verified seller** ·
stock status · availability in Pakistan · shipping time · **price history** ·
offer count across sellers

### Hardware *(objective 2)*
degrees of freedom · payload · reach / working envelope · dimensions · weight ·
power source · battery life · motor / actuator type · sensors (camera, lidar,
ultrasonic, IMU, encoders) · connectivity (Wi-Fi, Bluetooth, USB, Ethernet) ·
expansion ports / GPIO

### Software and programming *(objectives 2, 7 — your strongest differentiator)*
supported OS (Windows / Linux / macOS / Android / iOS) · controller platform
(Arduino / Raspberry Pi / micro:bit / proprietary) · **ROS support + version** ·
programming languages (Scratch, Blockly, Python, C++, Java) · required IDE or
toolchain · SDK / API availability · open source

### Audience fit *(objective 5)*
age range · skill level (beginner / intermediate / advanced) · intended use
(education / hobby / research / industrial) · assembly required (kit vs pre-built) ·
curriculum alignment

### Learning resources *(the gap you named in competitor analysis)*
tutorial video links · tutorial count · official documentation · community forum ·
getting-started guide

### Meta
rating · review count · source URL · last scraped

---

## 3. Repurpose the left 40% of the screen

Today it is a static fashion photo that never changes — the biggest wasted area on
the page. Give it three states:

**A — Landing.** What the platform is, and a search bar with real filters.

**B — Spec sheet** (a robot is selected):

```
┌──────────────────────────┐
│  [robot photo]           │
│  LEGO MINDSTORMS EV3     │
│  ────────────────────    │
│  DOF            3        │
│  Sensors        4        │
│  Battery        2 h      │
│  Platform       ARM      │
│  ROS            No       │
│  ────────────────────    │
│  SELLERS                 │
│  Robo.pk     Rs 89,999 ✓ │
│  RoboticPK   Rs 92,500 ✓ │
│  Daraz       Rs 87,000   │
│  ────────────────────    │
│  ▶ Getting started (8m)  │
└──────────────────────────┘
```

**C — Compare** (objective 3): two or three robots side by side, one spec per row,
differences highlighted. This is the feature no Pakistani competitor has.

---

## 4. Category navigation

Replace `BEAUTY AND WELLNESS · FASHION · GROCERY · OFFICE · LIFESTYLE · LAST CALL!`

The proposal splits educational from industrial, so lead with that:

`EDUCATIONAL KITS · HUMANOID · ROBOTIC ARMS · DRONES · MOBILE ROBOTS · PARTS & SENSORS`

Add a filter rail (objective 3): price range, age, skill level, platform
(Arduino / Raspberry Pi / ROS), operating system, brand, verified sellers only.

---

## 5. The assistant

Your competitor analysis says the gap is *"no dedicated AI chatbot exists for helping
users understand and choose programmable robots"*, and that jargon should be explained
in simple terms. Make the assistant visibly do that.

Replace the fashion prompts with:

- "I need a robot to teach 12-year-olds to code"
- "Compare Arduino and Raspberry Pi kits under Rs 50,000"
- "Which robots support ROS 2?"
- "What does 6-axis actually mean?"  ← the jargon-explaining promise
- "Show me tutorials for this robot"

Rename the panel from *Retail Shopping Assistant* to something that states the job,
e.g. **Robot Advisor**.

---

## 6. Visual direction

The current look is NVIDIA's: their green, their logo, a soft rounded fashion feel.
Three concrete moves take it somewhere that belongs to robotics.

**Palette — "datasheet".** Cool technical paper rather than lifestyle white, deep ink
navy instead of black, and industrial signal amber instead of NVIDIA green. Green is
kept as a *semantic* colour only, for verified sellers and in-stock.

| Token | Hex | Use |
|---|---|---|
| Ink | `#101826` | headings, spec values |
| Paper | `#F7F8FA` | page ground |
| Rule | `#D8DEE7` | hairlines, table rules |
| Signal | `#FF8A00` | primary accent, actions |
| Verified | `#1B9E5A` | verified seller, in stock — nothing else |
| Slate | `#5A6678` | secondary text, labels |

**Typography.** Three roles, not one. The mono for every number is what makes a page
read as technical rather than retail.

- Display — **Archivo**, tight and heavy, for headings and product names
- Body — **IBM Plex Sans**, engineering lineage, highly legible
- Data — **IBM Plex Mono** for all prices, model numbers, and spec values

**Signature element — the compatibility strip.** A consistent row of platform badges
(`ARDUINO` `RASPBERRY PI` `ROS 2` `PYTHON` `SCRATCH`) drawn like connector pins,
appearing on every card, spec sheet, and comparison row. It is the one thing the page
is remembered by, and it encodes the exact differentiator in your proposal.

Also tighten the geometry: fashion uses soft 20px radii, technical products use ~8px
and denser spacing.

---

## 7. Before you submit — branding and assets

The running prototype still carries NVIDIA's property:

- The **NVIDIA logo** and the green `#76b900` are NVIDIA's brand
- The **"Avanzare"** name is NVIDIA's fictional store
- The **222 product photos** are NVIDIA's assets under `LICENSE-assets.txt`, and are
  all clothing

None of these should ship in an FYDP deliverable. You need your own robot images and
your own brand. Worth planning early — sourcing product photography for real robots
takes longer than the UI work.

---

## Suggested order

1. Category navigation + brand rename — cheap, immediately stops looking like fashion
2. Product card with the new fields — highest impact per hour
3. Left pane as spec sheet
4. Filter rail
5. Comparison view
6. Visual identity pass (palette, type, badges)
