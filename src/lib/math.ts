// Numeric helpers. Animations are tuned as "per frame at 60 fps"; these convert those rates to the
// real time step so a 144 Hz monitor moves at the same speed as a 60 Hz one.

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const FRAMES_PER_SECOND = 60;
// Longest step taken at once (a hidden tab or a stall would otherwise jump everything)
const MAX_STEP_S = 0.1;

// How many 60 fps frames `dt` seconds are worth (for per-frame amounts)
export const frames = (dt: number) => dt * FRAMES_PER_SECOND;

// Seconds since the previous frame, capped
export const frameStep = (now: number, last: number) => (last ? Math.min(MAX_STEP_S, (now - last) / 1000) : 1 / FRAMES_PER_SECOND);

// Fraction of the remaining distance to cover in `dt`, given the fraction covered per 60 fps frame
export const ease = (perFrame: number, dt: number) => 1 - Math.pow(1 - perFrame, frames(dt));

// Multiplier for a value that decays by `perFrame` each 60 fps frame
export const decay = (perFrame: number, dt: number) => Math.pow(perFrame, frames(dt));
