# Universe statistics

Appended by `npm run stats` (frontend/stats/universeStats.bench.ts). Each entry measures seeds 100000, 42 and 7777 under the six presets, so the effect of every simulation change is recorded. Counts are deterministic; survey times are medians of 5 runs on the machine that ran it and vary between runs.

"Life-bearing planets" includes prebiotic chemistry; "systems with organisms" counts systems with at least one microbial or more advanced world.

## 2026-09-26 · commit 789e4c7 · rules v2

| Preset | Seed | Planets | Life-bearing planets | Systems with organisms | Systems by most advanced stage (micro / multi / complex / dominant) | Civilizations | Survey (ms) |
|---|---:|---:|---:|---:|---|---:|---:|
| Familiar Reality | 100000 | 8713 | 902 | 579 | 98 / 162 / 227 / 92 | 92 | 9.2 |
| Familiar Reality | 42 | 8639 | 927 | 578 | 76 / 177 / 221 / 104 | 94 | 7.4 |
| Familiar Reality | 7777 | 8800 | 960 | 606 | 79 / 178 / 233 / 116 | 109 | 7.3 |
| Slow Cosmos | 100000 | 9096 | 1120 | 722 | 110 / 207 / 288 / 117 | 106 | 7.6 |
| Slow Cosmos | 42 | 9044 | 1172 | 734 | 104 / 237 / 272 / 121 | 111 | 7.8 |
| Slow Cosmos | 7777 | 9210 | 1171 | 770 | 103 / 229 / 304 / 134 | 150 | 8.8 |
| Fragile Life | 100000 | 8713 | 147 | 125 | 22 / 43 / 48 / 12 | 5 | 6.2 |
| Fragile Life | 42 | 8639 | 154 | 137 | 18 / 49 / 51 / 19 | 9 | 6.3 |
| Fragile Life | 7777 | 8800 | 122 | 106 | 15 / 34 / 40 / 17 | 5 | 6.3 |
| Eternal Stars | 100000 | 7939 | 685 | 429 | 61 / 128 / 172 / 68 | 61 | 6.8 |
| Eternal Stars | 42 | 7912 | 724 | 434 | 48 / 124 / 168 / 94 | 76 | 6.5 |
| Eternal Stars | 7777 | 8065 | 729 | 478 | 58 / 144 / 192 / 84 | 80 | 7.1 |
| Rare Intelligence | 100000 | 8713 | 1261 | 701 | 107 / 181 / 286 / 127 | 6 | 7.2 |
| Rare Intelligence | 42 | 8639 | 1253 | 698 | 90 / 211 / 276 / 121 | 7 | 8.3 |
| Rare Intelligence | 7777 | 8800 | 1300 | 714 | 95 / 200 / 272 / 147 | 4 | 7.2 |
| Abundant Life | 100000 | 8215 | 1246 | 623 | 94 / 180 / 255 / 94 | 165 | 7.1 |
| Abundant Life | 42 | 8145 | 1207 | 606 | 83 / 182 / 245 / 96 | 155 | 7.8 |
| Abundant Life | 7777 | 8290 | 1256 | 641 | 74 / 204 / 246 / 117 | 174 | 7.6 |
