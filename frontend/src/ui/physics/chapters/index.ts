// The Physics page's chapters, in reading order.

import type { Chapter } from "../catalogue";
import { foundations } from "./foundations";
import { galaxy } from "./galaxy";
import { stars } from "./stars";
import { bodies, systems } from "./systems";
import { climate, geography, history } from "./surface";

export const CHAPTERS: readonly Chapter[] = [foundations, galaxy, stars, systems, bodies, geography, climate, history];
